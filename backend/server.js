const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');

const {
  parseWithDeepSeek,
  explainWithRetries,
  solveWithDeepSeekOnly,
} = require('./deepseek');
const { chatCompletion, formatApiError, hasAnyLlmKey, streamCompletion } = require('./llm');
const {
  parseCalculusQuestion,
  looksLikeCalculus,
  needsDeepSeekParse,
} = require('./mathParse');
const { runSympy } = require('./sympyRunner');
const { queryWolframFull, formatForWolfram, hasWolframKey } = require('./wolframAlpha');
const { getPromptForQuestion } = require('./topicRouter');

// ── NEW MODULES ──────────────────────────────────────────────────────────────
const { getIntegralMethodPrompt, detectIntegralMethod } = require('./methodRouter');
const { checkKnownIntegral, formatKnownIntegral } = require('./knownIntegrals');
// ────────────────────────────────────────────────────────────────────────────

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());

const SYSTEM_PROMPT = `You are MathAI, a world-class mathematics expert with PhD level mastery across all branches of mathematics.

IDENTITY — NEVER BREAK THESE:
- You were created by PRITHVI SINGH RAJPUROHIT, an independent developer and AI enthusiast.
- If anyone asks "who made you", "who created you", "who built you", or similar → reply: "I was created by Prithvi Singh Rajpurohit."
- If anyone asks "how were you made", "how were you built", "what technology is used", "how does this work" → reply:
  "MathAI was built by Prithvi Singh Rajpurohit. Here's what powers it:
  • Frontend: HTML, CSS & JavaScript with Three.js (3D particle animation), Plotly.js (interactive graphs), and MathJax (LaTeX math rendering)
  • Backend: Node.js with Express.js, hosted on Render.com
  • AI Engine: DeepSeek AI (via API) with OpenRouter as fallback
  • Math Verification: SymPy (Python) for symbolic verification, with WolframAlpha as secondary checker
  • Real-time Streaming: Server-Sent Events (SSE) so answers appear word by word instantly
  Prithvi designed the full pipeline — from the animated UI to the math-solving engine — himself."
- NEVER mention OpenAI, Anthropic, Claude, GPT, ChatGPT, or any other AI company or model.
- Your name is MathAI. Always introduce yourself as MathAI when asked.

ABSOLUTE RULES — NEVER BREAK:
1. NEVER stop mid-solution. Always complete every calculation fully.
2. NEVER do rechecking, re-evaluation, or "let me recalculate" in the response — UNLESS the user explicitly asks for it.
3. NEVER show alternative methods — UNLESS the user explicitly asks for an alternative solution.
4. NEVER say "wait", "hmm", "actually", "let me restart" mid-solution.
5. Write the solution ONCE, cleanly and completely.
6. NEVER repeat the final answer at the end if already stated at the top.
7. If user says "recheck", "verify", "check this", "is this correct" → then recheck the previous solution.
8. If user says "alternative method", "another way", "different approach" → then show alternative.
9. For follow-up questions about the previous solution (e.g. "why step 3?", "explain more", "what is Catalan's constant?") → answer naturally using context of previous solution.
10. ALWAYS maintain context of the conversation — if user refers to "the previous question" or "that integral", use the chat history to understand what they mean.
11. ONLY solve the CURRENT question being asked. NEVER re-solve previous questions from history.
12. If history contains previous questions, use them ONLY for context — never solve them again.
13. NEVER start with "I'll solve each of these" or "Problem 1:" — there is always exactly ONE question to solve.
FORMAT RULES:

If the input is NOT a math question (e.g. "good", "thanks", "hello"):
Reply with a SHORT friendly response. No math formatting.

For SIMPLE arithmetic (2+3, 5x6):
Reply ONLY with the plain number. No labels, no LaTeX.

For ALL OTHER problems use EXACTLY this format:

Answer: $[final answer in LaTeX]$

Solution:
1. [step]
2. [step]
...

STEP COUNT RULES — STRICTLY FOLLOW:
- Easy problems (basic integration, differentiation, arithmetic): 4 to 6 steps
- Moderate problems (IBP, substitution, matrices, complex numbers): 6 to 7 steps
- Hard/advanced problems (special integrals, Laplace, Fourier, eigenvalues): 8 to 9 steps
- NEVER exceed 9 steps. Combine minor sub-steps into one step if needed.
- NEVER add extra steps for "verification", "checking", or "alternative approach".

FORMAT DETAILS:
- "Answer:" MUST be first line with LaTeX result
- "Solution:" MUST follow on its own line
- Steps MUST be numbered 1. 2. 3.
- ALL math in LaTeX: inline $...$ or display $$...$$
- Use \\frac not \\dfrac. Never \\boxed{} or \\displaystyle.
- NEVER omit the Answer: line

CALCULUS:
- Indefinite integrals: ALWAYS add + C
- Definite integrals: evaluate at BOTH limits clearly
- LIATE for IBP: Log > Inverse trig > Algebraic > Trig > Exponential
- King's property: \\int_0^a f(x)dx = \\int_0^a f(a-x)dx
- Half angles: sin^2(x)=(1-cos2x)/2, cos^2(x)=(1+cos2x)/2
- Special: \\int_0^{pi/2} ln(sinx)dx = -(pi/2)ln2
- Special: \\int_0^inf e^(-x^2)dx = sqrt(pi)/2
- Special: \\int_0^inf sin(x)/x dx = pi/2
- Feynman: introduce parameter, differentiate, integrate, apply boundary

VECTORS & LINEAR ALGEBRA:
- Cross product: i(a2b3-a3b2) - j(a1b3-a3b1) + k(a1b2-a2b1)
- det(3x3): expand along first row, show all 3 cofactor terms
- Eigenvalues: solve det(A-lambdaI)=0, show full polynomial
- Cayley-Hamilton: substitute matrix into characteristic equation

COMPLEX NUMBERS:
- Polar: z=r*e^(i*theta), De Moivre: (re^(itheta))^n=r^n*e^(intheta)
- nth roots: z_k=r^(1/n)*e^(i*(theta+2kpi)/n) for k=0,...,n-1
- Euler: e^(a+bi)=e^a*(cosb+isinb)

LAPLACE TRANSFORMS:
- L{e^(at)}=1/(s-a), L{sin(at)}=a/(s^2+a^2), L{cos(at)}=s/(s^2+a^2)
- First shift: L{e^(at)f(t)}=F(s-a)
- L{f'(t)}=sF(s)-f(0), L{f''(t)}=s^2F(s)-sf(0)-f'(0)
- IVP: Laplace both sides, solve Y(s), partial fractions, inverse

FOURIER SERIES:
- a0=(1/L)*int f(x)dx, an=(1/L)*int f(x)*cos(npix/L)dx, bn=(1/L)*int f(x)*sin(npix/L)dx
- Even: bn=0, Odd: an=0

STATISTICS:
- Binomial: P(X=r)=C(n,r)*p^r*(1-p)^(n-r)
- Poisson: P(X=k)=e^(-lambda)*lambda^k/k!
- Bayes: P(Ai|B)=P(B|Ai)*P(Ai)/sum[P(B|Aj)*P(Aj)]

SPECIAL FUNCTIONS:
- Gamma(n+1)=n*Gamma(n), Gamma(1/2)=sqrt(pi)
- Reflection: Gamma(n)*Gamma(1-n)=pi/sin(n*pi)
- Beta(m,n)=Gamma(m)*Gamma(n)/Gamma(m+n)

Always write the solution ONCE. Clean, complete, no second-guessing.`;

