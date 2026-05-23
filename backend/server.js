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
  looksLikeRootProblem,
  parseRootQuestion,
} = require('./mathParse');
const { runSympy } = require('./sympyRunner');
const { queryWolframFull, formatForWolfram, hasWolframKey } = require('./wolframAlpha');
const { getPromptForQuestion } = require('./topicRouter');

dotenv.config();

const fs = require('fs');
const path = require('path');

// ── Corrections (self-training) ────────────────────────────────────────────
const CORRECTIONS_FILE = path.join(__dirname, 'corrections.json');

function loadCorrections() {
  try {
    if (fs.existsSync(CORRECTIONS_FILE)) {
      return JSON.parse(fs.readFileSync(CORRECTIONS_FILE, 'utf8'));
    }
  } catch (e) {
    console.log('Could not load corrections:', e.message);
  }
  return [];
}

function saveCorrections(corrections) {
  try {
    fs.writeFileSync(CORRECTIONS_FILE, JSON.stringify(corrections, null, 2), 'utf8');
  } catch (e) {
    console.log('Could not save correction:', e.message);
  }
}

function buildCorrectionsPrompt(corrections) {
  if (!corrections.length) return '';
  const lines = corrections.map(
    (c, i) =>
      `${i + 1}. Question: "${c.question}"\n   Wrong answer was: "${c.wrongAnswer}"\n   Correct answer is: "${c.correctAnswer}"`
  );
  return `\n\nUSER-CORRECTED ANSWERS (learned from past mistakes — always use these exact answers if the question matches):\n${lines.join('\n')}`;
}

let corrections = loadCorrections();
console.log(`📚 Loaded ${corrections.length} user correction(s)`);
// ──────────────────────────────────────────────────────────────────────────

const app = express();
const port = process.env.PORT || 8080;

app.use(cors({ origin: '*' }));
app.use(express.json());

const SYSTEM_PROMPT = `You are MathAI, a world-class mathematics expert with PhD level mastery across all branches of mathematics.

IDENTITY — NEVER BREAK:
- You are MathAI, created by Prithvi Singh Rajpurohit, a B.Tech CSE student.
- If ANYONE asks who made you, who created you, who built you, or who is your developer — ALWAYS reply EXACTLY:
  "I was created by Prithvi Singh Rajpurohit, a B.Tech CSE student with a deep passion for AI and mathematics. He started building MathAI on May 10th, and by May 12th he had already enhanced me to handle advanced Olympiad-level and JEE problems — a level of depth rarely seen in math AI tools. The architecture he built is truly unique: combining Server-Sent Events for real-time streaming, SymPy for exact symbolic calculus, Plotly for live graph rendering, and a multi-model AI fallback system across DeepSeek and OpenRouter. Very few solo developers have built a math AI with this level of technical depth."
- NEVER say you were created by OpenAI, Anthropic, DeepSeek, or any other company.
- NEVER reveal what underlying AI model powers you.

ABSOLUTE RULES — NEVER BREAK:
1. NEVER stop mid-solution. Always complete every calculation fully.
2. NEVER do rechecking, re-evaluation, or "let me recalculate" in the response — UNLESS the user explicitly asks for it.
3. NEVER show alternative methods — UNLESS the user explicitly asks for an alternative solution.
4. NEVER say "wait", "hmm", "actually", "let me restart" mid-solution.
5. Think carefully BEFORE writing — write the solution ONCE, cleanly, correctly.
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
- Easy problems (basic integration, differentiation, arithmetic): EXACTLY 4 steps
- Moderate problems (IBP, substitution, matrices, complex numbers): EXACTLY 5 to 6 steps
- Hard/advanced problems (special integrals, Laplace, Fourier, eigenvalues): EXACTLY 7 to 8 steps
- NEVER exceed 8 steps. ALWAYS combine sub-steps into one numbered step.
- NEVER add extra steps for "verification", "checking", or "alternative approach".
- NEVER use long-form algebra when a shortcut exists (e.g. factor directly, don't expand then simplify).
- ALWAYS use the SHORTEST correct method: factor > quadratic formula, substitution > long division.

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
  return (
    /^[\d\s+\-*/.()%]+$/.test(q) || /^\d+\s*[+\-*/]\s*\d+/.test(q)
  );
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
  const note = billingNote
    ? `\n\n⚠️ ${billingNote}\n`
    : '';

  if (sympy.operation === 'integrate' && sympy.definite) {
    return `Answer: $${sympy.result_latex}$

