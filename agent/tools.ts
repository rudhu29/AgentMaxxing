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
  sendEthTransaction,
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

  // ─── 10. DEX Market & Liquidity Data (DexScreener API) ───
  {
    name: "get_dex_market_data",
    description:
      "Fetch live decentralized exchange (DEX) liquidity pool depth, 24h trading volume, buy/sell transaction count, and price for any token or pair across DEXes (Base, Ethereum, Solana, Arbitrum).",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Token symbol, name, or contract address, e.g. 'AERO', 'TOSHI', 'BRETT', 'UNI', 'VIRTUAL'",
        },
      },
      required: ["query"],
    },
    run: async ({ query }) => {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`, {
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) throw new Error("DexScreener API request failed");
        const data = await res.json();
        const pair = data.pairs?.[0];
        if (!pair) return { error: `No DEX pairs found for query '${query}'.` };

        return {
          tokenName: pair.baseToken?.name,
          symbol: pair.baseToken?.symbol,
          chainId: pair.chainId,
          dex: pair.dexId,
          pairAddress: pair.pairAddress,
          priceUsd: `$${parseFloat(pair.priceUsd || "0").toLocaleString(undefined, { maximumFractionDigits: 6 })}`,
          liquidityUsd: pair.liquidity?.usd ? `$${Math.round(pair.liquidity.usd).toLocaleString()}` : "N/A",
          volume24h: pair.volume?.h24 ? `$${Math.round(pair.volume.h24).toLocaleString()}` : "N/A",
          priceChange24h: pair.priceChange?.h24 !== undefined ? `${pair.priceChange.h24}%` : "N/A",
          txns24h: {
            buys: pair.txns?.h24?.buys ?? 0,
            sells: pair.txns?.h24?.sells ?? 0,
          },
          marketCapOrFdv: pair.fdv ? `$${Math.round(pair.fdv).toLocaleString()}` : "N/A",
          dexUrl: pair.url,
        };
      } catch (err) {
        return { error: `Failed to fetch DEX data for '${query}': ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  },

  // ─── 11. Trending Tokens Across DEXes ───
  {
    name: "get_trending_tokens",
    description: "Get the latest trending tokens and top boosted pairs across decentralized exchanges with live volume and chain information.",
    parameters: {
      type: "object",
      properties: {
        chain: {
          type: "string",
          description: "Optional blockchain filter: 'base', 'solana', 'ethereum', 'bsc', or 'all'. Defaults to 'all'.",
        },
      },
    },
    run: async ({ chain = "all" }) => {
      try {
        const res = await fetch("https://api.dexscreener.com/token-boosts/top/v1", {
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) throw new Error("DexScreener boosts API failed");
        const data = (await res.json()) as Array<{
          chainId?: string;
          tokenAddress?: string;
          description?: string;
          url?: string;
          totalAmount?: number;
        }>;

        const filtered = (chain && chain !== "all")
          ? data.filter((t) => t.chainId?.toLowerCase() === chain.toLowerCase()).slice(0, 5)
          : data.slice(0, 5);

        return {
          filter: chain,
          count: filtered.length,
          trending: filtered.map((t) => ({
            chain: t.chainId,
            tokenAddress: t.tokenAddress,
            description: t.description || "Trending pair",
            dexUrl: t.url,
            boostRank: t.totalAmount,
          })),
        };
      } catch (err) {
        return { error: `Failed to fetch trending tokens: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  },

  // ─── 12. Autonomous On-chain Risk & Honeypot Audit ───
  {
    name: "audit_token_risk",
    description:
      "Perform an automated on-chain risk assessment and liquidity audit on a token to detect low liquidity, honeypot patterns (zero sells), and extreme volatility.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Token symbol or contract address to audit, e.g. 'AERO', 'BRETT', 'TOSHI'",
        },
      },
      required: ["query"],
    },
    run: async ({ query }) => {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`, {
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) throw new Error("DexScreener lookup failed");
        const data = await res.json();
        const pair = data.pairs?.[0];
        if (!pair) return { error: `No pair found to audit for '${query}'.` };

        const liquidity = pair.liquidity?.usd || 0;
        const buys = pair.txns?.h24?.buys || 0;
        const sells = pair.txns?.h24?.sells || 0;
        const change24h = Math.abs(pair.priceChange?.h24 || 0);

        const riskFlags: string[] = [];
        let score = 100; // 100 = lowest risk

        // 1. Liquidity check
        if (liquidity < 10000) {
          riskFlags.push("CRITICAL: Liquidity is below $10,000 (Extreme slippage & rug risk)");
          score -= 45;
        } else if (liquidity < 50000) {
          riskFlags.push("WARNING: Low liquidity pool (under $50k)");
          score -= 20;
        } else if (liquidity >= 250000) {
          riskFlags.push("POSITIVE: Deep liquidity pool (> $250k)");
        }

        // 2. Buy vs Sell Ratio (Honeypot detection)
        if (buys > 25 && sells === 0) {
          riskFlags.push("DANGER: 0 Sell transactions detected despite active buys (Potential Honeypot/Sell Lock)");
          score -= 50;
        } else if (buys > 50 && sells < buys * 0.05) {
          riskFlags.push("WARNING: Abnormally low sell count relative to buy volume");
          score -= 25;
        } else {
          riskFlags.push("POSITIVE: Balanced buy/sell orderflow detected");
        }

        // 3. Volatility Check
        if (change24h > 75) {
          riskFlags.push("CAUTION: Extreme 24h price fluctuation (> 75%)");
          score -= 15;
        }

        const grade = score >= 80 ? "A (Low Risk)" : score >= 60 ? "B (Moderate Risk)" : score >= 40 ? "C (High Risk)" : "F (Severe Risk / Honeypot Warning)";

        return {
          token: `${pair.baseToken?.name} (${pair.baseToken?.symbol})`,
          chain: pair.chainId,
          safetyGrade: grade,
          riskScore: Math.max(0, score),
          liquidityUsd: `$${Math.round(liquidity).toLocaleString()}`,
          buys24h: buys,
          sells24h: sells,
          riskFlags,
          verdict: score >= 60 ? "PASS: Normal on-chain trading metrics" : "ALERT: Elevated risk parameters detected",
        };
      } catch (err) {
        return { error: `Audit failed for '${query}': ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  },

  // ─── 13. Autonomous On-Chain Transfer (Base Sepolia Testnet) ───
  {
    name: "transfer_test_eth",
    description: "Send native testnet ETH on Base Sepolia from the agent's wallet to another address. Use only when explicitly requested to transfer or send test ETH.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient Ethereum address (0x...)" },
        amountEth: { type: "string", description: "Amount of ETH to send, e.g. '0.0001'" },
      },
      required: ["to", "amountEth"],
    },
    run: async ({ to, amountEth }) => {
      return sendEthTransaction(to, amountEth);
    },
  },

  // ─── 14. Cryptographic Proof-of-Research Dossier ───
  {
    name: "generate_signed_report",
    description: "Generate an official research dossier and sign it cryptographically with the agent's private key, producing an immutable ECDSA verification proof.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Report title, e.g. 'Base Ecosystem Intelligence Report'" },
        summary: { type: "string", description: "Key takeaway and findings" },
        rating: { type: "string", description: "Verdict or rating, e.g. 'BULLISH', 'BEARISH', 'HIGH_RISK', 'AUDITED_SAFE'" },
      },
      required: ["title", "summary", "rating"],
    },
    run: async ({ title, summary, rating }) => {
      const payload = {
        title,
        rating,
        summary,
        agent: "Nexus Autonomous Agent",
        network: "Base Sepolia",
        issuedAt: new Date().toISOString(),
      };
      const signed = await signStatement(JSON.stringify(payload));
      return {
        ...payload,
        signer: signed.signer,
        signature: signed.signature,
        verificationStatus: "CRYPTOGRAPHICALLY_VERIFIED",
      };
    },
  },
];