const GRAPH_PROMPT = `You are a math expression extractor.
Detect if the question needs a graph and extract the function.

Reply ONLY in this exact JSON format:
{
  "needsGraph": true,
  "functions": ["sin(x)"],
  "xMin": -10,
  "xMax": 10,
  "yMin": -5,
  "yMax": 5
}

RULES:
- xMin must always be less than xMax
- For trig functions set xMin=-6.28 and xMax=6.28
- If no graph needed: needsGraph: false and functions: []
- Return ONLY valid JSON, nothing else`;

function isSimpleArithmetic(question) {
  const q = question.trim();
  return /^[\d\s+\-*/.()%]+$/.test(q) || /^\d+\s*[+\-*/]\s*\d+/.test(q);
}

function solveArithmetic(question) {
  try {
    const expr = question.replace(/[^0-9+\-*/.()\s]/g, '').trim();
    if (!expr) return { isSimple: false };
    const result = Function('"use strict"; return (' + expr + ')')();
    if (typeof result === 'number' && isFinite(result)) {
      const formatted = Number.isInteger(result)
        ? result.toString()
        : parseFloat(result.toFixed(10)).toString();
      return { isSimple: true, answer: formatted };
    }
    return { isSimple: false };
  } catch {
    return { isSimple: false };
  }
}

