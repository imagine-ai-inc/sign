/**
 * Safe formula evaluator for Formula fields (shared by the signer page and the server).
 * Supports numbers, [Data Label] references, + - * / %, parentheses and unary minus. No eval.
 */
export function formulaRefs(expr: string): string[] {
  return [...expr.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim());
}

export function toNumber(v: string | null | undefined): number {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[,$\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function evaluateFormula(expr: string, lookup: (label: string) => string | null | undefined): number | null {
  const tokens: (number | string)[] = [];
  const s = expr.trim();
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === "[") {
      const end = s.indexOf("]", i);
      if (end < 0) return null;
      tokens.push(toNumber(lookup(s.slice(i + 1, end).trim())));
      i = end + 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const n = Number(s.slice(i, j));
      if (!Number.isFinite(n)) return null;
      tokens.push(n);
      i = j;
      continue;
    }
    if ("+-*/%()".includes(ch)) { tokens.push(ch); i++; continue; }
    return null;
  }
  // shunting yard with unary minus
  const out: (number | string)[] = [];
  const ops: string[] = [];
  const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "u-": 3 };
  let prev: number | string | null = null;
  for (const t of tokens) {
    if (typeof t === "number") { out.push(t); prev = t; continue; }
    if (t === "(") { ops.push(t); prev = t; continue; }
    if (t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") out.push(ops.pop()!);
      if (!ops.length) return null;
      ops.pop();
      prev = t;
      continue;
    }
    let op = t;
    if (op === "-" && (prev === null || (typeof prev === "string" && prev !== ")"))) op = "u-";
    while (ops.length && ops[ops.length - 1] !== "(" && prec[ops[ops.length - 1]] >= prec[op] && op !== "u-") out.push(ops.pop()!);
    ops.push(op);
    prev = t;
  }
  while (ops.length) { const o = ops.pop()!; if (o === "(") return null; out.push(o); }
  const st: number[] = [];
  for (const t of out) {
    if (typeof t === "number") { st.push(t); continue; }
    if (t === "u-") { if (!st.length) return null; st.push(-st.pop()!); continue; }
    const b = st.pop(), a = st.pop();
    if (a === undefined || b === undefined) return null;
    st.push(t === "+" ? a + b : t === "-" ? a - b : t === "*" ? a * b : t === "/" ? (b === 0 ? NaN : a / b) : a % b);
  }
  if (st.length !== 1 || !Number.isFinite(st[0])) return null;
  return st[0];
}

export function formatFormula(n: number | null, decimals = 2): string {
  if (n === null) return "";
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
