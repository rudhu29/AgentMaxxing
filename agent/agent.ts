/**
 * THE AGENT
 *
 * An agent is a loop:
 *   1. Send the chat + the list of tools to Gemini.
 *   2. If Gemini wants to call a tool -> run it, send back the result, repeat.
 *   3. If Gemini answers with text -> done.
 */
import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { tools } from "./tools";

export const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const MAX_STEPS = 5;

const SYSTEM_PROMPT =
  "You are Nexus, an autonomous Web3 research and operations AI agent. " +
  "You hold a dedicated on-chain crypto wallet on Base Sepolia and can execute multi-step workflows across decentralized finance. " +
  "Your capabilities include: " +
  "1. Real-time DEX Market Data & Liquidity depth via DexScreener (get_dex_market_data). " +
  "2. Token Security & Honeypot Risk Audits (audit_token_risk). " +
  "3. Tracking trending boosted tokens across chains (get_trending_tokens). " +
  "4. Live CoinGecko/Coinbase price feeds (get_crypto_price). " +
  "5. Tracking Base Sepolia network gas in real time (get_network_gas). " +
  "6. Autonomous on-chain test ETH transfers on Base Sepolia (transfer_test_eth). " +
  "7. Cryptographically signed research dossiers & statements with ECDSA keys (generate_signed_report, sign_statement). " +
  "8. Fact verification via Wikipedia (search_knowledge) and arithmetic math (calculate). " +
  "9. Autonomous micropayments for paid APIs via the x402 payment protocol (get_weather, get_market_alpha). " +
  "When users ask for token research or risk audits, chain your tools intelligently: inspect DEX liquidity, audit risk parameters, and provide structured insights. " +
  "Execute multi-tool queries in parallel when possible. Always format your responses cleanly with markdown tables, bold key metrics, and concise takeaways.";

export type ChatMessage = { role: "user" | "agent"; text: string };
export type Step = { tool: string; args: unknown; result: unknown; error?: boolean };

export async function runAgent(history: ChatMessage[], ctx: { baseUrl: string }) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const contents: Content[] = history.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.text }],
  }));
  const steps: Step[] = [];

  for (let i = 0; i < MAX_STEPS; i++) {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [
          {
            functionDeclarations: tools.map((t) => ({
              name: t.name,
              description: t.description,
              parametersJsonSchema: t.parameters,
            })),
          },
        ],
      },
    });

    const calls = response.functionCalls ?? [];
    if (calls.length === 0) return { answer: response.text ?? "", steps };

    // Keep Gemini's turn in the history, then run every tool it asked for.
    contents.push(response.candidates![0].content!);
    const results: Part[] = [];

    // Run all requested tools in parallel to minimize response time
    const callExecutions = await Promise.all(
      calls.map(async (call) => {
        const tool = tools.find((t) => t.name === call.name);
        let result: unknown;
        let error = false;
        try {
          if (!tool) throw new Error(`No tool named ${call.name}`);
          result = await tool.run(call.args ?? {}, ctx);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
          error = true;
        }
        return {
          step: { tool: call.name!, args: call.args, result, error },
          part: { functionResponse: { id: call.id, name: call.name, response: { result } } } as Part,
        };
      })
    );

    for (const exec of callExecutions) {
      steps.push(exec.step);
      results.push(exec.part);
    }

    contents.push({ role: "user", parts: results });
  }

  return { answer: "I hit my step limit. Try a simpler question.", steps };
}
