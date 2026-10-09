// পাসওয়ার্ড hash — Node-এর built-in scrypt (আলাদা native প্যাকেজ লাগে না)।
// ফরম্যাট: scrypt$N$r$p$<salt base64>$<hash base64>

import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const N = 16384; // ~16 MB memory প্রতি hash
const R = 8;
const P = 1;
const KEY_LEN = 64;

function derive(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LEN, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/**
 * `cost` ডিফল্টে শক্ত (ইউজারের নিজের দেওয়া পাসওয়ার্ড — দুর্বল হতে পারে)।
 * বাল্ক অ্যাকাউন্টের random পাসওয়ার্ডে ("light") ~৫৫ bit entropy থাকে, তাই হালকা hash-ই যথেষ্ট —
 * নাহলে Render-এর ০.১ CPU-তে ১০০০টা অ্যাকাউন্ট বানাতে কয়েক মিনিট লাগত।
 */
export async function hashPassword(password: string, cost: "strong" | "light" = "strong"): Promise<string> {
  const n = cost === "strong" ? N : 1024;
  const salt = randomBytes(16);
  const key = await derive(password, salt, { N: n, r: R, p: P });
  return ["scrypt", n, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

// দেখতে একই রকম অক্ষর বাদ (0/O, 1/l/I) — ছাত্ররা কাগজ থেকে পড়ে টাইপ করবে
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** ১০ অক্ষরের random পাসওয়ার্ড (৫৫ অক্ষরের সেট → ~৫৮ bit) */
export function generatePassword(length = 10): string {
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length; // ২২০ — এর উপরের byte নিলে কিছু অক্ষর বেশি আসত
  let out = "";
  while (out.length < length) {
    for (const b of randomBytes(length * 2)) {
      if (b < limit && out.length < length) out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const key = await derive(password, Buffer.from(saltB64, "base64"), { N: Number(n), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}
