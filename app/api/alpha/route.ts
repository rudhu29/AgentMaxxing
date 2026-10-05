/**
 * MOCK PAID MARKET ALPHA & SENTIMENT API
 *
 * Demonstrates the x402 payment protocol:
 * Requires signed micropayment from the agent's wallet.
 * Costs 0.05 USDC.
 */
import { verifyPayment } from "@/agent/wallet";

const PRICE = "0.05";
const ASSET = "USDC";
const PAY_TO = "0x000000000000000000000000000000000000dEaD"; // API owner's test address

export async function GET(req: Request) {
  const topic = new URL(req.url).searchParams.get("topic") ?? "crypto";

  const payment = await verifyPayment(req.headers.get("X-PAYMENT"));
  if (!payment || payment.to !== PAY_TO || Number(payment.amount) < Number(PRICE)) {
    return Response.json(
      { error: "Payment Required", price: PRICE, asset: ASSET, payTo: PAY_TO },
      { status: 402 }
    );
  }

  // Premium Alpha intelligence payload
  const sentimentScore = Math.floor(65 + Math.random() * 30);
  const sentiments = ["Strongly Bullish", "Bullish", "Moderately Bullish", "Consolidating"];
  const sentiment = sentiments[Math.floor(Math.random() * sentiments.length)];

  return Response.json({
    topic,
    sentiment,
    sentimentScore: `${sentimentScore}/100`,
    insight: `On-chain liquidity for ${topic} indicates positive net accumulation. Smart money inflow detected over last 24h.`,
    signal: "Accumulate / Hold",
    paidBy: payment.from,
    timestamp: new Date().toISOString(),
  });
}
