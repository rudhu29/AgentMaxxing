/**
 * THE AGENT'S WALLET
 *
 * The agent owns a wallet (a private key). It uses it to sign payments,
 * so it can pay for APIs on its own. This is the "x402" idea:
 *
 *   1. Agent calls an API         ->  API answers "402 Payment Required" + a price
 *   2. Agent signs a payment      ->  with its wallet
 *   3. Agent retries with payment ->  API checks the signature and answers 200 OK
 *
 * You create the wallet with the "Create wallet" button on the page.
 * It is saved in `.agent-wallet.json` so it survives restarts.
 *
 * Payments here are signed but NOT sent on-chain (it's a demo, no real money).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { createPublicClient, formatEther, formatGwei, http, verifyMessage, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

function getWalletFilePath() {
  if (process.env.WALLET_FILE_PATH) return process.env.WALLET_FILE_PATH;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join(os.tmpdir(), ".agent-wallet.json");
  }
  return path.join(process.cwd(), ".agent-wallet.json");
}

const chain = createPublicClient({
  chain: baseSepolia,
  transport: http(undefined, { timeout: 3500, retryCount: 1 }),
});

export type Payment = { from: Address; to: Address; amount: string; asset: string; resource: string; nonce: string };

let memoryKey: Hex | null = null;

/** The wallet from .env, memory, or .agent-wallet.json, or null if none was created yet. */
function loadAccount() {
  const envKey = process.env.WALLET_PRIVATE_KEY;
  if (envKey) return privateKeyToAccount(envKey as Hex);
  if (memoryKey) return privateKeyToAccount(memoryKey);

  const walletFile = getWalletFilePath();
  if (fs.existsSync(/*turbopackIgnore: true*/ walletFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ walletFile, "utf8"));
      if (data?.privateKey) return privateKeyToAccount(data.privateKey as Hex);
    } catch {
      // ignore corrupt or unreadable file
    }
  }
  return null;
}

function requireAccount() {
  const account = loadAccount();
  if (!account) throw new Error("The agent has no wallet yet. Ask the user to click 'Create wallet' first.");
  return account;
}

/** Make a brand new wallet and save it. */
export function createWallet() {
  const existing = loadAccount();
  if (existing) return existing.address;

  const privateKey = generatePrivateKey();
  memoryKey = privateKey;
  try {
    const walletFile = getWalletFilePath();
    fs.writeFileSync(walletFile, JSON.stringify({ privateKey }, null, 2));
  } catch (err) {
    console.warn("Could not save wallet file to disk (read-only filesystem), keeping in memory:", err);
  }
  return privateKeyToAccount(privateKey).address;
}

export function getWalletAddress() {
  return loadAccount()?.address ?? null;
}

export async function getWalletBalance() {
  try {
    const wei = await chain.getBalance({ address: requireAccount().address });
    return `${formatEther(wei)} ETH`;
  } catch {
    return "0 ETH";
  }
}

/** Fetch real-time gas price on Base Sepolia */
export async function getNetworkGasPrice() {
  try {
    const priceWei = await chain.getGasPrice();
    return `${formatGwei(priceWei)} gwei`;
  } catch {
    return "0.001 gwei (est.)";
  }
}

/** Cryptographically sign a message using the agent's wallet private key */
export async function signStatement(message: string) {
  const account = requireAccount();
  const signature = await account.signMessage({ message });
  return {
    signer: account.address,
    message,
    signature,
    timestamp: new Date().toISOString(),
  };
}

/** Fetch a URL. If it asks for payment (402), sign one with the wallet and try again. */
export async function payAndFetch(url: string) {
  const first = await fetch(url);
  if (first.status !== 402) return { data: await first.json() };

  const account = requireAccount();
  const { price, asset, payTo } = await first.json();
  const payment: Payment = {
    from: account.address,
    to: payTo,
    amount: price,
    asset,
    resource: new URL(url).pathname,
    nonce: crypto.randomUUID(),
  };
  const signature = await account.signMessage({ message: JSON.stringify(payment) });
  const header = Buffer.from(JSON.stringify({ payment, signature })).toString("base64");

  const paid = await fetch(url, { headers: { "X-PAYMENT": header } });
  return {
    data: await paid.json(),
    payment: { status: paid.status, amount: `${price} ${asset}`, to: payTo, signature: `${signature.slice(0, 18)}...` },
  };
}

/** Used by the API: is this X-PAYMENT header a real, signed payment? */
export async function verifyPayment(header: string | null) {
  if (!header) return null;
  try {
    const { payment, signature } = JSON.parse(Buffer.from(header, "base64").toString()) as {
      payment: Payment;
      signature: Hex;
    };
    const valid = await verifyMessage({ address: payment.from, message: JSON.stringify(payment), signature });
    return valid ? payment : null;
  } catch {
    return null;
  }
}
