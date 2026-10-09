# VibeJudge — ড্রাফট প্ল্যান (v0.1)

> একটা Online Judge যেখানে Toph-এর মতো **কাস্টম প্রবলেম ও কনটেস্ট** হোস্ট করা যাবে।
> লক্ষ্য: DIU-এর ল্যাব ফাইনাল / Take-Off-এর মতো **১০০০+ জনের কনটেস্ট** ফ্রি সার্ভারে চালানো।
> এটা জীবন্ত ডকুমেন্ট — কাজ করতে করতে আপডেট হবে।

---

## ১. ইন্টারভিউ থেকে যা ঠিক হলো

| বিষয় | সিদ্ধান্ত |
|---|---|
| ভাষা (প্রথম ভার্সন) | C, C++ |
| প্রবলেম | শুধু কাস্টম প্রবলেম (অন্য OJ-এর প্রবলেম → পরের ফেজে) |
| পারমিশন | যে কেউ অ্যাকাউন্ট খুলবে; **Author** হতে Admin-এর approval লাগবে |
| স্কোরিং | ICPC **এবং** IOI (partial) — কনটেস্ট বানানোর সময় বেছে নেবে |
| লগইন | Google + Email/Password + Admin-এর বাল্ক অ্যাকাউন্ট (CSV) |
| কনটেস্ট ফিচার | Standings freeze, Clarification, Announcement, Plagiarism check, Private contest |
| কনটেস্ট টাইপ | Fixed time, Virtual participation, Window contest, Upsolve |
| প্রবলেম ফিচার | Special Judge (checker), LaTeX math, Practice/Upsolve, Problem Archive |
| প্রবলেম visibility | Private / Contest-only / Public (Author চাইলে Problemset-এ রাখবে) |
| প্রোফাইল | Solved + সাবমিশন হিস্ট্রি, Heatmap, Rating, Institution/Batch/Section, Authored & Participated কনটেস্ট |
| টিম | আগে Individual, পরে Team (ডাটাবেস এখন থেকেই তৈরি রাখব) |
| UI ভাষা | English (স্টেটমেন্ট বাংলায় লেখা যাবে) |
| বাজেট | একদম ফ্রি |
| ডেমো টার্গেট | ১-২ মাস |

**সত্যি কথা:**
- "Space complexity" অটোমেটিক বের করা অসম্ভব — আমরা দেখাব **Time (ms)** আর **Memory (KB)**, যেটা সব OJ দেখায়।
- কোড রান করা (judge) Vercel/Render-এ সম্ভব না — তাই আলাদা **Judge Worker** লাগবে (নিচে দেখো)।

---

## ২. আর্কিটেকচার (বড় ছবি)

```
                ┌──────────────────────┐
  ইউজার ──────► │  Web (Next.js)       │  ← Vercel (ফ্রি)
                │  vibejudge.vercel.app│
                └─────────┬────────────┘
                          │  /api/* (Vercel rewrite → একই ডোমেইন, কুকি সমস্যা নেই)
                ┌─────────▼────────────┐
                │  API (Node/Fastify)  │  ← Render (ফ্রি)
                └──┬──────────────┬────┘
                   │              │
          ┌────────▼───┐   ┌──────▼──────────┐
          │ PostgreSQL │   │ File Storage    │
          │ (Neon)     │   │ (Cloudflare R2) │  ← টেস্ট ডাটা, চেকার
          └────────────┘   └─────────────────┘
                   ▲
                   │ HTTPS: "আমাকে একটা সাবমিশন দাও" (worker নিজে টেনে আনে)
     ┌─────────────┼──────────────┬───────────────┐
 [Judge Worker] [Judge Worker] [Judge Worker]  ... যত খুশি
  তোমার ল্যাপটপ   Oracle Free VM   ভার্সিটির ল্যাব পিসি
```

**কেন এই ডিজাইন?**
- Judge worker **নিজে** API থেকে কাজ টেনে আনে → ল্যাপটপ/ল্যাব পিসিতে public IP বা port forwarding লাগে না।
- Worker-এর কাছে ডাটাবেস পাসওয়ার্ড থাকে না, শুধু একটা worker token → ল্যাব পিসিতে চালানো নিরাপদ।
- **স্কেল করা = আরও worker চালু করা।** ১০০০ জনের কনটেস্টে ৫-১০টা worker দিলেই হবে।
- প্রথম ভার্সনে Redis লাগবে না — Postgres-এর `FOR UPDATE SKIP LOCKED` দিয়েই কিউ বানাব (একটা সার্ভিস কম = ঝামেলা কম)।

---

## ৩. টেক স্ট্যাক

