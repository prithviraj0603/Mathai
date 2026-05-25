# ⚛ MathAI — Quantum Mech + Maths AI

> Built by **Prithvi Singh Rajpurohit**

An intelligent AI assistant for **Mathematics** and **Quantum Mechanics / Physics**, with a beautiful 3D particle UI, real-time streaming, SymPy verification, and strict mode switching.

---

## 🗂 Project Structure

```
mathai/
├── backend/
│   ├── server.js              ← Express server, API routing
│   ├── deepseek.js            ← DeepSeek AI integration
│   ├── llm.js                 ← LLM abstraction (DeepSeek + OpenRouter)
│   ├── mathParse.js           ← Calculus question parser
│   ├── sympyRunner.js         ← Python SymPy subprocess runner
│   ├── wolframAlpha.js        ← WolframAlpha integration
│   ├── topicRouter.js         ← Mode router (math vs quantum)
│   ├── methodRouter.js        ← Integral method detector
│   ├── knownIntegrals.js      ← Instant known integral answers
│   └── topics/
│       └── quantum.js         ← Full quantum/physics system prompt
├── frontend/
│   └── index.html             ← Full UI (Three.js, MathJax, mode switcher)
├── .env                       ← API keys (never commit this!)
├── .gitignore
├── package.json
└── README.md
```

---

## 🚀 Quick Deploy

### 1. Clone & Install
```bash
git clone https://github.com/YOUR_USERNAME/mathai.git
cd mathai
npm install
```

### 2. Set Environment Variables
```bash
cp .env.example .env
# Edit .env and add your keys
```

### 3. Run Locally
```bash
node backend/server.js
# Open http://localhost:3000
```

---

## ☁️ Deploy to Render.com

1. Push to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your repo
4. Set:
   - **Build Command:** `npm install`
   - **Start Command:** `node backend/server.js`
5. Add environment variables in Render dashboard
6. Deploy ✅

---

## 🔑 Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DEEPSEEK_API_KEY` | ✅ | Primary AI engine |
| `OPENROUTER_API_KEY` | Optional | Fallback AI |
| `WOLFRAM_APP_ID` | Optional | Math verification |
| `PORT` | Optional | Default: 3000 |

---

## ✨ Features

- **∑ Maths Mode** — Algebra, Calculus, Linear Algebra, Laplace, Fourier, Statistics
- **⚛ Quantum Mech Mode** — Quantum mechanics, Classical physics, EM, Relativity, Nuclear
- Strict mode guard — wrong-mode questions blocked with one-click switch
- Real-time SSE streaming — answers appear word by word
- SymPy verification — symbolic math checked before answering
- WolframAlpha fallback verification
- 3D morphing particle backgrounds (Three.js)
- LaTeX rendering (MathJax)
- Interactive graphs (Plotly.js)
- Swipe card conversation history

---

## 📄 License

MIT — Built by Prithvi Singh Rajpurohit