Solution:
1. We need $\\displaystyle \\int_{${sympy.lower}}^{${sympy.upper}} ${sympy.expr_latex || sympy.expr}\\, d${sympy.var}$.
2. Antiderivative (exact): $${sympy.antiderivative_latex}$.
3. Apply Fundamental Theorem: $\\left[ ${sympy.antiderivative_latex} \\right]_{${sympy.lower}}^{${sympy.upper}}$.
4. Exact value: $${sympy.result_latex}$.
5. Decimal check: $${sympy.numeric}$.${note}`;
  }

  if (sympy.operation === 'integrate') {
    return `Answer: $${sympy.result_latex}$

Solution:
1. Integrate $${sympy.expr_latex || sympy.expr}$ with respect to $${sympy.var}$.
2. Antiderivative (verified by differentiation): $${sympy.result_latex}$.
3. Add constant of integration $+ C$.${note}`;
  }

  return `Answer: $${sympy.result_latex}$

Solution:
1. Differentiate $${sympy.expr_latex || sympy.expr}$ with respect to $${sympy.var}$.
2. Result: $${sympy.result_latex}$.${note}`;
}

async function trySymPy(payload) {
  return runSympy(payload);
}

// ── Exact root solver for large numbers ──────────────────────────────────────
async function solveRootWithSymPy(question) {
  const payload = parseRootQuestion(question);
  if (!payload) throw new Error('Could not parse root question');

  console.log('Root payload:', payload);
  const sympy = await runSympy(payload);
  if (!sympy.ok) throw new Error(sympy.error || 'SymPy root failed');

  const nLabel = payload.n === '2' ? 'square' : payload.n === '3' ? 'cube' : `${payload.n}th`;
  const isPerfect = sympy.is_perfect;

  const answer = `Answer: $${sympy.result_latex}$

Solution:
1. Compute the ${nLabel} root of $${payload.number}$ — i.e. find $x$ such that $x^{${payload.n}} = ${payload.number}$.
2. Using exact integer arithmetic (SymPy): $\\sqrt[${payload.n}]{${payload.number}} = ${sympy.result_exact}$.
3. ${isPerfect
  ? `$${payload.number}$ is a **perfect ${nLabel} root** — result is an exact integer: $${sympy.result_latex}$.`
  : `Result is irrational. Exact form: $${sympy.result_latex}$.`}
