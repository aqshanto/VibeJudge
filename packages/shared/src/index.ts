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

export const LANGUAGES = ["c", "cpp", "java", "python"] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_INFO: Record<Language, { name: string; short: string; timeFactor: number }> = {
  c: { name: "C (GCC 14, C17)", short: "C", timeFactor: 1 },
  cpp: { name: "C++ (GCC 14, C++20)", short: "C++", timeFactor: 1 },
  // ধীর ভাষায় বেশি সময় (অনেক OJ-এর নিয়ম); বদলাতে চাইলে শুধু এখানে
  java: { name: "Java (OpenJDK 21)", short: "Java", timeFactor: 2 },
  python: { name: "Python 3 (3.13)", short: "Python", timeFactor: 3 },
};

/** এই ভাষায় আসল time limit (প্রবলেমের limit × ভাষার গুণক) */
export function timeLimitFor(baseMs: number, language: Language): number {
  return Math.round(baseMs * LANGUAGE_INFO[language].timeFactor);
}

/** নতুন কনটেস্টে ডিফল্ট ভাষা; বাকিগুলো author চালু করেন */
export const DEFAULT_CONTEST_LANGUAGES: Language[] = ["c", "cpp"];
/** পুরোনো worker (যে ভাষার তালিকা পাঠায় না) শুধু এগুলো পারে */
export const LEGACY_WORKER_LANGUAGES: Language[] = ["c", "cpp"];

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

/** judge চলাকালীন অগ্রগতি (শুধু API-র memory-তে থাকে, DB-তে না) */
export interface JudgeProgress {
  phase: "compiling" | "running";
  /** কয়টা টেস্ট শেষ */
  done: number;
  total: number;
}