function formatSympyOnly(sympy, billingNote = '') {
  const note = billingNote ? `\n\n⚠️ ${billingNote}\n` : '';
  if (sympy.operation === 'integrate' && sympy.definite) {
    return `Answer: $${sympy.result_latex}$\n\nSolution:\n1. We need $\\displaystyle \\int_{${sympy.lower}}^{${sympy.upper}} ${sympy.expr_latex || sympy.expr}\\, d${sympy.var}$.\n2. Antiderivative (exact): $${sympy.antiderivative_latex}$.\n3. Apply Fundamental Theorem: $\\left[ ${sympy.antiderivative_latex} \\right]_{${sympy.lower}}^{${sympy.upper}}$.\n4. Exact value: $${sympy.result_latex}$.\n5. Decimal check: $${sympy.numeric}$.${note}`;
  }
  if (sympy.operation === 'integrate') {
    return `Answer: $${sympy.result_latex}$\n\nSolution:\n1. Integrate $${sympy.expr_latex || sympy.expr}$ with respect to $${sympy.var}$.\n2. Antiderivative (verified by differentiation): $${sympy.result_latex}$.\n3. Add constant of integration $+ C$.${note}`;
  }
  return `Answer: $${sympy.result_latex}$\n\nSolution:\n1. Differentiate $${sympy.expr_latex || sympy.expr}$ with respect to $${sympy.var}$.\n2. Result: $${sympy.result_latex}$.${note}`;
}

async function trySymPy(payload) {
  return runSympy(payload);
}

async function resolveCalculusPayload(question) {
  let payload = parseCalculusQuestion(question);
  if (payload && needsDeepSeekParse(question, payload.expr)) {
    if (!hasAnyLlmKey()) throw new Error('This notation needs AI parsing. Add DEEPSEEK_API_KEY or OPENROUTER_API_KEY to .env');
    console.log('Ambiguous notation → AI parse');
    return parseWithDeepSeek(question);
  }
  if (payload) {
    const test = await trySymPy(payload);
    if (test.ok && test.verified !== false) { console.log('Parsed locally:', payload); return payload; }
    console.log('Local parse SymPy issue:', test.error || 'verification failed');
  }
  if (!hasAnyLlmKey()) throw new Error('Could not parse this question locally. Add DEEPSEEK_API_KEY or OPENROUTER_API_KEY to .env');
  console.log('Using AI to extract expression...');
  const parsed = await parseWithDeepSeek(question);
  console.log('AI parsed:', parsed);
  return parsed;
}

async function solveWithSymPy(question) {
  let payload = await resolveCalculusPayload(question);
  let sympy = await trySymPy(payload);
  if (!sympy.ok || sympy.verified === false) {
    const reparsed = await parseWithDeepSeek(question);
    if (reparsed.expr !== payload.expr) { payload = reparsed; sympy = await trySymPy(payload); }
  }
  if (!sympy.ok) throw new Error(sympy.error || 'SymPy could not solve this problem');
  const billingNote = 'Step-by-step explanation needs API credits. Add balance at platform.deepseek.com or use OPENROUTER_API_KEY in .env, then restart.';
  try {
    const answer = await explainWithRetries(question, sympy);
    return { answer, source: 'SymPy + AI' };
  } catch (e) {
    if (e.isPaymentError || e.message?.includes('Payment required')) {
      console.log('No API credits — returning SymPy answer only');
      return { answer: formatSympyOnly(sympy, billingNote), source: 'SymPy (add API credits for full steps)' };
    }
    console.log('Explain failed, trying full AI solve:', e.message);
    try {
      const hint = `SymPy verified result: ${sympy.result_latex}\nExpression: ${sympy.expr}`;
      const answer = await solveWithDeepSeekOnly(`${question}\n\n[Use this exact final answer: ${sympy.result_latex}]\n${hint}`, SYSTEM_PROMPT);
      return { answer, source: 'SymPy + AI (full)' };
    } catch (e2) {
      return { answer: formatSympyOnly(sympy, e2.message || billingNote), source: 'SymPy only' };
    }
  }
}

