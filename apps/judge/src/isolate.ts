// isolate sandbox-এর ছোট wrapper।
// প্রতিটা box একটা আলাদা Linux user + cgroup + filesystem namespace — ইউজারের কোড বাইরের কিছু দেখতে পায় না,
// নেটওয়ার্ক নেই, আর time/memory মাপা ও সীমিত করা হয়।

import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ISOLATE = process.env.ISOLATE_BIN ?? "isolate";

export interface RunLimits {
  timeMs: number;
  wallTimeMs: number;
  memoryKb: number;
  /** একসাথে কয়টা process/thread চালানো যাবে (compiler-এর জন্য বেশি লাগে) */
  processes?: number;
  /** প্রতিটা ফাইলের সর্বোচ্চ সাইজ — output limit */
  fileSizeKb?: number;
}

export interface RunOptions {
  limits: RunLimits;
  /** sandbox-এর ভেতরের path (যেমন "/tests/1.in" বা box-এর ভেতরের "in.txt") */
  stdin?: string;
  stdout?: string;
  stderr?: string;
  /** অতিরিক্ত read-only mount: { "/tests": "/host/path" } */
  mounts?: Record<string, string>;
  env?: Record<string, string>;
}

export interface RunResult {
  /** isolate-এর status: RE = non-zero exit, SG = signal, TO = timeout, XX = sandbox error */
  status?: "RE" | "SG" | "TO" | "XX";
  exitCode?: number;
  signal?: number;
  timeMs: number;
  wallTimeMs: number;
  /** cgroup-এ মাপা মোট memory (KB) */
  memoryKb: number;
  oomKilled: boolean;
  message?: string;
}

function exec(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(ISOLATE, args, { maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err ? (typeof err.code === "number" ? err.code : -1) : 0;
      resolve({ code, stdout, stderr });
    });
  });
}

export class Box {
  private constructor(
    readonly id: number,
    /** host-এ box-এর working directory (sandbox-এর ভেতরে এটা "/box") */
    readonly dir: string,
  ) {}

  static async create(id: number): Promise<Box> {
    // আগের কোনো রান থেকে থেকে গেলে আগে পরিষ্কার করি
    await exec(["--cg", `--box-id=${id}`, "--cleanup"]);
    const res = await exec(["--cg", `--box-id=${id}`, "--init"]);
    if (res.code !== 0) {
      throw new Error(`isolate --init failed (box ${id}): ${res.stderr.trim()}`);
    }
    return new Box(id, join(res.stdout.trim(), "box"));
  }

  async run(command: string[], opts: RunOptions): Promise<RunResult> {
    const { limits } = opts;
    const metaFile = join(tmpdir(), `vj-meta-${this.id}.txt`);
    const args = [
      "--cg",
      `--box-id=${this.id}`,
      `--meta=${metaFile}`,
      `--time=${limits.timeMs / 1000}`,
      `--wall-time=${limits.wallTimeMs / 1000}`,
      // TLE হলেও আসল সময় জানতে একটু বেশি চলতে দিই
      `--extra-time=${Math.min(0.5, limits.timeMs / 2000)}`,
      `--cg-mem=${limits.memoryKb}`,
      `--fsize=${limits.fileSizeKb ?? 64 * 1024}`,
      "--silent",
    ];
    if (limits.processes && limits.processes > 1) args.push(`--processes=${limits.processes}`);
    if (opts.stdin) args.push(`--stdin=${opts.stdin}`);
    if (opts.stdout) args.push(`--stdout=${opts.stdout}`);
    if (opts.stderr) args.push(`--stderr=${opts.stderr}`);
    for (const [inside, outside] of Object.entries(opts.mounts ?? {})) {
      args.push(`--dir=${inside}=${outside}`);
    }
    for (const [k, v] of Object.entries(opts.env ?? {})) args.push(`--env=${k}=${v}`);
    args.push("--run", "--", ...command);

    await rm(metaFile, { force: true });
    const res = await exec(args);
    // 0 = ঠিকঠাক শেষ, 1 = প্রোগ্রাম fail করেছে (TLE/RE ইত্যাদি) — এর বাইরে মানে isolate-এর নিজের সমস্যা
    if (res.code !== 0 && res.code !== 1) {
      throw new Error(`isolate --run failed (code ${res.code}): ${res.stderr.trim()}`);
    }
    return parseMeta(await readFile(metaFile, "utf8"));
  }

  async destroy(): Promise<void> {
    await exec(["--cg", `--box-id=${this.id}`, "--cleanup"]);
  }
}

function parseMeta(text: string): RunResult {
  const meta = new Map<string, string>();
  for (const line of text.split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta.set(line.slice(0, i), line.slice(i + 1).trim());
  }
  const num = (k: string) => (meta.has(k) ? Number(meta.get(k)) : undefined);

  return {
    status: meta.get("status") as RunResult["status"],
    exitCode: num("exitcode"),
    signal: num("exitsig"),
    timeMs: Math.round((num("time") ?? 0) * 1000),
    wallTimeMs: Math.round((num("time-wall") ?? 0) * 1000),
    memoryKb: num("cg-mem") ?? num("max-rss") ?? 0,
    oomKilled: meta.has("cg-oom-killed"),
    message: meta.get("message"),
  };
}
