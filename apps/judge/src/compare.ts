// Default checker: whitespace (space, newline, tab) বাদ দিয়ে token ধরে ধরে মেলায়।
// Codeforces-এর "wcmp"-এর মতো — লাইনের শেষে বাড়তি space বা শেষে নতুন লাইন থাকলেও AC।

const WS = new Set([0x20, 0x0a, 0x0d, 0x09, 0x0b, 0x0c]);

function* tokens(buf: Buffer): Generator<Buffer> {
  let i = 0;
  const n = buf.length;
  while (i < n) {
    while (i < n && WS.has(buf[i]!)) i++;
    if (i >= n) return;
    const start = i;
    while (i < n && !WS.has(buf[i]!)) i++;
    yield buf.subarray(start, i);
  }
}

export interface CompareResult {
  ok: boolean;
  message: string;
}

export function compareTokens(output: Buffer, answer: Buffer): CompareResult {
  const out = tokens(output);
  const ans = tokens(answer);
  for (let index = 1; ; index++) {
    const a = ans.next();
    const o = out.next();
    if (a.done && o.done) return { ok: true, message: `ok ${index - 1} tokens` };
    if (a.done) return { ok: false, message: `extra output after ${index - 1} tokens` };
    if (o.done) return { ok: false, message: `expected token #${index} "${preview(a.value)}", found end of output` };
    if (!a.value.equals(o.value)) {
      return {
        ok: false,
        message: `token #${index} differs: expected "${preview(a.value)}", found "${preview(o.value)}"`,
      };
    }
  }
}

function preview(b: Buffer): string {
  const s = b.subarray(0, 64).toString("utf8");
  return b.length > 64 ? `${s}…` : s;
}