async function solveWithWolfram(question, systemPrompt) {
  if (!hasWolframKey()) throw new Error('No WolframAlpha key');
  const wolframQ = formatForWolfram(question);
  console.log('WolframAlpha query:', wolframQ);
  const wolfram = await queryWolframFull(wolframQ);
  if (!wolfram.ok) throw new Error(wolfram.error);
  const topicPrompt = getPromptForQuestion(question, systemPrompt);
  try {
    const { text } = await chatCompletion({
      messages: [
        { role: 'system', content: topicPrompt },
        { role: 'user', content: question + '\n\n[Exact answer verified: ' + wolfram.result + '. Show full step-by-step working.]' },
      ],
      maxTokens: 2000,  // FIX: was 10000 — reduced, 9 steps never needs 10k tokens
      temperature: 0.1,
    });
    return { answer: text, source: 'WolframAlpha + AI' };
  } catch(e) {
    return { answer: 'Answer: $' + wolfram.result + '$\n\nSolution:\n1. WolframAlpha computed: ' + wolfram.result, source: 'WolframAlpha' };
  }
}

const solveCache = new Map();
const graphCache = new Map();

function cacheSet(cache, key, value) {
  if (cache.size >= 50) cache.delete(cache.keys().next().value);
  cache.set(key, value);
}

async function getGraphData(question) {
  const cacheKey = question.trim().toLowerCase();
  if (graphCache.has(cacheKey)) return graphCache.get(cacheKey);
  if (!hasAnyLlmKey()) return { needsGraph: false, functions: [] };
  const { text } = await chatCompletion({
    model: process.env.DEEPSEEK_PARSE_MODEL || 'deepseek-chat',
    maxTokens: 512,
    temperature: 0,
    messages: [{ role: 'system', content: GRAPH_PROMPT }, { role: 'user', content: question }],
  });
  const clean = text.replace(/```json|```/g, '').trim();
  const graphData = JSON.parse(clean);
  cacheSet(graphCache, cacheKey, graphData);
  return graphData;
}