পুরো প্রজেক্ট এক ভাষায় — **TypeScript** (ফ্রন্টএন্ড, ব্যাকএন্ড, worker সব)।

| অংশ | টেকনোলজি | কেন |
|---|---|---|
| Frontend | **Next.js** (App Router) + TypeScript | Vercel-এ সবচেয়ে সহজ ডিপ্লয় |
| UI | **Tailwind CSS + shadcn/ui** | দ্রুত সুন্দর UI |
| Code editor | **Monaco Editor** | VS Code-এর এডিটর, ব্রাউজারে |
| Statement | Markdown + **KaTeX** | `$10^9$` এর মতো ম্যাথ |
| Backend API | **Fastify** + **Zod** | দ্রুত, ইনপুট ভ্যালিডেশন সহজ |
| Database | **PostgreSQL** (Neon ফ্রি) + **Prisma** ORM | রিলেশনাল ডাটা (কনটেস্ট/সাবমিশন) এর জন্য সেরা |
| Auth | Google OAuth + Email/Password (bcrypt), httpOnly cookie session | |
| Email | **Resend** (ফ্রি টায়ার) | ভেরিফিকেশন, পাসওয়ার্ড রিসেট |
| File storage | **Cloudflare R2** (ফ্রি, egress ফ্রি) | টেস্ট কেস zip, চেকার |
| Sandbox | **isolate** (IOI-এর অফিশিয়াল sandbox) | সঠিক time/memory মাপে, নেটওয়ার্ক বন্ধ রাখে |
| Judge worker | Node.js + Docker (isolate + gcc/g++) | যেকোনো Linux/WSL2 মেশিনে চলবে |
| Special judge | **testlib.h** checker | Codeforces/Polygon-এর স্ট্যান্ডার্ড |
| Plagiarism | **Dolos** (ওপেন সোর্স, লোকালি চলে) | MOSS-এর মতো, কিন্তু বাইরের সার্ভিস লাগে না |
| Monorepo | **pnpm workspaces** | web, api, judge এক রিপোতে, টাইপ শেয়ার |

### ফোল্ডার স্ট্রাকচার
```
VibeJudge/
├── apps/
│   ├── web/      → Next.js (Vercel)
│   ├── api/      → Fastify (Render)
│   └── judge/    → Judge worker (Docker)
├── packages/
│   └── shared/   → কমন টাইপ, verdict enum, zod schema
└── PLAN.md
```

---

## ৪. মূল কনসেপ্ট

### রোল
- **User** — সলভ করা, কনটেস্টে জয়েন
- **Author** — প্রবলেম ও কনটেস্ট বানানো (Admin approve করলে)
- **Admin** — সব কিছু (স্যার), Author request approve, বাল্ক অ্যাকাউন্ট

### Verdict
`Pending → Judging → AC | WA | TLE | MLE | RE | CE | IE(Internal Error)`
প্রতিটি সাবমিশনে: time (ms), memory (KB), কোন টেস্টে ফেল, IOI হলে score।

### মূল ডাটাবেস টেবিল (খসড়া)
`users`, `author_requests`, `problems`, `test_cases`, `contests`, `contest_problems`,
`contest_participants` (পরে `teams`), `submissions`, `clarifications`, `announcements`

---

## ৫. ফেজ অনুযায়ী কাজ

> নিয়ম: **সবচেয়ে কঠিন/ঝুঁকির জিনিস আগে** — তাই Judge প্রথমে।

### ফেজ ০ — সেটআপ (সপ্তাহ ১)
- [x] রিপো + pnpm monorepo (web, api, shared)
- [x] লোকালি web → api কানেক্ট (health check)
- [x] Render Blueprint (`render.yaml`) + Vercel rewrite কনফিগ
- [x] GitHub-এ পুশ
- [x] API Render-এ ডিপ্লয় (DB connected)
- [x] Web Vercel-এ ডিপ্লয় → https://vibe-judge.vercel.app (API + DB connected)
- [x] Neon ডাটাবেস + Prisma কানেক্ট + প্রথম migration (`init`)

### ফেজ ১ — Judge কোর (সপ্তাহ ১-২) ⭐ সবচেয়ে গুরুত্বপূর্ণ
- [ ] Docker-এ isolate + gcc/g++ (তোমার পিসিতে WSL2/Docker দিয়ে)
- [ ] C/C++ compile → টেস্ট রান → output মেলানো
- [ ] সব verdict + time/memory মাপা
- [ ] API থেকে কাজ টানা (pull) আর রেজাল্ট পাঠানো
- [ ] testlib checker সাপোর্ট (special judge)

