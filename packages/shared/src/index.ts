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
  /** IOI: প্রথম ভুলে না থেমে সব টেস্ট চালাও (আংশিক নম্বরের জন্য) */
  runAllTests: boolean;
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
  user: { username: string } | null;
  language: Language;
  /** শুধু নিজের সাবমিশনে (বা Admin হলে) থাকে, অন্যদের জন্য null */
  source: string | null;
  verdict: Verdict;
  timeMs: number | null;
  memoryKb: number | null;
  compileOutput: string | null;
  tests: TestResult[];
  /** কনটেস্টের ভেতর থেকে হলে: কোন কনটেস্ট, কোন লেবেল, আর standings-এ গোনা হবে কি না */
  contest: { slug: string; label: string; inContest: boolean } | null;
  /** IOI নম্বর (০-১০০) */
  score: number | null;
  createdAt: string;
  judgedAt: string | null;
}

/** GET /api/submissions — তালিকার একটা সারি (সোর্স কোড ছাড়া) */
export interface SubmissionRow {
  id: string;
  problem: { slug: string; title: string };
  user: { username: string } | null;
  language: Language;
  verdict: Verdict;
  timeMs: number | null;
  memoryKb: number | null;
  /** কনটেস্টের ভেতর থেকে হলে: কোন কনটেস্ট, কোন লেবেল, আর standings-এ গোনা হবে কি না */
  contest: { slug: string; label: string; inContest: boolean } | null;
  /** IOI নম্বর (০-১০০) */
  score: number | null;
  createdAt: string;
}

export interface SubmissionPage {
  submissions: SubmissionRow[];
  /** পরের পাতার জন্য; null মানে আর নেই */
  nextCursor: string | null;
}

export interface ProblemView {
  id: string;
  slug: string;
  title: string;
  /** PUBLIC ছাড়া অন্য কিছু হলে দেখছেন শুধু author/admin */
  visibility: "PRIVATE" | "CONTEST" | "PUBLIC";
  statement: string;
  timeLimitMs: number;
  memoryLimitKb: number;
  samples: { input: string; answer: string }[];
}

// ---------- Auth ----------

/** a-z, 0-9, _ . - ; ৩-২০ অক্ষর; সবসময় lowercase */
export const USERNAME_PATTERN = "^[a-z0-9_.-]{3,20}$";
export const PASSWORD_MIN_LENGTH = 8;

export interface AuthUser {
  id: string;
  username: string;
  displayName: string | null;
  email: string;
  role: Role;
}

/** GET /api/auth/me */
export interface MeResponse {
  user: AuthUser | null;
  googleEnabled: boolean;
}

export type AuthorRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface AuthorRequestView {
  id: string;
  message: string;
  status: AuthorRequestStatus;
  createdAt: string;
  reviewedAt: string | null;
  user: { username: string; displayName: string | null; email: string };
}

// ---------- Problem authoring ----------

