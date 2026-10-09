// সব environment variable এক জায়গা থেকে পড়া হয়।

const list = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// কমা দিয়ে একাধিক origin দেওয়া যাবে, যেমন: http://localhost:3000,https://vibe-judge.vercel.app
const webOrigins = list(process.env.WEB_ORIGIN ?? "http://localhost:3000");
// ইউজার যে ঠিকানায় সাইট খোলে — Google লগইনের redirect এখানে ফেরে
const publicWebUrl = (process.env.PUBLIC_WEB_URL?.trim() || webOrigins[0] || "http://localhost:3000").replace(
  /\/+$/,
  "",
);

export const env = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? "0.0.0.0",
  databaseUrl: process.env.DATABASE_URL || undefined,
  webOrigins,
  publicWebUrl,
  // https সাইটে কুকি শুধু https দিয়ে যাবে
  cookieSecure: publicWebUrl.startsWith("https://"),
  version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? "dev",
  // Judge worker-দের গোপন টোকেন; খালি থাকলে /api/judge/* বন্ধ থাকে
  judgeToken: process.env.JUDGE_TOKEN || undefined,
  // এই ইমেইলগুলো দিয়ে লগইন করলে নিজে থেকে ADMIN হবে
  adminEmails: new Set(list(process.env.ADMIN_EMAILS).map((e) => e.toLowerCase())),
  // দুটোই থাকলে "Continue with Google" চালু হয়
  googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || undefined,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || undefined,
};

export const googleEnabled = Boolean(env.googleClientId && env.googleClientSecret);