/** POST /api/judge/submissions/:id/progress */
export interface JudgeProgressReport extends JudgeProgress {
  claimToken: string;
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
  /** JUDGING হলে worker-এর জানানো অগ্রগতি (পুরোনো worker হলে null) */
  progress: JudgeProgress | null;
  /** PENDING হলে লাইনে কততম (১ = পরেরটাই এটা) */
  queuePosition: number | null;
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
  /** JUDGING হলে worker-এর জানানো অগ্রগতি (পুরোনো worker হলে null) */
  progress: JudgeProgress | null;
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

/**
 * a-z, 0-9, _ . - ; ৩-২০ অক্ষর; সবসময় lowercase।
 * "-" escape করা — ব্রাউজার HTML `pattern` "v" flag দিয়ে পড়ে, সেখানে খালি "-" অবৈধ।
 */
export const USERNAME_PATTERN = "^[a-z0-9_.\\-]{3,20}$";
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
export const SLUG_PATTERN = "^[a-z0-9][a-z0-9\\-]{1,38}[a-z0-9]$";
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

/**
 * FIXED: সবাই একসাথে startsAt থেকে durationMinutes।
 * WINDOW: startsAt…endsAt জানালার মধ্যে প্রত্যেকে নিজের সময়ে "Start" চাপে, পায় durationMinutes
 * (জানালা বন্ধ হওয়ার পরে আর না)।
 */
export const CONTEST_TYPES = ["FIXED", "WINDOW"] as const;
export type ContestType = (typeof CONTEST_TYPES)[number];

/** পুরো কনটেস্টের phase (WINDOW-এ: জানালা খোলার আগে / খোলা / বন্ধ) */
export function contestPhase(startsAt: string | Date, endsAt: string | Date, now = Date.now()): ContestPhase {
  if (now < new Date(startsAt).getTime()) return "UPCOMING";
  if (now < new Date(endsAt).getTime()) return "RUNNING";
  return "ENDED";
}

/** একজন প্রতিযোগীর নিজের ঘড়ি (WINDOW বা virtual-এ প্রত্যেকের আলাদা) */
export type PersonalState = "NOT_STARTED" | "RUNNING" | "FINISHED";

export interface Participation {
  /** কনটেস্ট শেষ হওয়ার পরে নিজে নিজে দেওয়া */
  virtual: boolean;
  /** WINDOW/virtual-এ "Start" চাপার সময়; FIXED-এ null */
  startedAt: string | Date | null;
}

/** প্রতিযোগীর নিজের শুরু-শেষ (ms); WINDOW/virtual-এ Start না চাপলে null */
export function personalWindow(
  contest: { type: ContestType; startsAt: string | Date; endsAt: string | Date; durationMinutes: number },
  p: Participation,
): { start: number; end: number } | null {
  if (!p.virtual && contest.type === "FIXED") {
    return { start: new Date(contest.startsAt).getTime(), end: new Date(contest.endsAt).getTime() };
  }
  if (!p.startedAt) return null;
  const start = new Date(p.startedAt).getTime();
  const full = start + contest.durationMinutes * 60_000;
  // দেরিতে শুরু করলে জানালা বন্ধ হওয়ার সাথে সাথেই শেষ
  return { start, end: p.virtual ? full : Math.min(full, new Date(contest.endsAt).getTime()) };
}

export function personalState(win: { start: number; end: number } | null, now = Date.now()): PersonalState {
  if (!win || now < win.start) return "NOT_STARTED";
  return now < win.end ? "RUNNING" : "FINISHED";
}

export interface ContestSummary {
  id: string;
  slug: string;
  title: string;
  type: ContestType;
  startsAt: string;
  /** FIXED: startsAt + durationMinutes; WINDOW: জানালা বন্ধের সময় */
  endsAt: string;
  /** WINDOW-এ: প্রত্যেক প্রতিযোগী কত মিনিট পায় */
  durationMinutes: number;
  scoring: ScoringType;
  isPublic: boolean;
  author: string | null;
  /** virtual বাদে */
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
  /** এই কনটেস্টে যে ভাষাগুলোতে সাবমিট করা যায় */
  languages: Language[];
  /** সার্ভারের বর্তমান সময় — ব্রাউজারের ঘড়ি ভুল থাকলেও countdown ঠিক থাকে */
  serverTime: string;
  /** দেখার অনুমতি না থাকলে খালি (যেমন শুরুর আগে) */
  problems: ContestProblemRef[];
  viewer: {
    /** আসল রেজিস্ট্রেশন (virtual না) */
    registered: boolean;
    /** author বা admin */
    canManage: boolean;
    /** রেজিস্টার করা বা virtual — না হলে null */
    participation: {
      virtual: boolean;
      /** WINDOW/virtual-এ Start চাপার সময় */
      startedAt: string | null;
      /** নিজের শেষ সময় (Start না চাপলে null) */
      endsAt: string | null;
    } | null;
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
  /** undefined = FIXED */
  type?: ContestType;
  /** WINDOW-এ জানালা কত মিনিট খোলা (durationMinutes-এর সমান বা বেশি) */
  windowMinutes?: number;
  /** undefined = বদলাবে না, "" = পাসওয়ার্ড তুলে দাও */
  password?: string;
  /** undefined = নতুন কনটেস্টে C/C++, এডিটে বদলাবে না */
  languages?: Language[];
  /** প্রবলেমের slug, ক্রমানুসারে (A, B, C …) */
  problemSlugs: string[];
}

/** standings-এর একটা ঘর (একজন প্রতিযোগী × একটা প্রবলেম) */
export interface StandingsCell {
  /** ICPC: AC হয়েছে কি না */
  solved: boolean;
  /** ICPC: AC-এর আগে ভুল সাবমিশন (না হলে মোট ভুল); CE/IE গোনা হয় না */
  wrong: number;
  /** ICPC: প্রতিযোগীর নিজের শুরু থেকে কত মিনিটে AC (WINDOW/virtual-এ নিজের Start থেকে) */
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
  batch: string | null;
  section: string | null;
  /** ICPC: সলভ সংখ্যা; IOI: মোট নম্বর */
  points: number;
  /** ICPC: মোট penalty মিনিট (IOI-তে ০) */
  penalty: number;
  /** প্রবলেমের লেবেল অনুযায়ী */
  cells: Record<string, StandingsCell>;
  /** কনটেস্ট শেষে নিজে দেওয়া — rank আসলদের মধ্যে কোথায় পড়ত (আসলদের rank বদলায় না) */
  virtual: boolean;
}

/** GET /api/contests/:slug/standings */
export interface StandingsView {
  scoring: ScoringType;
  /** এই দর্শকের জন্য freeze চলছে (শেষের সাবমিশন "?" দেখায়) */
  frozen: boolean;
  problems: { label: string; title: string; solvedBy: number; triedBy: number }[];
  rows: StandingsRow[];
  /** virtual চলাকালীন: আসল প্রতিযোগীদের এই মিনিট পর্যন্ত অবস্থা দেখানো হচ্ছে */
  ghostMinute?: number;
  generatedAt: string;
}

export interface AnnouncementView {
  id: string;
  message: string;
  createdAt: string;
}

export interface ClarificationView {
  id: string;
  /** কোন প্রবলেম নিয়ে ("A" …) বা null = সাধারণ */
  label: string | null;
  question: string;
  answer: string | null;
  isPublic: boolean;
  /** শুধু manager আর প্রশ্নকারী নিজে দেখে */
  askedBy: string | null;
  mine: boolean;
  createdAt: string;
  answeredAt: string | null;
}

/** GET /api/contests/:slug/messages */
export interface ContestMessages {
  announcements: AnnouncementView[];
  clarifications: ClarificationView[];
}

/** GET /api/contests/:slug/plagiarism — শুধু কনটেস্টের author/admin */
export interface PlagiarismReport {
  minSimilarity: number;
  problems: {
    label: string;
    title: string;
    /** কতজনের সাবমিশন তুলনা হয়েছে */
    compared: number;
    pairs: {
      similarity: number;
      a: { submissionId: string; username: string };
      b: { submissionId: string; username: string };
    }[];
  }[];
  generatedAt: string;
}

/** GET /api/contests/:slug/plagiarism/compare?a=…&b=… */
export interface PlagiarismCompare {
  similarity: number;
  label: string;
  a: { submissionId: string; username: string; verdict: Verdict; source: string; lines: number[] };
  b: { submissionId: string; username: string; verdict: Verdict; source: string; lines: number[] };
}

export interface ContestProblemView extends ProblemView {
  label: string;
  contest: { slug: string; title: string; phase: ContestPhase };
}

// ---------- Admin: বাল্ক অ্যাকাউন্ট ----------

export const MAX_BULK_ROWS = 200; // এক request-এ; ব্রাউজার বড় তালিকা ভাগে ভাগে পাঠায়

export interface BulkUserRow {
  username: string;
  displayName?: string;
  email?: string;
  institution?: string;
  batch?: string;
  section?: string;
}

/** POST /api/admin/users/bulk */
export interface BulkUserRequest {
  rows: BulkUserRow[];
  /** দিলে নতুন (আর আগে থেকে থাকা) অ্যাকাউন্টগুলো এই কনটেস্টে রেজিস্টার হয় */
  contestSlug?: string;
}

export interface BulkUserResult {
  /** পাসওয়ার্ড শুধু এখানেই একবার আসে — সার্ভারে আসল পাসওয়ার্ড জমা থাকে না */
  created: { username: string; password: string; displayName: string | null; section: string | null }[];
  skipped: { username: string; reason: string }[];
  registered: number;
}

// ---------- Users ----------

export interface UserProfile {
  username: string;
  displayName: string | null;
  institution: string | null;
  batch: string | null;
  section: string | null;
  role: Role;
  joinedAt: string;
  stats: { solved: number; submissions: number; accepted: number };
  /** Public প্রবলেম যেগুলো সলভ করেছে */
  solvedProblems: { slug: string; title: string }[];
  authoredContests: ContestSummary[];
  participatedContests: ContestSummary[];
  /** নিজের প্রোফাইল হলে true (এডিট করা যায়) */
  isMe: boolean;
  /** পাসওয়ার্ড আছে কি না (শুধু Google অ্যাকাউন্টে false) — শুধু নিজে বা admin দেখলে */
  hasPassword: boolean | null;
  /** গত ~১ বছরের প্রতিদিনের সাবমিশন (বাংলাদেশ সময়ে, শুধু যেদিন কিছু আছে) */
  activity: ActivityDay[];
}

export interface ActivityDay {
  /** "YYYY-MM-DD" */
  date: string;
  submissions: number;
  accepted: number;
}

/** কোন সময় অঞ্চলে "দিন" ধরা হয় (heatmap) */
export const DISPLAY_TIME_ZONE = "Asia/Dhaka";

export interface ProfileUpdate {
  displayName?: string;
  institution?: string;
  batch?: string;
  section?: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  service: string;
  version: string;
  time: string;
  database: "connected" | "not_checked" | "not_configured" | "error";
}
