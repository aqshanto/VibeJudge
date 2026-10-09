// Plagiarism (কোড মিল) — MOSS-এর মতো "winnowing" অ্যালগরিদম, বাইরের কোনো সার্ভিস ছাড়া।
//
// ১) Tokenize: কমেন্ট, ফাঁকা জায়গা, #include বাদ; সব নাম → "V", সংখ্যা → "N", স্ট্রিং → "S"।
//    তাই ভ্যারিয়েবলের নাম বদলালে বা কমেন্ট দিলে কিছু বদলায় না।
// ২) পরপর K টা token-এর প্রতিটা অংশের hash; প্রতি W টা hash-এর জানালা থেকে সবচেয়ে ছোটটা রাখি
//    (winnowing) — এতে K+W-1 টা token-এর বেশি লম্বা যেকোনো মিল নিশ্চিতভাবে ধরা পড়ে।
// ৩) অনেকের কোডে থাকা সাধারণ অংশ (boilerplate) বাদ দিয়ে জোড়ায় জোড়ায় মিল গুনি।
//
// এটা "সন্দেহের তালিকা", প্রমাণ না — ছোট/সহজ প্রবলেমে অনেকের কোড স্বাভাবিকভাবেই এক রকম হয়।

import type { Language } from "@vibejudge/shared";

const K = 12; // k-gram দৈর্ঘ্য (token)
const W = 6; // winnowing জানালা
/** এর চেয়ে কম fingerprint থাকলে (খুব ছোট কোড) তুলনা করি না — ভুল সন্দেহ হয় */
export const MIN_FINGERPRINTS = 8;

const words = (s: string) => new Set(s.split(" "));
const C_KEYWORDS = words(
  "auto break case char const continue default do double else enum extern float for goto if int long register " +
    "return short signed sizeof static struct switch typedef union unsigned void volatile while bool true false " +
    "class new delete this template typename namespace using public private protected virtual operator " +
    "try catch throw nullptr constexpr inline friend",
);
const KEYWORDS: Record<Language, Set<string>> = {
  c: C_KEYWORDS,
  cpp: C_KEYWORDS,
  java: words(
    "abstract boolean break byte case catch char class continue default do double else enum extends final finally " +
      "float for if implements instanceof int interface long new private protected public return short static super " +
      "switch this throw throws try void while var true false null record",
  ),
  python: words(
    "False None True and as assert async await break class continue def del elif else except finally for from " +
      "global if in is lambda nonlocal not or pass raise return try while with yield",
  ),
};

/** লাইনের শুরুতে থাকলে পুরো লাইন বাদ (include/import — সবার কোডে প্রায় একই) */
const SKIP_LINE: Record<Language, RegExp> = {
  c: /^#/,
  cpp: /^#/,
  java: /^(import|package)\s/,
  python: /^(import\s|from\s+[\w.]+\s+import\s)/,
};

// লম্বা operator আগে (">>=" যেন ">>" আর "=" হয়ে না যায়)
const OPERATORS = [
  "<<=", ">>=", "->*", "...", "::", "->", "++", "--", "<<", ">>", "<=", ">=", "==", "!=", "&&", "||",
  "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=",
];

export interface Token {
  text: string;
  line: number;
}