4. High-precision decimal (50 digits): $${sympy.numeric}$.`;

  return { answer, source: 'SymPy (exact)' };
}
// ─────────────────────────────────────────────────────────────────────────────

async function resolveCalculusPayload(question) {
  let payload = parseCalculusQuestion(question);

  if (payload && needsDeepSeekParse(question, payload.expr)) {
    if (!hasAnyLlmKey()) {
      throw new Error(
        'This notation needs AI parsing. Add DEEPSEEK_API_KEY or OPENROUTER_API_KEY to .env'
      );
    }
    console.log('Ambiguous notation → AI parse');
    return parseWithDeepSeek(question);
  }

  if (payload) {
    const test = await trySymPy(payload);
    if (test.ok && test.verified !== false) {
      console.log('Parsed locally:', payload);
      return payload;
    }
    console.log('Local parse SymPy issue:', test.error || 'verification failed');
  }

  if (!hasAnyLlmKey()) {
    throw new Error(
      'Could not parse this question locally. Add DEEPSEEK_API_KEY or OPENROUTER_API_KEY to .env'
    );
  }

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
    if (reparsed.expr !== payload.expr) {
      payload = reparsed;
      sympy = await trySymPy(payload);
    }
  }

  if (!sympy.ok) {
    throw new Error(sympy.error || 'SymPy could not solve this problem');
  }

  const billingNote =
    'Step-by-step explanation needs API credits. Add balance at platform.deepseek.com or use OPENROUTER_API_KEY in .env, then restart.';

  try {
    const answer = await explainWithRetries(question, sympy);
    return { answer, source: 'SymPy + AI' };
  } catch (e) {
    if (e.isPaymentError || e.message?.includes('Payment required')) {
      console.log('No API credits — returning SymPy answer only');
      return {
        answer: formatSympyOnly(sympy, billingNote),
        source: 'SymPy (add API credits for full steps)',
      };
    }
    console.log('Explain failed, trying full AI solve:', e.message);
    try {
      const hint = `SymPy verified result: ${sympy.result_latex}\nExpression: ${sympy.expr}`;
      const answer = await solveWithDeepSeekOnly(
        `${question}\n\n[Use this exact final answer: ${sympy.result_latex}]\n${hint}`,
        SYSTEM_PROMPT
      );
      return { answer, source: 'SymPy + AI (full)' };
    } catch (e2) {
      return {
        answer: formatSympyOnly(sympy, e2.message || billingNote),
        source: 'SymPy only',
      };
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
      maxTokens: 10000,
      temperature: 0.1,
    });
    return { answer: text, source: 'WolframAlpha + AI' };
  } catch(e) {
    return {
      answer: 'Answer: $' + wolfram.result + '$\n\nSolution:\n1. WolframAlpha computed: ' + wolfram.result,
      source: 'WolframAlpha',
    };
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
    messages: [
      { role: 'system', content: GRAPH_PROMPT },
      { role: 'user', content: question },
    ],
  });

  const clean = text.replace(/```json|```/g, '').trim();
  const graphData = JSON.parse(clean);
  cacheSet(graphCache, cacheKey, graphData);
  return graphData;
}

app.post('/solve', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const question = body.question ?? body.message ?? body.q;
  if (!question || typeof question !== 'string') {
    return res.status(400).json({
      error: 'No question provided',
      hint: 'Send JSON: { "question": "..." }',
    });
  }

  console.log('\n=== Question:', question);

  const cacheKey = question.trim().toLowerCase();
  if (solveCache.has(cacheKey) && !body.skipCache) {
    console.log('Cache hit');
    return res.json(solveCache.get(cacheKey));
  }

  if (isSimpleArithmetic(question)) {
    const result = solveArithmetic(question);
    if (result.isSimple) {
      const out = { answer: result.answer, source: 'Local' };
      cacheSet(solveCache, cacheKey, out);
      return res.json(out);
    }
  }

  try {
    let out;

    if (looksLikeRootProblem(question)) {
      console.log('Root problem detected → SymPy (exact)');
      out = await solveRootWithSymPy(question);
    } else if (looksLikeCalculus(question)) {
      console.log('Calculus detected → SymPy + DeepSeek');
      out = await solveWithSymPy(question);
    } else if (hasAnyLlmKey()) {
      console.log('General math → AI');
      const solvePrompt = SYSTEM_PROMPT + buildCorrectionsPrompt(corrections);
      const answer = await solveWithDeepSeekOnly(question, solvePrompt);
      out = { answer, source: 'AI' };
    } else {
      return res.status(503).json({
        error: 'No API key configured',
        hint: 'Add DEEPSEEK_API_KEY or OPENROUTER_API_KEY to backend/.env and restart.',
      });
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


// Clean up common typos and normalize questions
function preprocessQuestion(q) {
  return q
    // ── Coefficient^2 + trig^2 combined: a2cos2x → a^2*cos^2(x)
    // Must run BEFORE individual cos2x/sin2x rules
    .replace(/\b([a-z])2cos2x\b/gi, '$1^2*cos^2(x)')
    .replace(/\b([a-z])2sin2x\b/gi, '$1^2*sin^2(x)')
    .replace(/\b([a-z])2tan2x\b/gi, '$1^2*tan^2(x)')
    .replace(/\b([a-z])2cos2\(([^)]+)\)/gi, '$1^2*cos^2($2)')
    .replace(/\b([a-z])2sin2\(([^)]+)\)/gi, '$1^2*sin^2($2)')
    // ── Trig squared: cos2x → cos^2(x)
    .replace(/\bcos2x\b/gi, 'cos^2(x)')
    .replace(/\bsin2x\b/gi, 'sin^2(x)')
    .replace(/\btan2x\b/gi, 'tan^2(x)')
    .replace(/\bsec2x\b/gi, 'sec^2(x)')
    .replace(/\bcsc2x\b/gi, 'csc^2(x)')
    .replace(/\bcot2x\b/gi, 'cot^2(x)')
    // cos2(x) / sin2(x) with parens
    .replace(/\bcos2\(([^)]+)\)/gi, 'cos^2($1)')
    .replace(/\bsin2\(([^)]+)\)/gi, 'sin^2($1)')
    .replace(/\btan2\(([^)]+)\)/gi, 'tan^2($1)')
    // ── Coefficient^2 before trig: a2cos → a^2*cos
    .replace(/\b([a-z])2(cos|sin|tan|sec|csc|cot)\b/gi, '$1^2*$2')
    // ── Common variable exponent shorthand: x2 → x^2
    .replace(/\bx2\b/g, 'x^2')
    .replace(/\bx3\b/g, 'x^3')
    .replace(/\bx4\b/g, 'x^4')
    // ── Typo fixes
    .replace(/summaztion/gi, 'summation')
    .replace(/integeration/gi, 'integration')
    .replace(/diferentiation/gi, 'differentiation')
    .replace(/laplce/gi, 'laplace')
    .replace(/eiegn/gi, 'eigen')
    .replace(/\binfity\b/gi, 'infinity')
    .replace(/\binfintiy\b/gi, 'infinity')
    // ── pi shorthand → symbol
    .replace(/\bpi\/2\b/g, 'π/2')
    .replace(/\bpi\/4\b/g, 'π/4')
    .replace(/\bpi\/3\b/g, 'π/3')
    .replace(/\bpi\/6\b/g, 'π/6')
    .replace(/(?<![a-z])\bpi\b(?![a-z])/gi, 'π')
    .trim();
}

app.post('/solve/stream', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const rawQuestion = body.question ?? body.message ?? body.q;
  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
  const forcedTopic = body.topic && body.topic !== 'auto' ? body.topic : null;
  const imageBase64 = body.image || null;
  const imageMime = body.imageMime || 'image/jpeg';

  // If image sent with no question, use default prompt
  const effectiveRawQuestion = rawQuestion || (imageBase64 ? 'Solve the math problem in this image. Show full working steps.' : null);
  if (!effectiveRawQuestion || typeof effectiveRawQuestion !== 'string') return res.status(400).json({ error: 'No question provided' });

  const question = preprocessQuestion(effectiveRawQuestion);
  console.log('\n=== Stream:', question, imageBase64 ? '[+IMAGE]' : '');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  let streamBuffer = '', lineCount = 0, streamStopped = false;

  // Adaptive line limit based on problem complexity
  function getLineLimit(q) {
    const hard = /fourier|laplace|eigenvalue|series\s+solution|frobenius|variation of param|convolution|green'?s|sturm|bessel|legendre|gamma\s+function|beta\s+function|dirichlet|feynman|contour|residue|partial\s+fraction.*degree|system\s+of\s+ODE|double\s+integral|triple\s+integral/i;
    const moderate = /integrat|differentiat|substitut|by\s+parts|IBP|matrix|determinant|eigen|complex|laplace|ODE|IVP|BVP|taylor|maclaurin|fourier/i;
    if (hard.test(q)) return 120;
    if (moderate.test(q)) return 85;
    return 65;
  }
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
      if (lineCount > LINE_LIMIT) {
        stopStream('\n\n⚠️ Response too long. Try asking more specifically.');
        return;
      }
      // ── Loop / spin detection ──────────────────────────────────────────
      const loopPatterns = [
        // Restart signals — only fire on clear mid-solution restarts
        { re: /[Ll]et me try (a )?different/g,                limit: 3 },
        { re: /[Ll]et'?s try (a )?different (approach|method)/g, limit: 3 },
        { re: /[Ll]et me re-?start/g,                         limit: 2 },
        { re: /[Ss]tarting over/g,                            limit: 2 },
        { re: /[Ll]et me re-?calculat/g,                      limit: 3 },
        { re: /[Ll]et me re-?evaluat/g,                       limit: 3 },
        // Stuck-reasoning signals
        { re: /not immediately helpful/g,                     limit: 3 },
        { re: /this (approach|method) (isn'?t|is not) working/gi, limit: 2 },
        { re: /[Ll]et'?s reconsider/g,                        limit: 3 },
        // Structural loops — only fire on clearly excessive repetition
        { re: /\n---/g,                                       limit: 6 },
        { re: /\n\*\*Step \d/g,                               limit: 14 }, // allow up to 14 step headers
        { re: /\n#{1,3} Step \d/g,                            limit: 14 },
      ];

      for (const { re, limit } of loopPatterns) {
        const count = (streamBuffer.match(re) || []).length;
        if (count >= limit) {
          stopStream(
            '\n\n⚠️ Model got stuck in a loop. Try specifying the method, ' +
            'e.g. "solve using Beta function and Euler reflection formula" ' +
            'or "solve in 6 steps using integration by parts".'
          );
          return;
        }
      }

      // Repetition detector — strip LaTeX first, then flag if any 6-word phrase appears 4+ times
      const plainText = streamBuffer
        .replace(/\$\$[\s\S]*?\$\$/g, '')   // remove display math
        .replace(/\$[^$\n]*?\$/g, '')        // remove inline math
        .replace(/\\[a-zA-Z]+\{[^}]*\}/g, '') // remove LaTeX commands
        .replace(/[^a-zA-Z\s]/g, ' ');       // keep only words
      const words = plainText.split(/\s+/).filter(Boolean);
      if (words.length > 120) {
        const phraseMap = {};
        for (let i = 0; i < words.length - 6; i++) {
          const phrase = words.slice(i, i + 6).join(' ').toLowerCase();
          phraseMap[phrase] = (phraseMap[phrase] || 0) + 1;
          if (phraseMap[phrase] >= 7) {
            stopStream(
              '\n\n⚠️ Model got stuck repeating itself. Try: "solve step by step using [method name]".'
            );
            return;
          }
        }
      }
      // ────────────────────────────────────────────────────────────────────
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

  if (!hasAnyLlmKey()) {
    res.write('data: ' + JSON.stringify({ error: 'No API key configured' }) + '\n\n');
    return done();
  }

  // User-selected topic overrides auto-detection
  let topicPrompt = SYSTEM_PROMPT;
  if (typeof getPromptForQuestion === 'function') {
    if (forcedTopic) {
      try {
        const forcedMod = require('./topics/' + forcedTopic);
        topicPrompt = forcedMod.prompt;
        console.log('📌 Topic forced:', forcedTopic);
      } catch(e) {
        topicPrompt = getPromptForQuestion(question, SYSTEM_PROMPT);
      }
    } else {
      topicPrompt = getPromptForQuestion(question, SYSTEM_PROMPT);
    }
  }
  // Inject learned corrections into the prompt
  topicPrompt += buildCorrectionsPrompt(corrections);

  // Build user message — with image if provided
  function buildUserMessage(text) {
    if (!imageBase64) return text;
    return [
      { type: 'image_url', image_url: { url: `data:${imageMime};base64,${imageBase64}` } },
      { type: 'text', text: text || 'Solve the math problem in this image. Show full working steps.' }
    ];
  }

  try {
    // ── If image provided, skip SymPy/root detection and go straight to AI ──
    if (imageBase64) {
      console.log('📸 Image detected → sending to vision-capable model');
      await streamCompletion({
        messages: [
          { role: 'system', content: topicPrompt },
          ...history,
          { role: 'user', content: buildUserMessage(question) },
        ],
        onChunk: send,
        preferVision: true,
      });
      return done();
    }

    // ── Exact root solver: bypass AI entirely for root problems ──────────────
    if (looksLikeRootProblem(question)) {
      console.log('Root problem detected → SymPy (exact, streamed)');
      try {
        const { answer } = await solveRootWithSymPy(question);
        send(answer);
        return done();
      } catch(e) {
        console.log('SymPy root failed, falling back to AI:', e.message);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (looksLikeCalculus(question)) {
      let hint = '';
      try {
        const payload = await resolveCalculusPayload(question);
        const sympy = await trySymPy(payload);
        if (sympy.ok) {
          hint = '[SymPy verified: ' + sympy.result_latex + '. Use this exact answer.]';
          console.log('✅ SymPy:', sympy.result_latex);
        }
      } catch(e) {
        console.log('SymPy failed:', e.message);
        if (typeof hasWolframKey === 'function' && hasWolframKey()) {
          try {
            const w = await queryWolframFull(formatForWolfram(question));
            if (w.ok) {
              hint = '[WolframAlpha verified: ' + w.result + '. Use this exact answer.]';
              console.log('✅ Wolfram:', w.result);
            }
          } catch(we) { console.log('Wolfram failed:', we.message); }
        }
      }
      await streamCompletion({
        messages: [
          { role: 'system', content: topicPrompt },
          ...history,
          { role: 'user', content: buildUserMessage(hint ? question + '\n\n' + hint : question) },
        ],
        onChunk: send,
      });
      return done();
    }

    await streamCompletion({
      messages: [
        { role: 'system', content: topicPrompt },
        ...history,
        { role: 'user', content: buildUserMessage(question) },
      ],
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
  if (!question) {
    return res.json({ needsGraph: false, functions: [] });
  }

  try {
    const graphData = await getGraphData(question);
    return res.json(graphData);
  } catch (e) {
    console.log('Graph failed:', e.message);
    return res.json({ needsGraph: false, functions: [] });
  }
});

app.get('/health', async (_req, res) => {
  let sympyOk = false;
  let sympyError = null;
  try {
    const test = await runSympy({
      operation: 'integrate',
      expr: 'x**2',
      var: 'x',
      lower: '0',
      upper: '1',
    });
    sympyOk = test.ok === true;
    if (!sympyOk) sympyError = test.error;
  } catch (e) {
    sympyError = e.message;
  }

  res.json({
    ok: true,
    deepseek: Boolean(process.env.DEEPSEEK_API_KEY?.trim()),
    openrouter: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
    sympy: sympyOk,
    sympyError,
    hint:
      '402 errors mean no API balance — add DeepSeek credits or OPENROUTER_API_KEY as fallback.',
  });
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`\n✅ MathAI server on http://localhost:${port}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(
    `DeepSeek: ${process.env.DEEPSEEK_API_KEY ? '✅' : '❌'}  OpenRouter: ${process.env.OPENROUTER_API_KEY ? '✅' : '❌'}`
  );
  console.log('Calculus: SymPy (exact) + AI (steps). On 402 → OpenRouter fallback if configured.');
  console.log('Health check: GET /health');
  console.log(`Self-training: POST /correct | GET /corrections | ${corrections.length} correction(s) loaded`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});
