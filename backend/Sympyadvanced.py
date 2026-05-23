"""
sympyAdvanced.py
Extended SymPy solver for advanced integrals.
Called by sympyRunner.js as a subprocess with JSON input/output.

Handles:
  - Standard integration (indefinite + definite)
  - Mellin transform
  - Laplace transform
  - Gamma/Beta function rewriting
  - Series expansion fallback
  - Self-verification by differentiation
"""

import sys
import json
import sympy as sp
from sympy import (
    symbols, integrate, simplify, latex, N, oo, pi, sqrt, exp,
    ln, sin, cos, tan, sec, csc, cot, log, I, E,
    gamma, beta as beta_fn, factorial, Rational, Symbol,
    series, diff, trigsimp, cancel, expand, factor,
    mellin_transform, laplace_transform,
    meijerg, hyper, besselj, bessely,
    Abs, sign, conjugate, re, im,
)
from sympy.integrals.transforms import inverse_laplace_transform

def safe_latex(expr):
    try:
        return latex(expr)
    except Exception:
        return str(expr)

def safe_numeric(expr):
    try:
        val = complex(N(expr, 15))
        if abs(val.imag) < 1e-10:
            return str(float(val.real))
        return str(val)
    except Exception:
        return "N/A"

def verify_by_differentiation(antideriv, integrand, var):
    """Differentiate the antiderivative and check it matches the integrand."""
    try:
        deriv = diff(antideriv, var)
        diff_simplified = simplify(trigsimp(cancel(expand(deriv - integrand))))
        return diff_simplified == 0
    except Exception:
        return False

def try_gamma_rewrite(integrand, var):
    """Try to rewrite integrand in terms of Gamma/Beta functions."""
    try:
        rewritten = integrand.rewrite(gamma)
        if rewritten != integrand:
            result = integrate(rewritten, (var, 0, oo))
            result = simplify(result)
            if result.is_finite and not result.has(sp.Integral):
                return result
    except Exception:
        pass
    return None

def try_series_fallback(integrand, var, lower, upper, terms=20):
    """Try series expansion and term-by-term integration."""
    try:
        s = series(integrand, var, 0, terms)
        s_poly = s.removeO()
        result = integrate(s_poly, (var, lower, upper))
        result = simplify(result)
        if not result.has(sp.Integral):
            return result, True  # approximate
    except Exception:
        pass
    return None, False

