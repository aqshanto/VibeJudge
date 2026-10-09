// web, api আর judge — তিন জায়গাতেই এই টাইপগুলো ব্যবহার হবে।

export const APP_NAME = "VibeJudge";

export const VERDICTS = [
  "PENDING",
  "JUDGING",
  "AC", // Accepted
  "WA", // Wrong Answer
  "TLE", // Time Limit Exceeded
  "MLE", // Memory Limit Exceeded
  "RE", // Runtime Error
  "CE", // Compilation Error
  "IE", // Internal Error (judge-এর নিজের সমস্যা)
] as const;

export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_LABELS: Record<Verdict, string> = {
  PENDING: "Pending",
  JUDGING: "Judging",
  AC: "Accepted",
  WA: "Wrong Answer",
  TLE: "Time Limit Exceeded",
  MLE: "Memory Limit Exceeded",
  RE: "Runtime Error",
  CE: "Compilation Error",
  IE: "Internal Error",
};

export const LANGUAGES = ["c", "cpp"] as const;
export type Language = (typeof LANGUAGES)[number];

export const ROLES = ["USER", "AUTHOR", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

/** Judge শেষ করার পর যে verdict আসতে পারে */
export type FinalVerdict = Exclude<Verdict, "PENDING" | "JUDGING">;

export const MAX_SOURCE_BYTES = 64 * 1024;

// ---------- Judge worker ↔ API protocol ----------

/** POST /api/judge/claim — কাজ থাকলে এটা, না থাকলে 204 */
export interface JudgeJob {
  submissionId: string;
  claimToken: string;
  language: Language;
  source: string;
  problem: {
    id: string;
    dataVersion: number;
    timeLimitMs: number;
    memoryLimitKb: number;
    hasChecker: boolean;
  };
}

/** GET /api/judge/problems/:id/data — টেস্ট (base64) আর checker সোর্স */
export interface ProblemData {
  dataVersion: number;
  checkerSource: string | null;
  tests: { name: string; input: string; answer: string }[];
}

export interface TestResult {
  name: string;
  verdict: FinalVerdict;
  timeMs: number;
  memoryKb: number;
  message?: string;
}

/** POST /api/judge/submissions/:id/result */
export interface JudgeReport {
  claimToken: string;
  verdict: FinalVerdict;
  timeMs: number;
  memoryKb: number;
  compileOutput?: string;
  tests: TestResult[];
}

// ---------- Public API ----------

export interface SubmissionView {
  id: string;
  problem: { slug: string; title: string };
  language: Language;
  source: string;
  verdict: Verdict;
  timeMs: number | null;
  memoryKb: number | null;
  compileOutput: string | null;
  tests: TestResult[];
  createdAt: string;
  judgedAt: string | null;
}

export interface ProblemView {
  id: string;
  slug: string;
  title: string;
  statement: string;
  timeLimitMs: number;
  memoryLimitKb: number;
  samples: { input: string; answer: string }[];
}

export interface HealthResponse {
  status: "ok" | "degraded";
  service: string;
  version: string;
  time: string;
  database: "connected" | "not_checked" | "not_configured" | "error";
}