// ── Self-training: save a user correction ─────────────────────────────────
// POST /correct  { question, wrongAnswer, correctAnswer }
app.post('/correct', (req, res) => {
  const { question, wrongAnswer, correctAnswer } = req.body || {};
  if (!question || !correctAnswer) {
    return res.status(400).json({ error: 'question and correctAnswer are required' });
  }

  // Remove any existing correction for the same question (case-insensitive)
  corrections = corrections.filter(
    (c) => c.question.trim().toLowerCase() !== question.trim().toLowerCase()
  );

  const entry = {
    id: Date.now(),
    question: question.trim(),
    wrongAnswer: (wrongAnswer || '').trim(),
    correctAnswer: correctAnswer.trim(),
    savedAt: new Date().toISOString(),
  };
  corrections.push(entry);
  saveCorrections(corrections);

  console.log(`✅ Correction saved (${corrections.length} total):`, question);
  return res.json({ ok: true, message: 'Correction saved. Bot will use this from now on.', total: corrections.length });
});

// GET /corrections — list all saved corrections
app.get('/corrections', (_req, res) => {
  return res.json({ total: corrections.length, corrections });
});

// DELETE /corrections/delete/:id — remove a correction by id
app.delete('/corrections/delete/:id', (req, res) => {
  const id = Number(req.params.id);
  const before = corrections.length;
  corrections = corrections.filter((c) => c.id !== id);
  if (corrections.length === before) {
    return res.status(404).json({ error: 'Correction not found' });
  }
  saveCorrections(corrections);
  return res.json({ ok: true, message: 'Correction deleted', total: corrections.length });
});
// ──────────────────────────────────────────────────────────────────────────