export function tokenize(source: string, language: Language = "cpp"): Token[] {
  const tokens: Token[] = [];
  const python = language === "python";
  const keywords = KEYWORDS[language];
  const s = source.replace(/\r\n?/g, "\n");
  let line = 1;
  let i = 0;
  let lineStart = true; // লাইনের শুরু (শুধু ফাঁকা জায়গার পরে) — preprocessor চেনার জন্য

  while (i < s.length) {
    const c = s[i]!;
    if (c === "\n") {
      line++;
      i++;
      lineStart = true;
      continue;
    }
    if (c === " " || c === "\t" || c === "\v" || c === "\f") {
      i++;
      continue;
    }
    // #include, #define … পুরো লাইন বাদ (লাইনের শেষে "\" থাকলে পরের লাইনও)
    // (import-ও একইভাবে; Python-এ "#" যেকোনো জায়গায় = কমেন্ট)
    if ((lineStart && SKIP_LINE[language].test(s.slice(i, i + 80))) || (python && c === "#")) {
      while (i < s.length && s[i] !== "\n") {
        if (s[i] === "\\" && s[i + 1] === "\n") {
          line++;
          i++;
        }
        i++;
      }
      continue;
    }
    lineStart = false;

    // Python-এ "//" হলো ভাগ (floor division), কমেন্ট না
    if (!python && c === "/" && s[i + 1] === "/") {
      while (i < s.length && s[i] !== "\n") i++;
      continue;
    }
    if (!python && c === "/" && s[i + 1] === "*") {
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) {
        if (s[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }
    // Python-এর """docstring""" বা '''…''' (কয়েক লাইন জুড়ে)
    const triple = s.slice(i, i + 3);
    if (python && (triple === '"""' || triple === "'''")) {
      const startLine = line;
      i += 3;
      while (i < s.length && !s.startsWith(triple, i)) {
        if (s[i] === "\n") line++;
        i += s[i] === "\\" ? 2 : 1;
      }
      i += 3;
      tokens.push({ text: "S", line: startLine });
      continue;
    }
    if (c === '"' || c === "'") {
      const startLine = line;
      i++;
      while (i < s.length && s[i] !== c && s[i] !== "\n") i += s[i] === "\\" ? 2 : 1;
      i++;
      // Python-এ ' আর " দুটোই স্ট্রিং
      tokens.push({ text: c === '"' || python ? "S" : "C", line: startLine });
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(s[i + 1] ?? ""))) {
      while (i < s.length && /[0-9a-zA-Z_.']/.test(s[i]!)) {
        // 1e-5 / 0x1p+3
        if ((s[i] === "e" || s[i] === "E" || s[i] === "p" || s[i] === "P") && (s[i + 1] === "+" || s[i + 1] === "-")) i++;
        i++;
      }
      tokens.push({ text: "N", line });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j]!)) j++;
      const word = s.slice(i, j);
      tokens.push({ text: keywords.has(word) ? word : "V", line });
      i = j;
      continue;
    }
    const op = OPERATORS.find((o) => s.startsWith(o, i));
    tokens.push({ text: op ?? c, line });
    i += op ? op.length : 1;
  }
  return tokens;
}

export interface Fingerprints {
  /** hash → এই অংশ কোন কোন লাইন জুড়ে (প্রথম আর শেষ লাইন) */
  byHash: Map<number, { from: number; to: number }[]>;
}

const tokenIds = new Map<string, number>();
const idOf = (t: string) => {
  let id = tokenIds.get(t);
  if (id === undefined) {
    id = tokenIds.size + 1;
    tokenIds.set(t, id);
  }
  return id;
};

export function fingerprint(tokens: Token[]): Fingerprints {
  const byHash = new Map<number, { from: number; to: number }[]>();
  if (tokens.length < K) return { byHash };

  const ids = tokens.map((t) => idOf(t.text));
  const hashes: number[] = [];
  for (let i = 0; i + K <= ids.length; i++) {
    let h = 2166136261; // FNV-1a (৩২ bit)
    for (let j = i; j < i + K; j++) h = Math.imul(h ^ ids[j]!, 16777619);
    hashes.push(h >>> 0);
  }

  // Winnowing: প্রতিটা জানালায় সবচেয়ে ছোট hash (সমান হলে ডানেরটা); একই অবস্থান দুবার নিই না
  // (hash W-এর কম হলে পুরোটা মিলে একটাই জানালা)
  const windows = Math.max(1, hashes.length - W + 1);
  let lastPicked = -1;
  for (let start = 0; start < windows; start++) {
    const end = Math.min(start + W, hashes.length);
    let min = start;
    for (let i = start; i < end; i++) if (hashes[i]! <= hashes[min]!) min = i;
    if (min === lastPicked) continue;
    lastPicked = min;
    const span = { from: tokens[min]!.line, to: tokens[min + K - 1]!.line };
    const list = byHash.get(hashes[min]!);
    if (list) list.push(span);
    else byHash.set(hashes[min]!, [span]);
  }
  return { byHash };
}

export interface PlagiarismInput {
  id: string; // সাবমিশন id
  owner: string; // username
  source: string;
  language: Language;
}

export interface SimilarPair {
  a: string;
  b: string;
  /** ০-১০০: মিলে যাওয়া fingerprint ÷ ছোট কোডটার fingerprint */
  similarity: number;
  shared: number;
}

/**
 * একটা প্রবলেমের সাবমিশনগুলোর মধ্যে মিল খোঁজে (প্রত্যেকের একটা করে সাবমিশন দেওয়া উচিত)।
 * `boilerplateShare`: এর চেয়ে বেশি অংশ সাবমিশনে থাকা fingerprint বাদ (যেমন সবার টেমপ্লেট)।
 */
