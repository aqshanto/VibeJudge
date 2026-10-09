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

export interface HealthResponse {
  status: "ok" | "degraded";
  service: string;
  version: string;
  time: string;
  database: "connected" | "not_configured" | "error";
}
