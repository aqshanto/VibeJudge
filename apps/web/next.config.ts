import type { NextConfig } from "next";

// API কোথায় চলছে। লোকালি localhost:4000, Vercel-এ Render-এর URL (env variable হিসেবে দিতে হবে)।
const apiUrl = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // ব্রাউজার /api/* কল করবে web-এর নিজের ডোমেইনে, Next সেটা API সার্ভারে পাঠিয়ে দেবে।
  // এতে লগইন কুকি same-origin থাকবে (third-party cookie সমস্যা হবে না)।
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
