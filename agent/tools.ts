/**
 * YOUR AGENT'S TOOLS
 *
 * A tool is just a function the agent is allowed to call.
 * Gemini reads the `description` to decide WHEN to use it,
 * and `parameters` to know WHAT to pass in.
 */
import {
  getNetworkGasPrice,
  getWalletAddress,
  getWalletBalance,
  payAndFetch,
  signStatement,
} from "./wallet";

export type Tool = {
  name: string;
  description: string;
  /** JSON Schema describing the inputs. */
  parameters: object;
  /** The code that runs when the agent calls this tool. */
  run: (args: any, ctx: { baseUrl: string }) => Promise<unknown>;
};

export const tools: Tool[] = [
  // ─── 1. Paid API: Weather (0.01 USDC) ───
  {
    name: "get_weather",
    description: "Get current weather for any city. Costs 0.01 USDC, paid automatically with the agent's wallet.",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "City name, e.g. Tokyo, Mumbai, London" },
      },
      required: ["city"],
    },
    run: async ({ city }, { baseUrl }) => {
      return payAndFetch(`${baseUrl}/api/weather?city=${encodeURIComponent(city)}`);
    },
  },

  // ─── 2. Paid API: Market Alpha & Sentiment (0.05 USDC) ───
  {
    name: "get_market_alpha",
    description:
      "Access premium AI on-chain intelligence and sentiment analysis for a crypto sector or token. Costs 0.05 USDC, paid automatically with the agent's wallet via x402.",
    parameters: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "Crypto topic, sector, or token to analyze, e.g. 'ethereum', 'defi', 'solana', 'layer2'",
        },
      },
      required: ["topic"],
    },
    run: async ({ topic = "crypto" }, { baseUrl }) => {
      return payAndFetch(`${baseUrl}/api/alpha?topic=${encodeURIComponent(topic)}`);
    },
  },

  // ─── 3. Real-time Crypto Price Tool (Fast Multi-Source API) ───
  {
    name: "get_crypto_price",
    description: "Fetch live cryptocurrency price in USD and 24-hour percentage change.",
    parameters: {
      type: "object",
      properties: {
        coinId: {
          type: "string",
          description: "Coin name or symbol, e.g. 'bitcoin', 'ethereum', 'solana', 'dogecoin', 'btc', 'eth'",
        },
      },
      required: ["coinId"],
    },
    run: async ({ coinId }) => {
      const id = String(coinId).toLowerCase().trim();
      const symbolMap: Record<string, string> = {
        btc: "bitcoin",
        eth: "ethereum",
        sol: "solana",
        doge: "dogecoin",
        xrp: "ripple",
        ada: "cardano",
      };
      const cleanId = symbolMap[id] || id;

      // 1. Try CoinGecko with 3s timeout
      try {
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(cleanId)}&vs_currencies=usd&include_24hr_change=true`,
          { signal: AbortSignal.timeout(3000) }
        );
        if (res.ok) {
          const data = await res.json();
          if (data[cleanId]?.usd !== undefined) {
            return {
              coin: cleanId,
              priceUsd: `$${data[cleanId].usd.toLocaleString()}`,
              change24h: data[cleanId].usd_24h_change !== undefined ? `${data[cleanId].usd_24h_change.toFixed(2)}%` : "N/A",
              source: "CoinGecko",
            };
          }
        }
      } catch {
        // Fallback on timeout or rate limit
      }

      // 2. High-speed fallback to Coinbase spot price
      try {
        const pair =
          cleanId === "bitcoin" || cleanId === "btc"
            ? "BTC-USD"
            : cleanId === "ethereum" || cleanId === "eth"
            ? "ETH-USD"
            : cleanId === "solana" || cleanId === "sol"
            ? "SOL-USD"
            : null;

        if (pair) {
          const cbRes = await fetch(`https://api.coinbase.com/v2/prices/${pair}/spot`, {
            signal: AbortSignal.timeout(2500),
          });
          if (cbRes.ok) {
            const cbData = await cbRes.json();
            const price = parseFloat(cbData.data?.amount);
            if (!isNaN(price)) {
              return {
                coin: cleanId,
                priceUsd: `$${price.toLocaleString()}`,
                change24h: "Live",
                source: "Coinbase",
              };
            }
          }
        }
      } catch {
        // Fallback failed
      }

      return {
        error: `Could not retrieve live price for '${cleanId}'.`,
      };
    },
  },

  // ─── 4. On-chain Gas Tracker (Base Sepolia via Viem RPC) ───
  {
    name: "get_network_gas",
    description: "Get real-time gas price on the Base Sepolia testnet using the connected Viem RPC client.",
    parameters: { type: "object", properties: {} },
    run: async () => ({
      network: "Base Sepolia (testnet)",
      gasPrice: await getNetworkGasPrice(),
      timestamp: new Date().toISOString(),
    }),
  },

  // ─── 5. Cryptographic Message Signer ───
  {
    name: "sign_statement",
    description: "Sign any text or statement cryptographically using the agent's private key (ECDSA signature).",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "The message to sign" },
      },
      required: ["message"],
    },
    run: async ({ message }) => {
      return signStatement(message);
    },
  },

  // ─── 6. Knowledge & Research Tool (Wikipedia REST API) ───
  {
    name: "search_knowledge",
    description: "Search Wikipedia for factual summaries, definitions, historical facts, and overviews of concepts.",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "The subject or concept to look up, e.g. 'Ethereum', 'Smart contract'" },
      },
      required: ["topic"],
    },
    run: async ({ topic }) => {
      const cleanTopic = encodeURIComponent(String(topic).trim().replace(/\s+/g, "_"));
      try {
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${cleanTopic}`, {
          signal: AbortSignal.timeout(3500),
        });
        if (!res.ok) {
          return { error: `No Wikipedia summary found for '${topic}'.` };
        }
        const data = await res.json();
        return {
          title: data.title,
          description: data.description,
          summary: data.extract,
          pageUrl: data.content_urls?.desktop?.page,
        };
      } catch {
        return { error: `Wikipedia lookup timed out for '${topic}'.` };
      }
    },
  },

  // ─── 7. Agent Wallet Information ───
  {
    name: "get_my_wallet",
    description: "Get the agent's own wallet address and its ETH balance on Base Sepolia (testnet).",
    parameters: { type: "object", properties: {} },
    run: async () => ({
      address: getWalletAddress(),
      balance: await getWalletBalance(),
      network: "Base Sepolia (testnet)",
    }),
  },

  // ─── 8. Calculator / Math Evaluator ───
  {
    name: "calculate",
    description: "Evaluate a mathematical expression (supports +, -, *, /, %, parenthesis).",
    parameters: {
      type: "object",
      properties: {
        expression: { type: "string", description: "The arithmetic expression to evaluate, e.g. '(150 * 3) + 45'" },
      },
      required: ["expression"],
    },
    run: async ({ expression }) => {
      const sanitized = String(expression).replace(/[^0-9+\-*/().%^ ]/g, "");
      try {
        const fn = new Function(`"use strict"; return (${sanitized})`);
        const result = fn();
        return { expression: sanitized, result: Number(result) };
      } catch {
        return { error: `Could not evaluate expression: ${expression}` };
      }
    },
  },

  // ─── 9. Simulation / Dice Roll ───
  {
    name: "roll_dice",
    description: "Roll a dice with the given number of sides (default 6).",
    parameters: {
      type: "object",
      properties: {
        sides: { type: "number", description: "Number of sides on the dice. Default 6." },
      },
    },
    run: async ({ sides = 6 }) => ({
      rolled: Math.floor(Math.random() * sides) + 1,
      sides,
    }),
  },
];