### ফেজ ২ — ইউজার ও প্রবলেম (সপ্তাহ ৩-৪)
- [ ] সাইনআপ/লগইন (Google + Email), রোল, Author request
- [ ] প্রবলেম বানানো: স্টেটমেন্ট (Markdown+LaTeX), sample, টেস্ট zip আপলোড, time/memory limit, checker
- [ ] Visibility: Private / Contest-only / Public
- [ ] Problem Archive পেজ + প্র্যাকটিস সাবমিট
- [ ] সাবমিশন পেজ (লাইভ verdict)

### ফেজ ৩ — কনটেস্ট (সপ্তাহ ৫-৬)
- [ ] কনটেস্ট বানানো (ICPC/IOI, Fixed time, Private: পাসওয়ার্ড/ইনভাইট)
- [ ] রেজিস্ট্রেশন, প্রবলেম পেজ, সাবমিট
- [ ] লাইভ Standings (প্রতি ১৫-৩০ সেকেন্ডে রিফ্রেশ, cached) + Freeze
- [ ] Clarification + Announcement
- [ ] কনটেস্ট শেষে Upsolve
- [ ] প্রোফাইলে Authored ও Participated কনটেস্ট

### 🎯 এখানে স্যারকে ডেমো (~৬-৮ সপ্তাহ)

### ফেজ ৪ — ল্যাব ফাইনাল ফিচার (সপ্তাহ ৭-৮)
- [ ] Admin বাল্ক অ্যাকাউন্ট (CSV আপলোড → ID/পাসওয়ার্ড)
- [ ] Institution / Batch / Section + Standings ফিল্টার
- [ ] Standings CSV/Excel এক্সপোর্ট (মার্কস দেওয়ার জন্য)
- [ ] Plagiarism রিপোর্ট (Dolos)
- [ ] প্রোফাইল: Solved, সাবমিশন হিস্ট্রি, Heatmap

### ফেজ ৫ — ডেমোর পরে
- [ ] Virtual participation, Window contest
- [ ] Rating সিস্টেম
- [ ] Team contest
- [ ] আরও ভাষা (Python, Java)
- [ ] অন্য OJ-এর প্রবলেম (প্রথমে Codeforces API দিয়ে verdict ট্র্যাকিং)
- [ ] Load test (১০০০ ভার্চুয়াল ইউজার দিয়ে k6)

---

## ৬. ফ্রি টায়ারের সীমাবদ্ধতা (আগে থেকে জেনে রাখো)

| সমস্যা | সমাধান |
|---|---|
| Render ফ্রি সার্ভার ১৫ মিনিট idle থাকলে ঘুমিয়ে যায় | কনটেস্টের আগে জাগিয়ে রাখা (cron-job.org দিয়ে ping); বড় কনটেস্টে API-কে Oracle VM-এ সরানো |
| Render ফ্রিতে RAM/CPU কম — ১০০০ জন একসাথে চাপ দিলে ধীর হতে পারে | Standings cache করা; দরকার হলে API Oracle VM-এ (২৪GB RAM ফ্রি) |
| নিজের পিসিতে worker → লোডশেডিং/নেট চলে যাওয়ার ঝুঁকি | আসল কনটেস্টে Oracle VM প্রধান worker, পিসি/ল্যাব শুধু বাড়তি |
| Neon/R2/Resend-এর ফ্রি লিমিট | শুরুর আগে বর্তমান লিমিট চেক করে নেব |

> ডিজাইন এমন যে পরে টাকা পেলে **কোড না বদলে** শুধু সার্ভার বদলালেই চলবে।

---

## ৭. যে অ্যাকাউন্টগুলো লাগবে (সব ফ্রি)
- [ ] GitHub
- [ ] Vercel
- [ ] Render
- [ ] Neon (Postgres)
- [ ] Cloudflare (R2)
- [ ] Google Cloud Console (Google লগইনের OAuth key)
- [ ] Resend (ইমেইল)
- [ ] Oracle Cloud (Judge VM — কার্ড ভেরিফিকেশন লাগে)
- [ ] তোমার পিসিতে: Node.js, pnpm, Git, Docker Desktop + WSL2

---

## ৮. পরে ঠিক করতে হবে (Open Questions)
- কনটেস্ট চলাকালীন অন্যের কোড দেখা যাবে কি না (সাধারণত না; শেষে হ্যাঁ?)
- সাবমিশন rate limit (যেমন প্রতি ৩০ সেকেন্ডে ১টা?)
- Interactive প্রবলেম লাগবে কি না
- IOI-তে subtask লাগবে নাকি শুধু per-test score
- কাস্টম ডোমেইন (ভার্সিটির সাবডোমেইন পাওয়া যাবে কি না — স্যারকে জিজ্ঞেস)