export const VISIBILITIES = ["PRIVATE", "CONTEST", "PUBLIC"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/** ছোট হাতের অক্ষর, সংখ্যা আর "-"; ৩-৪০ অক্ষর */
export const SLUG_PATTERN = "^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$";
/** Vercel-এর ভেতর দিয়ে একবারে পাঠানো যায় এমন সীমা (base64-সহ ~৩.৪ MB) */
export const MAX_TEST_FILE_BYTES = 2.5 * 1024 * 1024;
/** একটা প্রবলেমের সব টেস্ট মিলিয়ে (DB-তে থাকে, তাই আপাতত ছোট) */
export const MAX_PROBLEM_TESTS_BYTES = 30 * 1024 * 1024;
export const MAX_TESTS_PER_PROBLEM = 200;

export const LIMITS = {
  timeMs: { min: 100, max: 15_000 },
  memoryKb: { min: 16 * 1024, max: 1024 * 1024 },
} as const;

export interface AuthorProblemSummary {
  id: string;
  slug: string;
  title: string;
  visibility: Visibility;
  testCount: number;
  author: string | null;
  updatedAt: string;
}

export interface TestMeta {
  ordinal: number;
  isSample: boolean;
  inputBytes: number;
  answerBytes: number;
  /** প্রথম ~২০০ অক্ষর */
  inputPreview: string;
  answerPreview: string;
}

export interface AuthorProblemDetail {
  id: string;
  slug: string;
  title: string;
  statement: string;
  timeLimitMs: number;
  memoryLimitKb: number;
  visibility: Visibility;
  checkerSource: string | null;
  dataVersion: number;
  tests: TestMeta[];
  updatedAt: string;
}

export type ProblemUpdate = Partial<
  Pick<AuthorProblemDetail, "slug" | "title" | "statement" | "timeLimitMs" | "memoryLimitKb" | "visibility" | "checkerSource">
>;

/** PUT/POST /api/author/problems/:id/tests — base64 */
export interface TestUpload {
  mode: "replace" | "append";
  tests: { input: string; answer: string; isSample: boolean }[];
}

// ---------- Contests ----------

export type ScoringType = "ICPC" | "IOI";
export type ContestPhase = "UPCOMING" | "RUNNING" | "ENDED";

export const CONTEST_LIMITS = {
  durationMinutes: { min: 5, max: 14 * 24 * 60 },
  penaltyMinutes: { min: 0, max: 120 },
  maxProblems: 26,
} as const;

/** label: "A".."Z" */
export const problemLabel = (index: number) => String.fromCharCode(65 + index);

export function contestPhase(startsAt: string | Date, durationMinutes: number, now = Date.now()): ContestPhase {
  const start = new Date(startsAt).getTime();
  if (now < start) return "UPCOMING";
  if (now < start + durationMinutes * 60_000) return "RUNNING";
  return "ENDED";
}

export interface ContestSummary {
  id: string;
  slug: string;
  title: string;
  startsAt: string;
  durationMinutes: number;
  scoring: ScoringType;
  isPublic: boolean;
  author: string | null;
  participantCount: number;
}

export interface ContestProblemRef {
  label: string;
  slug: string;
  title: string;
}

/** GET /api/contests/:slug */
export interface ContestDetail extends ContestSummary {
  description: string;
  penaltyMinutes: number;
  freezeMinutes: number;
  hasPassword: boolean;
  /** সার্ভারের বর্তমান সময় — ব্রাউজারের ঘড়ি ভুল থাকলেও countdown ঠিক থাকে */
  serverTime: string;
  /** দেখার অনুমতি না থাকলে খালি (যেমন শুরুর আগে) */
  problems: ContestProblemRef[];
  viewer: {
    registered: boolean;
    /** author বা admin */
    canManage: boolean;
  };
}

/** POST/PATCH /api/contests */
export interface ContestInput {
  slug: string;
  title: string;
  description: string;
  startsAt: string;
  durationMinutes: number;
  scoring: ScoringType;
  penaltyMinutes: number;
  freezeMinutes: number;
  isPublic: boolean;
  /** undefined = বদলাবে না, "" = পাসওয়ার্ড তুলে দাও */
  password?: string;
  /** প্রবলেমের slug, ক্রমানুসারে (A, B, C …) */
  problemSlugs: string[];
}

/** standings-এর একটা ঘর (একজন প্রতিযোগী × একটা প্রবলেম) */
export interface StandingsCell {
  /** ICPC: AC হয়েছে কি না */
  solved: boolean;
  /** ICPC: AC-এর আগে ভুল সাবমিশন (না হলে মোট ভুল); CE/IE গোনা হয় না */
  wrong: number;
  /** ICPC: কনটেস্ট শুরু থেকে কত মিনিটে AC */
  solvedAtMinute: number | null;
  /** এই প্রবলেম সবার আগে এই প্রতিযোগী সলভ করেছে */
  firstSolve: boolean;
  /** IOI: সবচেয়ে ভালো নম্বর (কোনো judged সাবমিশন না থাকলে null) */
  score: number | null;
  /** judge হচ্ছে বা freeze-এর কারণে লুকানো সাবমিশন */
  pending: number;
}

export interface StandingsRow {
  rank: number;
  username: string;
  displayName: string | null;
  institution: string | null;
  section: string | null;
  /** ICPC: সলভ সংখ্যা; IOI: মোট নম্বর */
  points: number;
  /** ICPC: মোট penalty মিনিট (IOI-তে ০) */
  penalty: number;
  /** প্রবলেমের লেবেল অনুযায়ী */
  cells: Record<string, StandingsCell>;
}

/** GET /api/contests/:slug/standings */
export interface StandingsView {
  scoring: ScoringType;
  /** এই দর্শকের জন্য freeze চলছে (শেষের সাবমিশন "?" দেখায়) */
  frozen: boolean;
  problems: { label: string; title: string; solvedBy: number; triedBy: number }[];
  rows: StandingsRow[];
  generatedAt: string;
}

export interface ContestProblemView extends ProblemView {
  label: string;
  contest: { slug: string; title: string; phase: ContestPhase };
}

export interface HealthResponse {
  status: "ok" | "degraded";
  service: string;
  version: string;
  time: string;
  database: "connected" | "not_checked" | "not_configured" | "error";
}