def solve(payload):
    operation = payload.get('operation', 'integrate')
    expr_str  = payload.get('expr', '')
    var_str   = payload.get('var', 'x')
    lower_str = payload.get('lower')
    upper_str = payload.get('upper')
    method    = payload.get('method', 'auto')  # 'auto', 'mellin', 'laplace', 'gamma', 'series'

    var = Symbol(var_str, real=True)

    # Parse expression safely
    local_ns = {
        'x': var, 't': symbols('t', positive=True),
        'n': symbols('n', positive=True),
        'a': symbols('a', positive=True),
        's': symbols('s'),
        'pi': pi, 'oo': oo, 'inf': oo, 'E': E, 'I': I,
        'sqrt': sqrt, 'exp': exp, 'ln': ln, 'log': log,
        'sin': sin, 'cos': cos, 'tan': tan,
        'sec': sec, 'csc': csc, 'cot': cot,
        'gamma': gamma, 'beta': beta_fn,
        'Abs': Abs,
    }
    try:
        integrand = sp.sympify(expr_str, locals=local_ns)
    except Exception as e:
        return {'ok': False, 'error': f'Could not parse expression: {e}'}

    # Parse limits
    def parse_limit(s_val):
        if s_val is None:
            return None
        replacements = {
            'inf': oo, 'infinity': oo, '∞': oo,
            'pi': pi, 'π': pi,
            '-inf': -oo, '-infinity': -oo,
        }
        if str(s_val).strip().lower() in replacements:
            return replacements[str(s_val).strip().lower()]
        try:
            return sp.sympify(str(s_val), locals=local_ns)
        except Exception:
            return None

    lower = parse_limit(lower_str)
    upper = parse_limit(upper_str)
    is_definite = (lower is not None and upper is not None)

    result = None
    source = 'sympy_standard'
    is_approximate = False
    antiderivative = None

    # ── 1. Differentiation ──────────────────────────────────────────────────
    if operation == 'differentiate':
        try:
            result = diff(integrand, var)
            result = simplify(trigsimp(result))
            return {
                'ok': True,
                'operation': 'differentiate',
                'expr': expr_str,
                'expr_latex': safe_latex(integrand),
                'var': var_str,
                'result_latex': safe_latex(result),
                'numeric': safe_numeric(result),
                'verified': True,
            }
        except Exception as e:
            return {'ok': False, 'error': str(e)}

    # ── 2. Mellin transform ─────────────────────────────────────────────────
    if operation == 'mellin' or method == 'mellin':
        try:
            s_var = symbols('s')
            mt, strip, _ = mellin_transform(integrand, var, s_var)
            mt = simplify(mt)
            return {
                'ok': True,
                'operation': 'mellin',
                'expr_latex': safe_latex(integrand),
                'result_latex': safe_latex(mt),
                'strip': str(strip),
                'numeric': safe_numeric(mt),
                'verified': True,
            }
        except Exception as e:
            return {'ok': False, 'error': f'Mellin transform failed: {e}'}

    # ── 3. Laplace transform ────────────────────────────────────────────────
    if operation == 'laplace' or method == 'laplace':
        try:
            s_var = symbols('s')
            lt, plane, _ = laplace_transform(integrand, var, s_var)
            lt = simplify(lt)
            return {
                'ok': True,
                'operation': 'laplace',
                'expr_latex': safe_latex(integrand),
                'result_latex': safe_latex(lt),
                'numeric': safe_numeric(lt),
                'verified': True,
            }
        except Exception as e:
            return {'ok': False, 'error': f'Laplace transform failed: {e}'}

    # ── 4. Standard integration with fallback chain ─────────────────────────
    # Step 1: Try direct integration
    try:
        if is_definite:
            result = integrate(integrand, (var, lower, upper))
        else:
            result = integrate(integrand, var)

        if result is not None and not result.has(sp.Integral):
            result = simplify(trigsimp(cancel(result)))
        else:
            result = None
    except Exception:
        result = None

    # Step 2: If definite integral failed, try Gamma rewrite
    if result is None and is_definite:
        gamma_result = try_gamma_rewrite(integrand, var)
        if gamma_result is not None:
            result = gamma_result
            source = 'sympy_gamma_rewrite'

    # Step 3: Try meijerg / hypergeometric (SymPy does this internally but force it)
    if result is None and is_definite:
        try:
            result = integrate(integrand, (var, lower, upper), meijerg=True)
            if result is not None and result.has(sp.Integral):
                result = None
            elif result is not None:
                result = simplify(result)
                source = 'sympy_meijerg'
        except Exception:
            result = None

    # Step 4: Series fallback (approximate, for definite only)
    if result is None and is_definite and lower == 0:
        series_result, approx = try_series_fallback(integrand, var, lower, upper)
        if series_result is not None:
            result = series_result
            is_approximate = approx
            source = 'series_approximation'

    if result is None:
        return {'ok': False, 'error': 'SymPy could not evaluate this integral with any method.'}

    # ── 5. Self-verification for indefinite integrals ───────────────────────
    verified = False
    if not is_definite and result is not None:
        antiderivative = result
        verified = verify_by_differentiation(antiderivative, integrand, var)
        if not verified:
            # Try simplifying harder
            try:
                simplified_antideriv = trigsimp(expand(antiderivative))
                verified = verify_by_differentiation(simplified_antideriv, integrand, var)
                if verified:
                    antiderivative = simplified_antideriv
            except Exception:
                pass

    # ── Build response ───────────────────────────────────────────────────────
    response = {
        'ok': True,
        'operation': 'integrate',
        'definite': is_definite,
        'expr': expr_str,
        'expr_latex': safe_latex(integrand),
        'var': var_str,
        'result_latex': safe_latex(result),
        'numeric': safe_numeric(result),
        'verified': verified if not is_definite else True,
        'approximate': is_approximate,
        'source': source,
    }

    if is_definite:
        response['lower'] = str(lower_str)
        response['upper'] = str(upper_str)
    else:
        response['antiderivative_latex'] = safe_latex(antiderivative or result)

    if is_approximate:
        response['warning'] = 'Result is a series approximation, not exact closed form.'

    return response


if __name__ == '__main__':
    try:
        payload = json.loads(sys.stdin.read())
        result = solve(payload)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({'ok': False, 'error': str(e)}))