export function findSimilarPairs(
  subs: PlagiarismInput[],
  opts: { minSimilarity?: number; boilerplateShare?: number; maxPairs?: number } = {},
): { pairs: SimilarPair[]; ignoredFingerprints: number } {
  // ভাষা অনুযায়ী আলাদা তুলনা — C++ আর Python-এর token মেলে না, আর boilerplate-ও আলাদা
  const byLanguage = new Map<Language, PlagiarismInput[]>();
  for (const s of subs) byLanguage.set(s.language, [...(byLanguage.get(s.language) ?? []), s]);
  if (byLanguage.size > 1) {
    const results = [...byLanguage.values()].map((group) => findSimilarPairs(group, { ...opts, maxPairs: Infinity }));
    const pairs = results
      .flatMap((r) => r.pairs)
      .sort((p, q) => q.similarity - p.similarity || q.shared - p.shared);
    return {
      pairs: pairs.slice(0, opts.maxPairs ?? 300),
      ignoredFingerprints: results.reduce((n, r) => n + r.ignoredFingerprints, 0),
    };
  }

  const minSimilarity = opts.minSimilarity ?? 50;
  const boilerplate = Math.max(3, Math.ceil(subs.length * (opts.boilerplateShare ?? 0.3)));

  const prints = subs.map((s) => new Set(fingerprint(tokenize(s.source, s.language)).byHash.keys()));
  // hash → কোন কোন সাবমিশনে আছে
  const index = new Map<number, number[]>();
  prints.forEach((set, i) => {
    for (const h of set) {
      const list = index.get(h);
      if (list) list.push(i);
      else index.set(h, [i]);
    }
  });

  let ignored = 0;
  const useful = prints.map(() => 0); // boilerplate বাদে প্রত্যেকের fingerprint সংখ্যা
  const shared = new Map<number, number>(); // i * n + j → কয়টা মিল
  const n = subs.length;
  for (const owners of index.values()) {
    if (owners.length > boilerplate && subs.length >= 4) {
      ignored++;
      continue;
    }
    for (const i of owners) useful[i]!++;
    for (let x = 0; x < owners.length; x++) {
      for (let y = x + 1; y < owners.length; y++) {
        const key = owners[x]! * n + owners[y]!;
        shared.set(key, (shared.get(key) ?? 0) + 1);
      }
    }
  }

  const pairs: SimilarPair[] = [];
  for (const [key, count] of shared) {
    const i = Math.floor(key / n);
    const j = key % n;
    if (subs[i]!.owner === subs[j]!.owner) continue;
    const smaller = Math.min(useful[i]!, useful[j]!);
    if (smaller < MIN_FINGERPRINTS) continue;
    const similarity = Math.round((100 * count) / smaller);
    if (similarity >= minSimilarity) pairs.push({ a: subs[i]!.id, b: subs[j]!.id, similarity, shared: count });
  }
  pairs.sort((p, q) => q.similarity - p.similarity || q.shared - p.shared);
  return { pairs: pairs.slice(0, opts.maxPairs ?? 300), ignoredFingerprints: ignored };
}

/** দুটো কোডের কোন লাইনগুলো মিলেছে (পাশাপাশি দেখানোর সময় হাইলাইটের জন্য) */
export function matchedLines(
  a: { source: string; language: Language },
  b: { source: string; language: Language },
): { a: number[]; b: number[]; similarity: number } {
  const fa = fingerprint(tokenize(a.source, a.language)).byHash;
  const fb = fingerprint(tokenize(b.source, b.language)).byHash;
  const linesA = new Set<number>();
  const linesB = new Set<number>();
  let common = 0;
  for (const [h, spansA] of fa) {
    const spansB = fb.get(h);
    if (!spansB) continue;
    common++;
    for (const sp of spansA) for (let l = sp.from; l <= sp.to; l++) linesA.add(l);
    for (const sp of spansB) for (let l = sp.from; l <= sp.to; l++) linesB.add(l);
  }
  const smaller = Math.min(fa.size, fb.size);
  return {
    a: [...linesA].sort((x, y) => x - y),
    b: [...linesB].sort((x, y) => x - y),
    similarity: smaller ? Math.round((100 * common) / smaller) : 0,
  };
}
