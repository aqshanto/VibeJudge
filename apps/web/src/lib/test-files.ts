// আপলোড করা ফাইল (zip বা আলাদা ফাইল) থেকে input/answer জোড়া বানায়।
//
// যেসব নাম চেনে:
//   1.in + 1.out   ·   1.in + 1.ans   ·   test01.in + test01.out
//   01 + 01.a  (Polygon ফরম্যাট)
// zip-এর ভেতরে ফোল্ডার থাকলেও চলবে (ফোল্ডারের নাম বাদ দেওয়া হয়)।

import { unzipSync } from "fflate";

export interface TestPair {
  name: string;
  input: Uint8Array;
  answer: Uint8Array;
}

const ANSWER_EXTS = [".out", ".ans", ".a", ".output"];
const INPUT_EXTS = [".in", ".input", ""];

export async function readTestFiles(files: File[]): Promise<{ pairs: TestPair[]; warnings: string[] }> {
  const all = new Map<string, Uint8Array>();
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (file.name.toLowerCase().endsWith(".zip")) {
      for (const [path, data] of Object.entries(unzipSync(bytes))) {
        const name = path.split("/").pop()!;
        // ফোল্ডার আর macOS-এর লুকানো ফাইল বাদ
        if (!name || path.endsWith("/") || path.includes("__MACOSX") || name.startsWith(".")) continue;
        all.set(name, data);
      }
    } else {
      all.set(file.name, bytes);
    }
  }

  const used = new Set<string>();
  const pairs: TestPair[] = [];
  for (const name of all.keys()) {
    const lower = name.toLowerCase();
    const ansExt = ANSWER_EXTS.find((e) => lower.endsWith(e));
    if (!ansExt) continue;
    const base = name.slice(0, name.length - ansExt.length);
    const inputName = INPUT_EXTS.map((e) => base + e).find((n) => all.has(n) && n !== name);
    if (!inputName) continue;
    pairs.push({ name: base, input: all.get(inputName)!, answer: all.get(name)! });
    used.add(name).add(inputName);
  }

  const warnings = [...all.keys()].filter((n) => !used.has(n)).map((n) => `"${n}" has no matching input/answer file — skipped`);
  pairs.sort((a, b) => naturalCompare(a.name, b.name));
  return { pairs, warnings };
}

/** "2" < "10", "test2" < "test10" */
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