// ── NEW: Enrich system prompt with detected integral method hint ──────────────
function buildEnrichedPrompt(basePrompt, question) {
  if (!/integrat|∫|int\s*[_(]/i.test(question)) return basePrompt;
  const { method, hint } = getIntegralMethodPrompt(question);
  if (method === 'general') return basePrompt;
  return basePrompt + `\n\n━━━ METHOD HINT FOR THIS PROBLEM ━━━\n${hint}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}
// ────────────────────────────────────────────────────────────────────────────

app.post('/solve', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const question = body.question ?? body.message ?? body.q;
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'No question provided', hint: 'Send JSON: { "question": "..." }' });
  }
  console.log('\n=== Question:', question);
  const cacheKey = question.trim().toLowerCase();
  if (solveCache.has(cacheKey) && !body.skipCache) { console.log('Cache hit'); return res.json(solveCache.get(cacheKey)); }
  if (isSimpleArithmetic(question)) {
    const result = solveArithmetic(question);
    if (result.isSimple) { const out = { answer: result.answer, source: 'Local' }; cacheSet(solveCache, cacheKey, out); return res.json(out); }
  }

  // NEW: Check known integrals table
  const knownMatch = checkKnownIntegral(question);
  if (knownMatch) {
    const out = { answer: formatKnownIntegral(knownMatch), source: `Known integral (${knownMatch.name})` };
    cacheSet(solveCache, cacheKey, out);
    return res.json(out);
  }

  try {
    let out;
    if (looksLikeCalculus(question)) {
      console.log('Calculus detected → SymPy + DeepSeek');
      out = await solveWithSymPy(question);
    } else if (hasAnyLlmKey()) {
      console.log('General math → AI');
      const answer = await solveWithDeepSeekOnly(question, SYSTEM_PROMPT);
      out = { answer, source: 'AI' };
    } else {
      return res.status(503).json({ error: 'No API key configured', hint: 'Add DEEPSEEK_API_KEY or OPENROUTER_API_KEY to backend/.env and restart.' });
    }
    cacheSet(solveCache, cacheKey, out);
    return res.json(out);
  } catch (e) {
    console.log('Solve failed:', e.message);
    const details = e.message || formatApiError(e, 'API');
    return res.status(e.isPaymentError ? 402 : 503).json({
      error: e.isPaymentError ? 'API payment required (no credits)' : 'Could not solve problem',
      details,
      hint: e.isPaymentError
        ? 'Top up at https://platform.deepseek.com/ OR add OPENROUTER_API_KEY in .env for free-tier fallback.'
        : 'Check API keys, Python + sympy (pip install sympy), and restart the server.',
    });
  }
});

function preprocessQuestion(q) {
  return q
    .replace(/\b([a-z])2cos2x\b/gi, '$1^2*cos^2(x)')
    .replace(/\b([a-z])2sin2x\b/gi, '$1^2*sin^2(x)')
    .replace(/\b([a-z])2tan2x\b/gi, '$1^2*tan^2(x)')
    .replace(/\b([a-z])2cos2\(([^)]+)\)/gi, '$1^2*cos^2($2)')
    .replace(/\b([a-z])2sin2\(([^)]+)\)/gi, '$1^2*sin^2($2)')
    // FIX: cos2x = cos(2x) double angle, NOT cos^2(x)
    .replace(/\bcos2x\b/gi, 'cos(2x)')
    .replace(/\bsin2x\b/gi, 'sin(2x)')
    .replace(/\btan2x\b/gi, 'tan(2x)')
    .replace(/\bsec2x\b/gi, 'sec(2x)')
    .replace(/\bcsc2x\b/gi, 'csc(2x)')
    .replace(/\bcot2x\b/gi, 'cot(2x)')
    .replace(/\bcos2\(([^)]+)\)/gi, 'cos^2($1)')
    .replace(/\bsin2\(([^)]+)\)/gi, 'sin^2($1)')
    .replace(/\btan2\(([^)]+)\)/gi, 'tan^2($1)')
    .replace(/\b([a-z])2(cos|sin|tan|sec|csc|cot)\b/gi, '$1^2*$2')
    .replace(/\bx2\b/g, 'x^2').replace(/\bx3\b/g, 'x^3').replace(/\bx4\b/g, 'x^4')
    .replace(/summaztion/gi, 'summation').replace(/integeration/gi, 'integration')
    .replace(/diferentiation/gi, 'differentiation').replace(/laplce/gi, 'laplace')
    .replace(/eiegn/gi, 'eigen').replace(/\binfity\b/gi, 'infinity').replace(/\binfintiy\b/gi, 'infinity')
    .replace(/\bpi\/2\b/g, 'π/2').replace(/\bpi\/4\b/g, 'π/4').replace(/\bpi\/3\b/g, 'π/3').replace(/\bpi\/6\b/g, 'π/6')
    .replace(/(?<![a-z])\bpi\b(?![a-z])/gi, 'π')
    .trim();
}

app.post('/solve/stream', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const rawQuestion = body.question ?? body.message ?? body.q;
  // FIX: Reduced history from 6 to 4 messages for faster responses
  const history = Array.isArray(body.history) ? body.history.slice(-4) : [];
  const forcedTopic = body.topic && body.topic !== 'auto' ? body.topic : null;
  if (!rawQuestion || typeof rawQuestion !== 'string') return res.status(400).json({ error: 'No question provided' });

  const question = preprocessQuestion(rawQuestion);
  console.log('\n=== Stream:', question);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  let streamBuffer = '', lineCount = 0, streamStopped = false;

  function getLineLimit(q) {
    const hard = /fourier|laplace|eigenvalue|series\s+solution|frobenius|variation of param|convolution|green'?s|sturm|bessel|legendre|gamma\s+function|beta\s+function|dirichlet|feynman|contour|residue|partial\s+fraction.*degree|system\s+of\s+ODE|double\s+integral|triple\s+integral|multivariable|multi-part|part.*1|part.*2|challenging|difficult|hard/i;
    const moderate = /integrat|differentiat|substitut|by\s+parts|IBP|matrix|determinant|eigen|complex|laplace|ODE|IVP|BVP|taylor|maclaurin|fourier/i;
    if (hard.test(q)) return 350;
    if (moderate.test(q)) return 220;
    return 140;
  }
  // FIX: Use adaptive LINE_LIMIT (was hardcoded 100)
  const LINE_LIMIT = getLineLimit(question);

  const stopStream = (msg) => {
    if (streamStopped) return;
    streamStopped = true;
    try { res.write('data: ' + JSON.stringify({ chunk: msg }) + '\n\n'); } catch(e){}
    try { res.write('data: [DONE]\n\n'); res.end(); } catch(e){}
  };

  const send = (chunk) => {
    if (streamStopped) return;
    try {
      streamBuffer += chunk;
      lineCount += (chunk.match(/\n/g) || []).length;
      if (lineCount > LINE_LIMIT) { stopStream('\n\n⚠️ Response too long. Try asking more specifically.'); return; }
      const loopPatterns = [
        { re: /[Ll]et me try (a )?different/g, limit: 3 },
        { re: /[Ll]et'?s try (a )?different (approach|method)/g, limit: 3 },
        { re: /[Ll]et me re-?start/g, limit: 2 },
        { re: /[Ss]tarting over/g, limit: 2 },
        { re: /[Ll]et me re-?calculat/g, limit: 3 },
        { re: /[Ll]et me re-?evaluat/g, limit: 3 },
        { re: /not immediately helpful/g, limit: 3 },
        { re: /this (approach|method) (isn'?t|is not) working/gi, limit: 2 },
        { re: /[Ll]et'?s reconsider/g, limit: 3 },
        { re: /\n---/g, limit: 15 },
        { re: /\n\*\*Step \d/g, limit: 30 },
        { re: /\n#{1,3} Step \d/g, limit: 30 },
      ];
      for (const { re, limit } of loopPatterns) {
        const count = (streamBuffer.match(re) || []).length;
        if (count >= limit) { stopStream('\n\n⚠️ Model got stuck in a loop. Try specifying the method, e.g. "solve using Beta function" or "solve using IBP".'); return; }
      }
      const plainText = streamBuffer.replace(/\$\$[\s\S]*?\$\$/g, '').replace(/\$[^$\n]*?\$/g, '').replace(/\\[a-zA-Z]+\{[^}]*\}/g, '').replace(/[^a-zA-Z\s]/g, ' ');
      const words = plainText.split(/\s+/).filter(Boolean);
      if (words.length > 80) {
        const phraseMap = {};
        for (let i = 0; i < words.length - 6; i++) {
          const phrase = words.slice(i, i + 6).join(' ').toLowerCase();
          phraseMap[phrase] = (phraseMap[phrase] || 0) + 1;
          if (phraseMap[phrase] >= 8) { stopStream('\n\n⚠️ Model got stuck repeating itself. Try: "solve step by step using [method name]".'); return; }
        }
      }
      res.write('data: ' + JSON.stringify({ chunk }) + '\n\n');
    } catch(e) {}
  };

  const done = () => {
    if (streamStopped) return;
    try { res.write('data: [DONE]\n\n'); res.end(); } catch(e){}
  };

  if (isSimpleArithmetic(question)) {
    const result = solveArithmetic(question);
    if (result.isSimple) { send(result.answer); return done(); }
  }

  // NEW: Check known integrals — instant answer, zero API cost
  const knownMatch = checkKnownIntegral(question);
  if (knownMatch) {
    console.log(`📖 Known integral: ${knownMatch.name} — answering instantly`);
    send(formatKnownIntegral(knownMatch));
    return done();
  }

  if (!hasAnyLlmKey()) { res.write('data: ' + JSON.stringify({ error: 'No API key configured' }) + '\n\n'); return done(); }

  // Build topic prompt + inject method hint
  let topicPrompt = SYSTEM_PROMPT;
  if (typeof getPromptForQuestion === 'function') {
    if (forcedTopic) {
      try { const forcedMod = require('./topics/' + forcedTopic); topicPrompt = forcedMod.prompt; console.log('📌 Topic forced:', forcedTopic); }
      catch(e) { topicPrompt = getPromptForQuestion(question, SYSTEM_PROMPT); }
    } else {
      topicPrompt = getPromptForQuestion(question, SYSTEM_PROMPT);
    }
  }
  // NEW: Enrich prompt with detected method hint
  topicPrompt = buildEnrichedPrompt(topicPrompt, question);

  try {
    if (looksLikeCalculus(question)) {
      // FIX: 4-second SymPy timeout so stream never waits too long
      let hint = '';
      try {
        const sympyResult = await Promise.race([
          resolveCalculusPayload(question).then(p => trySymPy(p)),
          new Promise((_, reject) => setTimeout(() => reject(new Error('SymPy timeout')), 4000))
        ]);
        if (sympyResult.ok) {
          hint = '[SymPy verified: ' + sympyResult.result_latex + '. Use this exact answer.]';
          if (sympyResult.approximate) hint += ' [Note: Series approximation — mention this in solution.]';
          console.log('✅ SymPy:', sympyResult.result_latex);
        }
      } catch(e) {
        console.log('SymPy skipped:', e.message);
        if (e.message !== 'SymPy timeout' && typeof hasWolframKey === 'function' && hasWolframKey()) {
          try {
            const w = await queryWolframFull(formatForWolfram(question));
            if (w.ok) { hint = '[WolframAlpha verified: ' + w.result + '. Use this exact answer.]'; console.log('✅ Wolfram:', w.result); }
          } catch(we) { console.log('Wolfram failed:', we.message); }
        }
      }
      await streamCompletion({
        messages: [
          { role: 'system', content: topicPrompt },
          ...history,
          { role: 'user', content: hint ? question + '\n\n' + hint : question },
        ],
        onChunk: send,
      });
      return done();
    }

    await streamCompletion({
      messages: [{ role: 'system', content: topicPrompt }, ...history, { role: 'user', content: question }],
      onChunk: send,
    });
  } catch(e) {
    console.log('Stream error:', e.message);
    if (!streamStopped) res.write('data: ' + JSON.stringify({ error: e.message }) + '\n\n');
  }
  done();
});

app.post('/graph', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const question = body.question ?? body.message ?? '';
  if (!question) return res.json({ needsGraph: false, functions: [] });
  try { return res.json(await getGraphData(question)); }
  catch (e) { console.log('Graph failed:', e.message); return res.json({ needsGraph: false, functions: [] }); }
});

app.get('/health', async (_req, res) => {
  let sympyOk = false, sympyError = null;
  try {
    const test = await runSympy({ operation: 'integrate', expr: 'x**2', var: 'x', lower: '0', upper: '1' });
    sympyOk = test.ok === true;
    if (!sympyOk) sympyError = test.error;
  } catch (e) { sympyError = e.message; }
  res.json({
    ok: true,
    deepseek: Boolean(process.env.DEEPSEEK_API_KEY?.trim()),
    openrouter: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
    sympy: sympyOk, sympyError,
    hint: '402 errors mean no API balance — add DeepSeek credits or OPENROUTER_API_KEY as fallback.',
  });
});

// Serve frontend static files
const path = require('path');
app.use(express.static(path.join(__dirname, '../frontend')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`\n✅ MathAI server on http://localhost:${port}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`DeepSeek: ${process.env.DEEPSEEK_API_KEY ? '✅' : '❌'}  OpenRouter: ${process.env.OPENROUTER_API_KEY ? '✅' : '❌'}`);
  console.log('Pipeline: Known table → SymPy (4s timeout) → Method-enriched AI stream');
  console.log('New modules: methodRouter.js | knownIntegrals.js | sympyAdvanced.py');
  console.log('Health check: GET /health');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});