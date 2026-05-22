"""Symbolic math solver for MathAI. Reads JSON from stdin, prints JSON to stdout."""
import json
import sys

from sympy import (
    Symbol,
    diff,
    integrate,
    latex,
    N,
    simplify,
    sympify,
    Integral,
    Integer,
    root,
)


def _latex(expr):
    return latex(simplify(expr))


def _verify_antiderivative(expr, antideriv, var):
    check = simplify(diff(antideriv, var) - expr)
    return check == 0


def solve(payload):
    operation = payload.get("operation")
    expr_str = payload.get("expr", "").strip()
    var_name = payload.get("var", "x")

    # ── nth_root: exact root of a large integer ───────────────────────────────
    if operation == "nth_root":
        number_str = payload.get("number", "").replace(",", "").strip()
        n_str = str(payload.get("n", "2")).strip()

        if not number_str:
            raise ValueError("Missing 'number' for nth_root operation")

        number = Integer(number_str)   # exact big integer — no float rounding
        n = int(n_str)

        root_exact = root(number, n)
        root_simplified = simplify(root_exact)

        # 50 significant digits of precision
        root_numeric = N(root_exact, 50)

        is_perfect = root_simplified.is_Integer

        return {
            "operation": "nth_root",
            "number": number_str,
            "n": n_str,
            "result_latex": latex(root_simplified),
            "result_exact": str(root_simplified),
            "numeric": str(root_numeric),
            "is_perfect": bool(is_perfect),
        }
    # ─────────────────────────────────────────────────────────────────────────

    if not expr_str:
        raise ValueError("Missing expression")

    var = Symbol(var_name)
    expr = sympify(expr_str, evaluate=True)
    expr_latex = _latex(expr)

    if operation == "integrate":
        lower = payload.get("lower")
        upper = payload.get("upper")
        if lower is not None and upper is not None:
            lower = sympify(lower)
            upper = sympify(upper)
            antideriv = integrate(expr, var)
            result = integrate(expr, (var, lower, upper))

            if isinstance(antideriv, Integral):
                raise ValueError(
                    "SymPy could not find an elementary antiderivative. "
                    "Try a different form or ask for a numerical value."
                )

            verified = _verify_antiderivative(expr, antideriv, var)

            return {
                "operation": "integrate",
                "definite": True,
                "expr": expr_str,
                "expr_latex": expr_latex,
                "var": var_name,
                "lower": str(lower),
                "upper": str(upper),
                "result": str(result),
                "result_latex": _latex(result),
                "antiderivative": str(antideriv),
                "antiderivative_latex": _latex(antideriv),
                "numeric": float(N(result)),
                "verified": verified,
            }

        antideriv = integrate(expr, var)
        if isinstance(antideriv, Integral):
            raise ValueError(
                "SymPy could not find an elementary antiderivative in closed form."
            )

        verified = _verify_antiderivative(expr, antideriv, var)
        result_str = str(antideriv) + " + C"

        return {
            "operation": "integrate",
            "definite": False,
            "expr": expr_str,
            "expr_latex": expr_latex,
            "var": var_name,
            "result": result_str,
            "result_latex": _latex(antideriv) + " + C",
            "numeric": None,
            "verified": verified,
        }

    if operation in ("diff", "differentiate"):
        order = int(payload.get("order", 1))
        result = diff(expr, var, order)
        return {
            "operation": "diff",
            "expr": expr_str,
            "expr_latex": expr_latex,
            "var": var_name,
            "order": order,
            "result": str(result),
            "result_latex": _latex(result),
            "numeric": None,
            "verified": True,
        }

    raise ValueError(f"Unknown operation: {operation}")


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        out = {"ok": True, **solve(payload)}
    except Exception as exc:
        out = {"ok": False, "error": str(exc)}
    print(json.dumps(out))


if __name__ == "__main__":
    main()