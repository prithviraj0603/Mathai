/**
 * methodRouter.js
 * Detects the best integration technique for a given question
 * and returns a method-specific hint to inject into the system prompt.
 */

const METHOD_HINTS = {
  feynman: `Use Feynman's technique (differentiation under the integral sign):
1. Introduce parameter α into the integrand (e.g. replace a constant with α).
2. Differentiate both sides with respect to α to get a simpler integral I'(α).
3. Solve I'(α), then integrate back with respect to α to get I(α).
4. Apply boundary condition (e.g. I(0)=0 or I(1)=known) to find the constant.
Show each step clearly.`,

  contour: `Use contour integration (complex analysis):
1. Extend the integrand to the complex plane.
2. Choose a suitable contour (semicircle, keyhole, rectangular, etc.).
3. Identify all poles inside the contour and compute residues: Res[f,z₀] = lim(z→z₀)(z−z₀)f(z).
4. Apply the Residue Theorem: ∮f(z)dz = 2πi·Σ(residues inside).
5. Show that the arc contribution vanishes (Jordan's lemma if needed).
6. Relate the contour integral back to the real integral.`,

  'beta-gamma': `Use Beta/Gamma function technique:
1. Rewrite the integrand to match Beta function form: B(m,n) = ∫₀¹ x^(m-1)(1-x)^(n-1)dx or Gamma form: Γ(n) = ∫₀^∞ x^(n-1)e^(-x)dx.
2. Use substitution if needed (e.g. x = t², x = sin²θ) to reach standard form.
3. Apply B(m,n) = Γ(m)Γ(n)/Γ(m+n).
4. Use Euler's reflection formula Γ(x)Γ(1−x) = π/sin(πx) if applicable.
5. Simplify using Γ(n+1) = n! for integers and Γ(1/2) = √π.`,

  king: `Use King's property of definite integrals:
1. State King's property: ∫₀ᵃ f(x)dx = ∫₀ᵃ f(a−x)dx.
2. Let I = original integral, write I' = same integral with x → (a−x).
3. Add: I + I' = 2I, simplify the combined integrand.
4. Solve for I = (simplified integral)/2.
Show both I and I' explicitly before adding.`,

  series: `Use series expansion technique:
1. Expand the integrand as a power series or use a known Taylor/Maclaurin series.
2. Integrate the series term by term (justify uniform convergence if needed).
3. Identify the resulting series as a known constant (π²/6, ln2, Catalan's constant G, etc.) if applicable.
4. State the final closed-form answer.`,

  ibp: `Use Integration by Parts (IBP) with LIATE rule:
Priority: Logarithmic > Inverse trig > Algebraic > Trigonometric > Exponential.
Formula: ∫u·dv = uv − ∫v·du.
If applying IBP twice leads back to the original integral I, collect I on both sides and solve algebraically.
Show u, dv, du, v explicitly at each IBP application.`,

  trig_sub: `Use trigonometric substitution:
- √(a²−x²): use x = a·sinθ
- √(a²+x²): use x = a·tanθ  
- √(x²−a²): use x = a·secθ
After substitution, simplify using trig identities, integrate, then convert back to x using a right triangle.`,

  partial_fractions: `Use partial fraction decomposition:
1. Factor the denominator completely.
2. Write the integrand as a sum of partial fractions.
3. Solve for coefficients (cover-up method or comparing coefficients).
4. Integrate each fraction separately.
For repeated factors: include all powers. For irreducible quadratics: use (Ax+B)/(ax²+bx+c) form.`,

  substitution: `Use u-substitution:
1. Identify the inner function u = g(x) such that g'(x) appears (or can be made to appear) in the integrand.
2. Compute du = g'(x)dx, express dx in terms of du.
3. Rewrite the entire integral in terms of u.
4. Integrate with respect to u.
5. Back-substitute x.
For definite integrals, also change the limits when substituting.`,

  wallis: `Use Wallis-type integral or reduction formula:
Apply the reduction formula: ∫₀^(π/2) sinⁿ(x)dx = [(n−1)/n]·∫₀^(π/2) sinⁿ⁻²(x)dx.
Or use the result: ∫₀^(π/2) sinⁿ(x)dx = ∫₀^(π/2) cosⁿ(x)dx = [√π·Γ((n+1)/2)] / [2·Γ(n/2+1)].
Show the recursion steps clearly.`,

  general: `Analyze the integrand carefully before starting:
1. Check for obvious substitution (inner function and its derivative present).
2. If rational function → partial fractions.
3. If product of functions → IBP with LIATE.
4. If involves √(a²±x²) or √(x²−a²) → trig substitution.
5. If involves e^(-x²), sinc, or special limits → Gamma/Beta or Feynman.
Choose the most efficient method and state it at the start.`,
};

