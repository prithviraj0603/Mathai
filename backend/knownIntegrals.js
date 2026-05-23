/**
 * knownIntegrals.js
 * Lookup table of famous/classic integrals with exact closed-form answers.
 * Checked BEFORE hitting SymPy or AI — gives instant, zero-cost exact answers.
 */

const KNOWN_INTEGRALS = [
  // ── Gaussian / Error function ────────────────────────────────────────────
  {
    id: 'gaussian_half',
    patterns: [/int.*e\^?\(?-\s*x\^?2\)?.*0.*inf/i, /∫.*e\^?\(?-x²\)?.*0.*∞/i],
    result_latex: '\\frac{\\sqrt{\\pi}}{2}',
    result_numeric: '0.8862...',
    name: 'Gaussian integral (half)',
    hint: 'This is the half Gaussian integral. The full integral ∫_{-∞}^{∞} e^{-x²}dx = √π.',
    solution: `Answer: $\\frac{\\sqrt{\\pi}}{2}$

Solution:
1. Let $I = \\int_0^{\\infty} e^{-x^2}\\, dx$. Consider $I^2 = \\int_0^{\\infty}\\int_0^{\\infty} e^{-(x^2+y^2)}\\, dx\\, dy$.
2. Convert to polar coordinates: $x = r\\cos\\theta$, $y = r\\sin\\theta$, $dA = r\\,dr\\,d\\theta$.
3. $I^2 = \\int_0^{\\pi/2}\\int_0^{\\infty} e^{-r^2} r\\, dr\\, d\\theta = \\frac{\\pi}{2} \\cdot \\frac{1}{2} = \\frac{\\pi}{4}$.
4. Therefore $I = \\sqrt{\\frac{\\pi}{4}} = \\frac{\\sqrt{\\pi}}{2}$.`,
  },

  {
    id: 'gaussian_full',
    patterns: [/int.*e\^?\(?-\s*x\^?2\)?.*-inf.*inf/i, /∫.*e\^?\(?-x²\)?.*-∞.*∞/i],
    result_latex: '\\sqrt{\\pi}',
    result_numeric: '1.7724...',
    name: 'Gaussian integral (full)',
    solution: `Answer: $\\sqrt{\\pi}$

Solution:
1. Let $I = \\int_{-\\infty}^{\\infty} e^{-x^2}\\, dx$. By symmetry, $I = 2\\int_0^{\\infty} e^{-x^2}\\, dx$.
2. Consider $I^2 = \\int_{-\\infty}^{\\infty}\\int_{-\\infty}^{\\infty} e^{-(x^2+y^2)}\\, dx\\, dy$.
3. Convert to polar: $I^2 = \\int_0^{2\\pi}\\int_0^{\\infty} e^{-r^2} r\\, dr\\, d\\theta = 2\\pi \\cdot \\frac{1}{2} = \\pi$.
4. Therefore $I = \\sqrt{\\pi}$.`,
  },

  // ── Dirichlet integral ───────────────────────────────────────────────────
  {
    id: 'dirichlet',
    patterns: [/int.*sin\(?x\)?\/x.*0.*inf/i, /int.*sinc/i, /∫.*sin\(x\)\/x.*0.*∞/i],
    result_latex: '\\frac{\\pi}{2}',
    result_numeric: '1.5707...',
    name: 'Dirichlet integral',
    solution: `Answer: $\\frac{\\pi}{2}$

Solution:
1. Let $I(a) = \\int_0^{\\infty} \\frac{\\sin x}{x} e^{-ax}\\, dx$ (Feynman parameter $a \\geq 0$).
2. Differentiate: $I'(a) = -\\int_0^{\\infty} \\sin(x)\\, e^{-ax}\\, dx = -\\frac{1}{1+a^2}$.
3. Integrate back: $I(a) = -\\arctan(a) + C$.
4. Boundary condition: $I(\\infty) = 0 \\Rightarrow C = \\frac{\\pi}{2}$.
5. At $a = 0$: $I(0) = \\frac{\\pi}{2}$.`,
  },

  // ── Ahmed's integral ─────────────────────────────────────────────────────
  {
    id: 'ahmed',
    patterns: [/int.*arctan.*sqrt.*5.*0.*1/i, /ahmed/i],
    result_latex: '\\frac{5\\pi^2}{96}',
    result_numeric: '0.5149...',
    name: "Ahmed's integral",
    solution: `Answer: $\\frac{5\\pi^2}{96}$

Solution:
1. Ahmed's integral: $\\int_0^1 \\frac{\\arctan(\\sqrt{x^2+2})}{(x^2+1)\\sqrt{x^2+2}}\\, dx$.
2. Introduce Feynman parameter and differentiate under the integral sign.
3. After differentiating and simplifying, obtain a tractable integral.
4. Integrate and apply boundary conditions to recover $\\frac{5\\pi^2}{96}$.`,
  },

  // ── ln(sin) integral ─────────────────────────────────────────────────────
  {
    id: 'ln_sin',
    patterns: [/int.*ln.*sin.*0.*pi\/?2/i, /int.*log.*sin.*0.*pi\/?2/i, /∫.*ln\(sin/i],
    result_latex: '-\\frac{\\pi}{2}\\ln 2',
    result_numeric: '-1.0888...',
    name: 'ln(sin) integral',
    solution: `Answer: $-\\frac{\\pi}{2}\\ln 2$

Solution:
1. Let $I = \\int_0^{\\pi/2} \\ln(\\sin x)\\, dx$.
2. By King's property: $I = \\int_0^{\\pi/2} \\ln(\\cos x)\\, dx$.
3. Add: $2I = \\int_0^{\\pi/2} \\ln(\\sin x \\cos x)\\, dx = \\int_0^{\\pi/2} \\ln\\left(\\frac{\\sin 2x}{2}\\right)\\, dx$.
4. Split: $2I = \\int_0^{\\pi/2} \\ln(\\sin 2x)\\, dx - \\frac{\\pi}{2}\\ln 2$.
5. Substitute $u=2x$: $\\int_0^{\\pi/2} \\ln(\\sin 2x)\\, dx = I$, so $2I = I - \\frac{\\pi}{2}\\ln 2$.
6. Therefore $I = -\\frac{\\pi}{2}\\ln 2$.`,
  },

  // ── ln(cos) integral ─────────────────────────────────────────────────────
  {
    id: 'ln_cos',
    patterns: [/int.*ln.*cos.*0.*pi\/?2/i, /int.*log.*cos.*0.*pi\/?2/i],
    result_latex: '-\\frac{\\pi}{2}\\ln 2',
    result_numeric: '-1.0888...',
    name: 'ln(cos) integral',
    solution: `Answer: $-\\frac{\\pi}{2}\\ln 2$

Solution:
1. Let $I = \\int_0^{\\pi/2} \\ln(\\cos x)\\, dx$.
2. By King's property with $x \\to \\frac{\\pi}{2} - x$: $I = \\int_0^{\\pi/2} \\ln(\\sin x)\\, dx$.
3. Both are equal to $-\\frac{\\pi}{2}\\ln 2$ (the classic ln(sin) result).`,
  },

  // ── Basel-related: ∫₀^∞ x/(eˣ−1) ──────────────────────────────────────
  {
    id: 'bose_einstein',
    patterns: [/int.*x.*e\^?x\s*-\s*1.*0.*inf/i, /∫.*x\/(e\^x-1).*0.*∞/i],
    result_latex: '\\frac{\\pi^2}{6}',
    result_numeric: '1.6449...',
    name: 'Bose-Einstein type integral',
    solution: `Answer: $\\frac{\\pi^2}{6}$

Solution:
1. $\\int_0^{\\infty} \\frac{x}{e^x - 1}\\, dx = \\int_0^{\\infty} x \\sum_{n=1}^{\\infty} e^{-nx}\\, dx$.
2. Interchange sum and integral (justified by monotone convergence).
3. Each term: $\\int_0^{\\infty} x e^{-nx}\\, dx = \\frac{1}{n^2}$ (using Gamma function).
4. Sum: $\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}$ (Basel problem result).`,
  },

  // ── Wallis product integral ──────────────────────────────────────────────
  {
    id: 'wallis_sin_even',
    patterns: [/int.*sin\^?\(?2n\)?.*0.*pi\/?2/i, /wallis.*sin/i],
    result_latex: '\\frac{\\pi}{2} \\cdot \\frac{(2n-1)!!}{(2n)!!}',
    result_numeric: 'depends on n',
    name: 'Wallis integral (even power)',
    solution: `Answer: $\\frac{(2n-1)!!}{(2n)!!} \\cdot \\frac{\\pi}{2}$

Solution:
1. Use reduction formula: $I_n = \\int_0^{\\pi/2} \\sin^{2n}(x)\\, dx = \\frac{2n-1}{2n} I_{n-1}$.
2. Base case: $I_0 = \\frac{\\pi}{2}$.
3. Unroll: $I_n = \\frac{(2n-1)(2n-3)\\cdots 3\\cdot 1}{(2n)(2n-2)\\cdots 4\\cdot 2} \\cdot \\frac{\\pi}{2} = \\frac{(2n-1)!!}{(2n)!!} \\cdot \\frac{\\pi}{2}$.`,
  },

  // ── ∫₀^∞ e^(-x²)·x^n ───────────────────────────────────────────────────
  {
    id: 'gamma_type',
    patterns: [/int.*x\^?n.*e\^?\(?-\s*x\)?.*0.*inf/i, /int.*e\^?\(?-x\)?.*x\^?[a-z].*0.*inf/i],
    result_latex: '\\Gamma(n+1)',
    result_numeric: 'n! for integer n',
    name: 'Gamma function definition',
    solution: `Answer: $\\Gamma(n+1) = n!$ (for integer $n$)

Solution:
1. By definition: $\\Gamma(n+1) = \\int_0^{\\infty} x^n e^{-x}\\, dx$.
2. Use IBP: $\\int_0^{\\infty} x^n e^{-x}\\, dx = n \\int_0^{\\infty} x^{n-1} e^{-x}\\, dx = n\\,\\Gamma(n)$.
3. Since $\\Gamma(1) = 1$ and $\\Gamma(n+1) = n\\,\\Gamma(n)$, we get $\\Gamma(n+1) = n!$.`,
  },

  // ── ∫₀^1 xⁿ·ln(x) ──────────────────────────────────────────────────────
  {
    id: 'x_ln_x',
    patterns: [/int.*x\^?[nm].*ln\(?x\)?.*0.*1/i, /∫.*xⁿ.*ln.*0.*1/i],
    result_latex: '-\\frac{1}{(n+1)^2}',
    result_numeric: 'depends on n',
    name: 'Power-log integral',
    solution: `Answer: $-\\frac{1}{(n+1)^2}$

Solution:
1. $\\int_0^1 x^n \\ln(x)\\, dx$. Use IBP: $u = \\ln x$, $dv = x^n dx$.
2. $du = \\frac{1}{x}dx$, $v = \\frac{x^{n+1}}{n+1}$.
3. $= \\left[\\frac{x^{n+1}\\ln x}{n+1}\\right]_0^1 - \\int_0^1 \\frac{x^n}{n+1}\\, dx$.
4. First term: at $x=1$: $0$; at $x=0$: $\\lim_{x\\to 0^+} x^{n+1}\\ln x = 0$ (for $n > -1$).
5. Second term: $-\\frac{1}{n+1} \\cdot \\frac{1}{n+1} = -\\frac{1}{(n+1)^2}$.`,
  },

  // ── ∫₀^π x·sin(x)/(1+cos²x) ────────────────────────────────────────────
  {
    id: 'x_sin_cos2',
    patterns: [/int.*x.*sin.*1\s*\+\s*cos\^?2.*0.*pi/i],
    result_latex: '\\frac{\\pi^2}{4}',
    result_numeric: '2.4674...',
    name: 'Classic King property integral',
    solution: `Answer: $\\frac{\\pi^2}{4}$

Solution:
1. Let $I = \\int_0^{\\pi} \\frac{x\\sin x}{1+\\cos^2 x}\\, dx$.
2. Apply King's property ($x \\to \\pi - x$): $I = \\int_0^{\\pi} \\frac{(\\pi-x)\\sin x}{1+\\cos^2 x}\\, dx$.
3. Add: $2I = \\pi\\int_0^{\\pi} \\frac{\\sin x}{1+\\cos^2 x}\\, dx$.
4. Let $u = \\cos x$, $du = -\\sin x\\, dx$: $2I = \\pi\\int_{-1}^{1} \\frac{du}{1+u^2} = \\pi[\\arctan u]_{-1}^{1} = \\pi \\cdot \\frac{\\pi}{2}$.
5. Therefore $I = \\frac{\\pi^2}{4}$.`,
  },

  // ── ∫₀^∞ sin²(x)/x² ────────────────────────────────────────────────────
  {
    id: 'sin2_x2',
    patterns: [/int.*sin\^?2.*x\^?2.*0.*inf/i, /∫.*sin².*x².*∞/i],
    result_latex: '\\frac{\\pi}{2}',
    result_numeric: '1.5707...',
    name: 'sin²x/x² integral',
    solution: `Answer: $\\frac{\\pi}{2}$

Solution:
1. Let $I = \\int_0^{\\infty} \\frac{\\sin^2 x}{x^2}\\, dx$.
2. IBP: $u = \\sin^2 x$, $dv = \\frac{dx}{x^2}$, so $du = 2\\sin x\\cos x\\,dx = \\sin(2x)\\,dx$, $v = -\\frac{1}{x}$.
3. $I = \\left[-\\frac{\\sin^2 x}{x}\\right]_0^{\\infty} + \\int_0^{\\infty} \\frac{\\sin(2x)}{x}\\, dx$.
4. First term vanishes. Second term: let $u = 2x$, gives $\\int_0^{\\infty} \\frac{\\sin u}{u}\\, du = \\frac{\\pi}{2}$ (Dirichlet).`,
  },
];

/**
 * Check if the question matches a known integral.
 * Returns the known integral object or null.
 */
function checkKnownIntegral(question) {
  const q = question.trim();
  for (const entry of KNOWN_INTEGRALS) {
    for (const pattern of entry.patterns) {
      if (pattern.test(q)) {
        console.log(`📖 Known integral matched: ${entry.name}`);
        return entry;
      }
    }
  }
  return null;
}

/**
 * Format a known integral as a full response string.
 */
function formatKnownIntegral(entry) {
  return entry.solution + `\n\n✅ *This is a classical result (${entry.name}).*`;
}

module.exports = { checkKnownIntegral, formatKnownIntegral, KNOWN_INTEGRALS };