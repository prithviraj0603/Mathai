/**
 * Parse natural-language calculus questions into SymPy-ready payloads.
 */

const TRIG = ['sin', 'cos', 'tan', 'cot', 'sec', 'csc'];
const INVERSE_MAP = {
  sin: 'asin',
  cos: 'acos',
  tan: 'atan',
  cot: 'acot',
  sec: 'asec',
  csc: 'acsc',
};

function normalizeInverseTrig(s) {
  let out = s;

  for (const [name, inv] of Object.entries(INVERSE_MAP)) {
    out = out.replace(
      new RegExp(`\\b${name}\\s*inverse\\s*(?:of\\s*)?\\(?\\s*([^)\s]+(?:\\([^)]*\\)[^)]*)?)\\s*\\)?`, 'gi'),
      (_, inner) => `${inv}(${normalizeExpr(inner.trim())})`
    );
    out = out.replace(
      new RegExp(`\\b${name}\\s*\\^\\s*\\{\\s*-1\\s*\\}\\s*\\(?\\s*([^)]+)\\)?`, 'gi'),
      (_, inner) => `${inv}(${normalizeExpr(inner.trim())})`
    );
  }

  out = out.replace(/\barcsin\s*\(/gi, 'asin(');
  out = out.replace(/\barccos\s*\(/gi, 'acos(');
  out = out.replace(/\barctan\s*\(/gi, 'atan(');
  out = out.replace(/\barccot\s*\(/gi, 'acot(');

  return out;
}

function wrapBareTrigArgs(s) {
  let out = s;

  for (const fn of TRIG) {
    out = out.replace(new RegExp(`\\b${fn}([a-z])(?!\\w)`, 'gi'), `${fn}($1)`);
  }

  for (let i = 0; i < 6; i++) {
    const next = out.replace(
      new RegExp(`\\b(${TRIG.join('|')})\\s*\\(\\s*([^()]+)\\)`, 'gi'),
      (full, fn, inner) => {
        let fixed = inner;
        for (const t of TRIG) {
          fixed = fixed.replace(
            new RegExp(`\\b${t}([a-z])(?!\\w)`, 'gi'),
            `${t}($1)`
          );
        }
        if (fixed === inner) return full;
        return `${fn}(${fixed})`;
      }
    );
    if (next === out) break;
    out = next;
  }

  return out;
}

function normalizeExpr(raw) {
  let s = raw.trim();
  s = s.replace(/π/g, 'pi');
  s = s.replace(/\bln\s*\(/gi, 'log(');
  s = normalizeInverseTrig(s);
  s = s.replace(/\broot\s*\(/gi, 'sqrt(');
  s = s.replace(/\bsqrt\s+([^(])/gi, 'sqrt($1');
  s = s.replace(/\^/g, '**');
  s = wrapBareTrigArgs(s);
  s = s.replace(/(\d)([a-zA-Z(])/g, '$1*$2');
  s = s.replace(/\)(\s*[a-zA-Z(])/g, ')*$1');
  return s;
}

function needsDeepSeekParse(question, expr) {
  const q = question.toLowerCase();
  if (/inverse|arc(sin|cos|tan|cot)|\^-1/i.test(q)) return true;
  if (/\b(sin|cos|tan|cot|sec|csc)[a-z]\b/i.test(expr.replace(/\s/g, ''))) return true;
  if (/sin\s+inverse|cos\s+inverse|tan\s+inverse/i.test(q)) return true;
  return false;
}

function parseBounds(q) {
  const patterns = [
    /\blimit\s+([-\d.]+)\s+to\s+([-\d.]+)\b/i,
    /\bfrom\s+([-\d.]+)\s+to\s+([-\d.]+)\b/i,
    /\bbetween\s+([-\d.]+)\s+and\s+([-\d.]+)\b/i,
    /\bbounds?\s+([-\d.]+)\s+(?:to|and)\s+([-\d.]+)\b/i,
  ];
  for (const re of patterns) {
    const m = q.match(re);
    if (m) return { lower: m[1], upper: m[2] };
  }
  return null;
}

function stripBounds(q) {
  return q
    .replace(/\blimit\s+[-\d.]+\s+to\s+[-\d.]+\b/gi, '')
    .replace(/\bfrom\s+[-\d.]+\s+to\s+[-\d.]+\b/gi, '')
    .replace(/\bbetween\s+[-\d.]+\s+and\s+[-\d.]+\b/gi, '')
    .trim();
}

function parseCalculusQuestion(question) {
  const q = question.trim();
  const bounds = parseBounds(q);
  const withoutBounds = stripBounds(q);

  const integMatch =
    withoutBounds.match(
      /^(?:find\s+)?(?:the\s+)?(?:integral|integrate|∫)\s+(?:of\s+)?(.+)$/i
    ) || withoutBounds.match(/^∫\s*(.+)$/i);

  if (integMatch) {
    const expr = normalizeExpr(integMatch[1]);
    const payload = { operation: 'integrate', expr, var: 'x' };
    if (bounds) {
      payload.lower = bounds.lower;
      payload.upper = bounds.upper;
    }
    return payload;
  }

  const diffMatch =
    withoutBounds.match(
      /^(?:find\s+)?(?:the\s+)?(?:derivative|differentiate|diff)\s+(?:of\s+)?(.+)$/i
    ) ||
    withoutBounds.match(/^d\/d([a-z])\s*(?:of\s+)?(.+)$/i) ||
    withoutBounds.match(/^d([a-z])\/d([a-z])\s+(.+)$/i);

  if (diffMatch) {
    if (diffMatch.length === 2) {
      return {
        operation: 'diff',
        expr: normalizeExpr(diffMatch[1]),
        var: 'x',
      };
    }
    const v = diffMatch[1] || diffMatch[2] || 'x';
    const expr = diffMatch[2] || diffMatch[3];
    return {
      operation: 'diff',
      expr: normalizeExpr(expr),
      var: v,
    };
  }

  return null;
}

function looksLikeCalculus(question) {
  const q = question.toLowerCase();
  return /integral|integrate|derivative|differentiate|∫|d\/d[a-z]/i.test(q);
}

/**
 * Detect root/radical problems — including large numbers.
 * Matches: "square root of 1452365784596524638"
 *          "cube root of 12345678901234"
 *          "5th root of 999999999999999"
 *          "root 3 of 123456789"
 *          "√1452365784596524638"
 *          "1452365784596524638^(1/3)"
 */
function looksLikeRootProblem(question) {
  const q = question.toLowerCase();
  return (
    /\b(square|cube|4th|5th|6th|7th|8th|9th|10th|\d+th|\d+nd|\d+rd)\s+root\b/i.test(q) ||
    /\broot\s+(of\s+)?\d{5,}/i.test(q) ||         // "root of <big number>"
    /\bn?th\s+root\b/i.test(q) ||
    /√\s*\d+/.test(q) ||                           // √12345
    /\d{5,}\s*\*\*\s*\(?\s*1\s*\/\s*\d+/.test(q) || // 123456**(1/3)
    /\d{5,}\s*\^\s*\(?\s*1\s*\/\s*\d+/.test(q)    // 123456^(1/3)
  );
}

/**
 * Parse a root question into a SymPy payload.
 * Returns { operation: 'nth_root', number: '...', n: '...' } or null.
 */
function parseRootQuestion(question) {
  const q = question.trim();

  // "square root of X" → n=2
  let m = q.match(/square\s+root\s+(?:of\s+)?([\d,]+)/i);
  if (m) return { operation: 'nth_root', number: m[1].replace(/,/g, ''), n: '2' };

  // "cube root of X" → n=3
  m = q.match(/cube\s+root\s+(?:of\s+)?([\d,]+)/i);
  if (m) return { operation: 'nth_root', number: m[1].replace(/,/g, ''), n: '3' };

  // "Nth root of X" e.g. "5th root of 123456"
  m = q.match(/(\d+)\s*(?:th|nd|rd|st)\s+root\s+(?:of\s+)?([\d,]+)/i);
  if (m) return { operation: 'nth_root', number: m[2].replace(/,/g, ''), n: m[1] };

  // "root N of X" or "root of X" (assume square root)
  m = q.match(/root\s+(\d+)\s+(?:of\s+)?([\d,]+)/i);
  if (m) return { operation: 'nth_root', number: m[2].replace(/,/g, ''), n: m[1] };

  m = q.match(/root\s+(?:of\s+)?([\d,]+)/i);
  if (m) return { operation: 'nth_root', number: m[1].replace(/,/g, ''), n: '2' };

  // "√X"
  m = q.match(/√\s*([\d,]+)/);
  if (m) return { operation: 'nth_root', number: m[1].replace(/,/g, ''), n: '2' };

  // "X^(1/N)" or "X**(1/N)"
  m = q.match(/([\d,]+)\s*(?:\^|\*\*)\s*\(?\s*1\s*\/\s*(\d+)\s*\)?/);
  if (m) return { operation: 'nth_root', number: m[1].replace(/,/g, ''), n: m[2] };

  return null;
}

module.exports = {
  normalizeExpr,
  parseCalculusQuestion,
  looksLikeCalculus,
  needsDeepSeekParse,
  looksLikeRootProblem,
  parseRootQuestion,
};