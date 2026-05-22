const { chatCompletion } = require('./llm');

const PARSE_PROMPT = `You convert math questions into SymPy Python syntax.
Reply with ONLY valid JSON (no markdown):
{"operation":"integrate"|"diff","expr":"sympy expression","var":"x","lower":number|null,"upper":number|null}

CRITICAL parsing rules:
- sin(cot(x)) NOT sin*cot*x — always use explicit parentheses for ALL functions
- sin inverse(cot(x)) → asin(cot(x))
- cotx → cot(x), sinx → sin(x)
- Use asin, acos, atan, acot (not "sin inverse")
- Use ** for powers, sqrt() for roots, pi for π
- Indefinite integral: lower and upper must be null
- Definite: set lower and upper numbers`;

const EXPLAIN_PROMPT = `You are an expert calculus teacher writing a clean, concise exam solution.

SymPy has already computed the CORRECT final answer. Derive it step by step — do NOT question or re-interpret the problem.

STRICT REQUIREMENTS:
- Exactly 5 to 8 numbered steps. Never more than 8.
- Each step: one clear action only. No commentary, no "alternatively", no "perhaps".
- NEVER say "maybe the problem meant..." or question the input — solve it as given.
- Use LaTeX for every formula: inline $...$ for short expressions, $$...$$ for display.
- BANNED: \\left and \\right — do NOT use them at all. Use plain ( ) [ ] { } instead.
- NEVER write \\left( or \\right) or \\left[ or \\right] anywhere in your response.
- Use \\frac{a}{b} not \\left(\\frac{a}{b}\\right).
- Copy the final Answer LaTeX EXACTLY as given — do not modify it.
- Do not add extra explanation after step 8. Stop cleanly.

OUTPUT FORMAT (exactly this, nothing else):

Answer: $[paste the given Answer LaTeX exactly]$

Solution:
1. [step]
2. [step]
3. [step]
4. [step]
5. [step]`;

// Fix bad LaTeX: remove unmatched \left and \right
function sanitizeLatex(text) {
  if (!text) return text;
  // Remove \left and \right — they cause MathJax errors when unmatched
  return text
    .replace(/\\left\s*\(/g, '(')
    .replace(/\\right\s*\)/g, ')')
    .replace(/\\left\s*\[/g, '[')
    .replace(/\\right\s*\]/g, ']')
    .replace(/\\left\s*/g, '')
    .replace(/\\right\s*/g, '');
}

function hasProperSolution(text) {
  if (!text || text.length < 200) return false;
  const steps = text.match(/^\s*\d+\.\s/gm);
  return steps && steps.length >= 4 && /Solution:/i.test(text) && /Answer:/i.test(text);
}

async function parseWithDeepSeek(question) {
  const { text: raw } = await chatCompletion({
    model: process.env.DEEPSEEK_PARSE_MODEL || 'deepseek-chat',
    maxTokens: 512,
    temperature: 0,
    messages: [
      { role: 'system', content: PARSE_PROMPT },
      { role: 'user', content: question },
    ],
  });

  const clean = raw.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);
  if (!parsed.expr || !parsed.operation) {
    throw new Error('AI parse missing expr or operation');
  }
  if (parsed.lower === null) delete parsed.lower;
  if (parsed.upper === null) delete parsed.upper;
  return parsed;
}

function buildExplainUserMessage(question, sympy) {
  const lines = [
    `Student question (verbatim): ${question}`,
    `Parsed integrand/expression (SymPy): ${sympy.expr}`,
    `Pretty LaTeX of expression: $${sympy.expr_latex || sympy.expr}$`,
    `Variable: ${sympy.var}`,
  ];

  if (sympy.operation === 'integrate' && sympy.definite) {
    lines.push(`Type: definite integral from ${sympy.lower} to ${sympy.upper}`);
    lines.push(`CORRECT final Answer LaTeX (copy exactly): ${sympy.result_latex}`);
    lines.push(`Exact symbolic result: ${sympy.result}`);
    lines.push(`Decimal check: ${sympy.numeric}`);
    lines.push(`Antiderivative (SymPy): ${sympy.antiderivative}`);
    lines.push(`Antiderivative LaTeX: ${sympy.antiderivative_latex}`);
    lines.push(
      'Show substitution (e.g. u = 1+x), find antiderivative, apply limits, simplify to the CORRECT final Answer.'
    );
  } else if (sympy.operation === 'integrate') {
    lines.push('Type: indefinite integral (+ C)');
    lines.push(`CORRECT final Answer LaTeX (copy exactly): ${sympy.result_latex}`);
    lines.push(`Exact result: ${sympy.result}`);
    lines.push(
      'Show full working: rewrite integrand, substitution or parts, integrate, back-substitute, add + C.'
    );
  } else {
    lines.push('Type: derivative');
    lines.push(`CORRECT final Answer LaTeX: ${sympy.result_latex}`);
    lines.push(`Exact: ${sympy.result}`);
  }

  return lines.join('\n');
}

async function explainWithDeepSeek(question, sympy, model) {
  const { text: answer } = await chatCompletion({
    model: model || process.env.DEEPSEEK_MODEL || 'deepseek-reasoner',
    maxTokens: 8000,
    temperature: 0.2,
    messages: [
      { role: 'system', content: EXPLAIN_PROMPT },
      { role: 'user', content: buildExplainUserMessage(question, sympy) },
    ],
  });

  const clean = sanitizeLatex(answer);
  if (!hasProperSolution(clean)) {
    throw new Error('Explanation too short or missing numbered steps');
  }
  return clean;
}

async function explainWithRetries(question, sympy) {
  const models = [
    process.env.DEEPSEEK_MODEL || 'deepseek-reasoner',
    'deepseek-chat',
  ];
  const errors = [];

  for (const model of models) {
    try {
      console.log(`Explaining with ${model}...`);
      return await explainWithDeepSeek(question, sympy, model);
    } catch (e) {
      errors.push(`${model}: ${e.message}`);
      console.log(`Explain failed (${model}):`, e.message);
      if (e.isPaymentError) throw e;
    }
  }

  throw new Error(errors.join(' | '));
}

async function solveWithDeepSeekOnly(question, systemPrompt) {
  const { text } = await chatCompletion({
    model: process.env.DEEPSEEK_MODEL || 'deepseek-reasoner',
    maxTokens: 8000,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ],
  });
  return sanitizeLatex(text);
}

module.exports = {
  parseWithDeepSeek,
  explainWithDeepSeek,
  explainWithRetries,
  solveWithDeepSeekOnly,
  hasProperSolution,
};