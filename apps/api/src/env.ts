// সব environment variable এক জায়গা থেকে পড়া হয়।

export const env = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? "0.0.0.0",
  databaseUrl: process.env.DATABASE_URL || undefined,
  // কমা দিয়ে একাধিক origin দেওয়া যাবে, যেমন: http://localhost:3000,https://vibejudge.vercel.app
  webOrigins: (process.env.WEB_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? "dev",
  // Judge worker-দের গোপন টোকেন; খালি থাকলে /api/judge/* বন্ধ থাকে
  judgeToken: process.env.JUDGE_TOKEN || undefined,
};
