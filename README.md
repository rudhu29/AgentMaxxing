# Nexus Agent: Autonomous AI Research & Web3 Agent

An autonomous AI agent powered by **Google Gemini** and **Viem**, built with the **Agentmaxxing** starter kit. Nexus is equipped with its own non-custodial crypto wallet on **Base Sepolia**, enabling it to autonomously query live market data, inspect on-chain network metrics, cryptographically sign verification statements, search encyclopedic knowledge, and purchase paid API access via the **x402 HTTP micropayment protocol**.

---

## 🚀 Live Agent & Architecture Highlights

- **Autonomous Agent Loop:** Multi-turn ReAct loop leveraging Gemini function declarations to plan, call tools, inspect results, and synthesize context-aware answers.
- **x402 Micropayment Protocol:** The agent detects HTTP `402 Payment Required` responses, signs a cryptographic payment message with its private key, and resubmits requests with `X-PAYMENT` authentication headers without user intervention.
- **Base Sepolia Testnet Wallet:** Persistent ECDSA wallet management with direct RPC queries for on-chain gas prices and ETH balances.
- **Multi-Source Tool Ecosystem:** Real-time cryptocurrency prices, live network gas metrics, Wikipedia knowledge lookups, math evaluation, and cryptographic message signing.

---

## 🛠️ Integrated Agent Tools

| Tool Name | Type | Cost | Description |
| :--- | :--- | :--- | :--- |
| `get_weather` | Paid API (x402) | 0.01 USDC | Fetches current weather data via autonomous wallet payment signature. |
| `get_market_alpha` | Paid API (x402) | 0.05 USDC | Accesses exclusive on-chain market intelligence and sentiment analysis. |
| `get_crypto_price` | Live Web API | Free | Real-time prices and 24h % change for any coin (BTC, ETH, SOL, etc.) via CoinGecko. |
| `get_network_gas` | Web3 RPC | Free | Live gas price directly from Base Sepolia testnet using Viem. |
| `sign_statement` | Web3 Crypto | Free | Cryptographically signs arbitrary text/claims using the agent's private key. |
| `search_knowledge` | Live Web API | Free | Retrieves factual overviews and definitions from Wikipedia. |
| `get_my_wallet` | Web3 Wallet | Free | Retrieves the agent's Base Sepolia address and current ETH balance. |
| `calculate` | Computation | Free | Evaluates mathematical expressions and percentages safely. |
| `roll_dice` | Simulation | Free | Generates verifiable random rolls for games or probabilistic decisions. |

---

## 🧠 What I Learned & Experimented With (Week 1 Submission)

1. **AI Agents vs. Chatbots:** Traditional chatbots only respond statically with pre-trained weights. An AI agent is a dynamic decision-making loop: the model inspects user intent, selects external functions, analyzes runtime tool responses, and autonomously decides whether to take further actions before replying.
2. **The x402 Micropayment Flow:** Built an autonomous HTTP payment loop where APIs issue a 402 challenge with recipient and fee data. The agent cryptographically signs the transaction payload using its private key and provides an `X-PAYMENT` header to unlock data without credit cards or API keys.
3. **On-Chain Integration with Viem:** Integrated Base Sepolia testnet RPC queries to fetch live gas prices (`getGasPrice`) and generate ECDSA message signatures (`signMessage`) directly within the agent runtime.
4. **Tool Schema Engineering:** Explored how clear tool descriptions and structured JSON Schemas steer Gemini to intelligently select between free tools, paid tools, and calculation utilities.

---

## 📋 Prerequisites

- **Node.js**: v20 or newer (`node -v`)
- **Google Gemini API Key**: Free at [Google AI Studio](https://aistudio.google.com/apikey)

---

## ⚡ Quick Start Guide

### 1. Clone & Install

```bash
git clone <your-repository-url>
cd AgentMaxxing
npm install
```

### 2. Configure Environment Variables

Create or update `.env` in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-flash-latest
```

### 3. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Create the Agent Wallet

1. On the web dashboard, click **"Create wallet"** in the Setup panel.
2. The agent generates a new private key saved locally in `.agent-wallet.json` (git-ignored for security).
3. The dashboard displays the wallet address, Base Sepolia explorer link, and testnet faucets.

### 5. Test Sample Prompts

Click any of the quick-action prompts in the UI or ask:
- *"What is the live price of Bitcoin and Ethereum?"*
- *"Unlock premium market alpha on DeFi"* (triggers x402 0.05 USDC payment)
- *"What is the current gas price on Base Sepolia?"*
- *"What's the weather in Mumbai?"* (triggers x402 0.01 USDC payment)
- *"Sign a verification statement: 'Nexus Agent Online'"*

---

## 📁 Repository Structure

```
├── agent/
│   ├── agent.ts         # Agent loop with Gemini function calling & max-step guard
│   ├── tools.ts         # Tool definitions, schemas, and execution handlers
│   └── wallet.ts        # Viem wallet client, x402 payment signing & verification
├── app/
│   ├── api/
│   │   ├── agent/       # Agent execution endpoint
│   │   ├── alpha/       # Paid x402 Market Alpha API (0.05 USDC)
│   │   ├── wallet/      # Wallet status & creation endpoint
│   │   └── weather/     # Paid x402 Weather API (0.01 USDC)
│   ├── globals.css      # Agentmaxxing dark theme styling
│   ├── layout.tsx       # Root layout
│   └── page.tsx         # Main interactive dashboard and chat interface
├── components/          # Reusable UI components
├── .env.example         # Environment template
└── package.json         # Scripts and dependencies
```

---

## 🚢 Deployment

To deploy on [Vercel](https://vercel.com):
1. Push this repository to GitHub.
2. Import the project in Vercel.
3. Add the `GEMINI_API_KEY` environment variable in Vercel project settings.
4. Deploy!

---

## 📄 License

MIT