/**
 * Detects the most appropriate integration method for the given question.
 * Returns the method key string.
 */
function detectIntegralMethod(question) {
  const q = question.toLowerCase();

  // Feynman / differentiation under integral sign
  if (/feynman|differentiati[eo]n under|leibniz rule|parameter|d\/d(alpha|beta|t|a)\s*\int/i.test(question)) {
    return 'feynman';
  }

  // Contour / complex analysis
  if (/contour|residue|complex plane|jordan('?s)? lemma|pole[s]?|analytic|meromorphic|branch cut|keyhole/i.test(question)) {
    return 'contour';
  }

  // Beta / Gamma functions
  if (/\bgamma\s*(function|\()|beta\s*(function|\()|euler('?s)? (reflection|integral)|wallis.*gamma|gamma.*wallis/i.test(question)) {
    return 'beta-gamma';
  }

  // Wallis integral / reduction formula
  if (/wallis|reduction formula|sin\^[n\d].*0.*pi|cos\^[n\d].*0.*pi/i.test(question)) {
    return 'wallis';
  }

  // King's property
  if (/king('?s)?\s*(property|rule|theorem)?|f\(a\s*[-−]\s*x\)|symmetric\s*integral/i.test(question)) {
    return 'king';
  }

  // Series expansion
  if (/\bseries\b|maclaurin|power series|taylor series|term.by.term|summation.*integral/i.test(question)) {
    return 'series';
  }

  // Partial fractions
  if (/partial fraction|decompos|rational function|factor.*denominator/i.test(question)) {
    return 'partial_fractions';
  }

  // Integration by parts
  if (/by parts|IBP|LIATE|u\s*dv|uv\s*-\s*v\s*du/i.test(question)) {
    return 'ibp';
  }

  // Trig substitution
  if (/trig(onometric)?\s*sub|sqrt.*a\^?2\s*[-+]\s*x\^?2|sqrt.*x\^?2\s*[-+]\s*a\^?2/i.test(question)) {
    return 'trig_sub';
  }

  // Substitution (u-sub)
  if (/substitut|u\s*=\s*|let\s+u\s*=|change of variable/i.test(question)) {
    return 'substitution';
  }

  // Feynman heuristic: parameter integrals with e^(-ax), ln in integrand, or limits 0 to inf
  if (/\be\^?\s*\(?-\s*[a-z]?\s*x|ln\s*\(|log\s*\(/.test(q) &&
      /0\s*(to|,)\s*(inf|∞|pi|π)/.test(q)) {
    return 'feynman';
  }

  // Beta/Gamma heuristic: x^n * e^(-x) or x^(n-1) patterns
  if (/x\^?\s*\(?[a-z\d]+\)?\s*\*?\s*e\^?\s*\(?\s*-\s*x/.test(q) &&
      /0\s*(to|,)\s*(inf|∞)/.test(q)) {
    return 'beta-gamma';
  }

  return 'general';
}

/**
 * Returns the hint string for a given method key.
 */
function getMethodHint(method) {
  return METHOD_HINTS[method] || METHOD_HINTS['general'];
}

/**
 * Main export: detect method and return full hint string to inject.
 */
function getIntegralMethodPrompt(question) {
  const method = detectIntegralMethod(question);
  const hint = getMethodHint(method);
  console.log(`🎯 Integral method detected: ${method}`);
  return { method, hint };
}

module.exports = { detectIntegralMethod, getMethodHint, getIntegralMethodPrompt };