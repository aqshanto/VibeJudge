# VibeJudge — ড্রাফট প্ল্যান (v0.1)

> একটা Online Judge যেখানে Toph-এর মতো **কাস্টম প্রবলেম ও কনটেস্ট** হোস্ট করা যাবে।
> লক্ষ্য: DIU-এর ল্যাব ফাইনাল / Take-Off-এর মতো **১০০০+ জনের কনটেস্ট** ফ্রি সার্ভারে চালানো।
> এটা জীবন্ত ডকুমেন্ট — কাজ করতে করতে আপডেট হবে।

---

## ১. ইন্টারভিউ থেকে যা ঠিক হলো

| বিষয় | সিদ্ধান্ত |
|---|---|
| ভাষা | C, C++ (প্রথম ভার্সন); Python, Java (৫ক) |
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
**১ক — Sandbox ও verdict ✅**
- [x] Docker-এ isolate v2.7 + gcc/g++ 14 (Debian trixie), privileged কনটেইনার + cgroup v2
- [x] C/C++ compile → টেস্ট রান → output মেলানো (token compare)
- [x] সব verdict (AC/WA/TLE/MLE/RE/CE) + time/memory মাপা
- [x] testlib checker সাপোর্ট (special judge)
- [x] Self-test: `pnpm judge:build && pnpm judge:selftest` (১২টা সমাধান, সব verdict)

**১খ — API-র সাথে যুক্ত করা ✅**
- [x] DB-তে Problem/TestCase/Submission টেবিল (টেস্ট আপাতত DB-তে, ফেজ ২-এ R2)
- [x] Postgres `SKIP LOCKED` কিউ + long-poll (idle-এ DB ছোঁয় না → Neon ঘুমাতে পারে)
- [x] Worker: claim → টেস্ট cache → judge → রেজাল্ট (JUDGE_TOKEN দিয়ে), crash হলে ১০ মিনিট পর আবার কিউতে
- [x] একসাথে একাধিক সাবমিশন (CONCURRENCY slot, প্রতিটার আলাদা box)
- [x] Web: Problems তালিকা, প্রবলেম পেজ + সাবমিট, লাইভ verdict পেজ (প্রতি টেস্টের ফলাফল)
- [x] Seed (`db:seed`) + end-to-end টেস্ট (`pnpm judge:e2e`, ১২/১২ পাস)
- [x] সাবমিশনে IP প্রতি মিনিটে ১০টার সীমা (লগইন আসার আগ পর্যন্ত)

**পরে উন্নতি**
- [ ] `bits/stdc++.h` precompiled header — এখন C++ compile-এ ~১.৭ সেকেন্ড লাগে (C-তে ~০.১)
- [ ] Oracle VM-এ Docker ছাড়া সরাসরি isolate (time মাপা আরও স্থির হবে)

### ফেজ ২ — ইউজার ও প্রবলেম (সপ্তাহ ৩-৪)

**২ক — লগইন ও রোল ✅**
- [x] Email/Password সাইনআপ-লগইন (scrypt hash, httpOnly session কুকি, DB-তে শুধু টোকেনের hash)
- [x] Google লগইন (GOOGLE_CLIENT_ID/SECRET দিলে চালু হয়)
- [x] রোল: USER / AUTHOR / ADMIN; `ADMIN_EMAILS` দিয়ে admin
- [x] Author request → Admin প্যানেলে approve/reject
- [x] সাবমিট করতে লগইন লাগে; অন্যের সোর্স কোড লুকানো (নিজে + Admin দেখে)
- [x] Rate limit ল্যাব-বান্ধব: IP না, session/অ্যাকাউন্ট ধরে (১০০০ জন একই IP শেয়ার করে)
- [ ] ইমেইল ভেরিফিকেশন / পাসওয়ার্ড রিসেট — নিজস্ব ডোমেইন পেলে (Resend)

**২খ — প্রবলেম বানানো ✅**
- [x] "My problems" পেজ + নতুন প্রবলেম (Author নিজেরটা, Admin সবারটা দেখে)
- [x] এডিটর: Statement (Markdown + LaTeX, লাইভ preview), Settings, Tests, Checker
- [x] টেস্ট আপলোড: zip/আলাদা ফাইল, `1.in`+`1.out`/`.ans`, Polygon `01`+`01.a`; বড় সেট ভাগে ভাগে যায়
- [x] Sample বাছাই, টেস্ট মুছলে নম্বর ঠিক থাকে, টেস্ট/checker বদলালে worker cache নতুন হয়
- [x] Visibility: Private / Contest / Public; টেস্ট ছাড়া Public করা যায় না
- [x] Private প্রবলেমে author নিজে সাবমিট করে যাচাই করতে পারে
- [ ] বড় টেস্ট (প্রতি ফাইল > ২.৫ MB) — Cloudflare R2-তে সরাসরি আপলোড
- [ ] প্রবলেম মুছে ফেলা / কপি করা

**২গ — এডিটর ও তালিকা ✅**
- [x] স্টেটমেন্টে Markdown + LaTeX রেন্ডার (২খ-তে হয়েছে)
- [x] Monaco editor (CDN না পেলে ৮ সেকেন্ড পর textarea), draft আর ভাষা ব্রাউজারে মনে থাকে
- [x] `/submissions` (All / Mine, Load more), প্রবলেম পেজে "My submissions", judge চলাকালীন নিজে থেকে আপডেট
- [x] Private প্রবলেমের সাবমিশন বাইরের কেউ তালিকায় বা লিংকে দেখতে পায় না
- [x] Problem Archive পেজ + প্র্যাকটিস সাবমিট (১খ-তে হয়েছে)
- [x] সাবমিশন পেজ (লাইভ verdict)

### ফেজ ৩ — কনটেস্ট (সপ্তাহ ৫-৬)

**৩ক — কনটেস্ট বানানো ও অংশ নেওয়া ✅**
- [x] কনটেস্ট বানানো/এডিট (ICPC/IOI, শুরু + দৈর্ঘ্য, penalty, freeze, public/private + পাসওয়ার্ড)
- [x] প্রবলেম বাছাই (নিজের বা public), A/B/C ক্রম বদলানো যায়
- [x] রেজিস্ট্রেশন (চলাকালীনও), কনটেস্টের প্রবলেম পেজ, সাবমিট, upsolve
- [x] Access: শুরুর আগে শুধু author; চলাকালীন শুধু প্রতিযোগী; শেষে সবাই
- [x] চলাকালীন অন্যের সাবমিশন লুকানো (freeze-এর জন্য জরুরি); শেষে verdict দেখা যায়
- [x] IOI: worker সব টেস্ট চালায়, নম্বর = পাস ÷ মোট × ১০০
- [x] সার্ভারের ঘড়িতে countdown; শুরু হলে পেজ নিজে আপডেট (এলোমেলো ০-৩ সে. দেরিতে, যাতে ১০০০ জন একসাথে না ঝাঁপায়)

**৩খ — Standings ✅**
- [x] ICPC (সলভ → penalty; CE/IE ফ্রি; first solve হাইলাইট) আর IOI (প্রতি প্রবলেমে সেরা নম্বরের যোগফল)
- [x] Freeze: শেষের N মিনিটের সাবমিশন অন্যদের কাছে "?"; author সবসময় আসল দেখে; শেষে নিজে খোলে
- [x] চাপ সামলানো: হিসাব ১০ সে. cache + একসাথে অনেক request এলে একটাই হিসাব; কনটেস্ট/রেজিস্ট্রেশন memory-তে;
      JSON আর gzip একবারই; ETag → না বদলালে 304
- [x] পরীক্ষা (লোকাল): ১০০০ প্রতিযোগী + ১০,০০০ সাবমিশন — হিসাব ~০.৪-১.৮ সে., ৩০৫ KB → gzip ৮.৫ KB,
      ১০০০টা একসাথে request: আগে ~৩৯ সে. → এখন সার্ভারে প্রতি request <১ ms
- [x] লাইভ Render-এ (০.১ CPU) k6 load test — ফলাফল নিচে "Load test (২০২৬-১০-০৯)"-এ
- [ ] Section/Batch অনুযায়ী standings ফিল্টার, CSV এক্সপোর্ট — ফেজ ৪

**৩গ — মেসেজ ও প্রোফাইল ✅**
- [x] Clarification: প্রতিযোগী প্রশ্ন করে (প্রবলেম বা সাধারণ); author উত্তর দেয়, চাইলে সবার জন্য; "No comment" এক ক্লিকে
- [x] Announcement: সব পেজের উপরে 📢 ব্যানার + Messages-এ নতুনের ব্যাজ (author-এর জন্য: উত্তর বাকি প্রশ্নের সংখ্যা)
- [x] মেসেজ ৫ সে. cache, প্রত্যেক দর্শকের জন্য memory-তে ছেঁকে দেওয়া (১০০০ জনের পোলিং-এ DB চাপ নেই)
- [x] কনটেস্ট শেষে Upsolve (৩ক-তে হয়েছে)
- [x] প্রোফাইল (`/users/:username`): সলভ, পরিসংখ্যান, Authored ও Participated কনটেস্ট, সাম্প্রতিক সাবমিশন
- [x] নিজের নাম / Institution / Batch / Section এডিট

### 🎯 এখানে স্যারকে ডেমো (~৬-৮ সপ্তাহ) — প্রস্তুত ✅

### ফেজ ৪ — ল্যাব ফাইনাল ফিচার (সপ্তাহ ৭-৮)

**৪ক — বাল্ক অ্যাকাউন্ট, ফিল্টার, এক্সপোর্ট ✅**
- [x] Admin বাল্ক অ্যাকাউন্ট: CSV (username/Student ID, name, section, batch, email…) → random পাসওয়ার্ড,
      একবারই দেখায় + CSV ডাউনলোড; চাইলে সাথে সাথে কনটেস্টে রেজিস্টার; ভুল/ডুপ্লিকেট সারি কারণসহ বাদ
- [x] Random পাসওয়ার্ডে হালকা hash (৪৫০টা অ্যাকাউন্ট ~৩ সে.); নিজের দেওয়া পাসওয়ার্ডে আগের মতো শক্ত hash
- [x] Institution / Batch / Section + Standings ফিল্টার (ফিল্টারের ভেতরের rank + মোট rank)
- [x] Standings CSV এক্সপোর্ট (author/admin, সবসময় freeze ছাড়া): প্রতি প্রবলেমে solved/minute/wrong কলাম,
      Excel-এর জন্য BOM, Excel formula injection থেকে সুরক্ষিত
**৪খ — Plagiarism ✅** (Dolos-এর বদলে নিজস্ব — native প্যাকেজ বা বাইরের সার্ভিস লাগে না)
- [x] MOSS-এর মতো winnowing: কমেন্ট/ফাঁকা/#include বাদ, সব নাম → একই token; K=12, W=6
- [x] প্রতি প্রবলেমে প্রত্যেকের শেষ AC (না থাকলে শেষ judged) সাবমিশন; ৩০%-এর বেশি জনের কোডে থাকা
      অংশ (টেমপ্লেট) বাদ; খুব ছোট কোড বাদ; মিল = মিলে যাওয়া ÷ ছোট কোডের fingerprint
- [x] পরীক্ষা: নাম/কমেন্ট/ফরম্যাট বদলানো কপি ৯৭-৯৮%, সৎ আলাদা সমাধান ৩%, শুধু একই টেমপ্লেট ০%
- [x] Author-এর জন্য রিপোর্ট পেজ (≥৩০/৫০/৭০/৯০%) + পাশাপাশি তুলনা, মেলা লাইন হাইলাইট
- [ ] কনটেস্টের বাইরের (archive) সাবমিশনেও চেক; আগের সেমিস্টারের কোডের সাথে তুলনা
**৪গ — Heatmap ও পাসওয়ার্ড ✅**
- [x] প্রোফাইলে GitHub-এর মতো Heatmap (গত ৫৩ সপ্তাহ, বাংলাদেশ সময়ে দিন গোনা — রাত ১২টার পরের সাবমিশন ঠিক দিনে)
- [x] নিজের পাসওয়ার্ড বদলানো (পুরোনোটা দিয়ে যাচাই; অন্য ডিভাইসের লগইন সাথে সাথে বাতিল);
      শুধু-Google অ্যাকাউন্টে পাসওয়ার্ড সেট করা যায়
- [x] Admin: ছাত্রের পাসওয়ার্ড রিসেট (নতুন random পাসওয়ার্ড একবার দেখায়, সব লগইন বাতিল) + Admin প্যানেলে ইউজার খোঁজা

### Load test (২০২৬-১০-০৯) — লাইভ Render ফ্রি (০.১ CPU)

k6 দিয়ে: প্রত্যেক ভার্চুয়াল ছাত্র লগইন → প্রবলেম → প্রতি ~৩০ সে. standings + মেসেজ → মাঝে মাঝে সাবমিট।

| একসাথে ছাত্র | ব্যর্থ | standings p95 | লগইন p95 | ফল |
|---|---|---|---|---|
| ৫০ | ০% | ২৭৮ ms | ৯৯ ms | ✅ |
| ২০০ | ০% | ৬১৫ ms | ৯৬৪ ms | ✅ |
| ৪০০ | ৩৫% | ৩৩ সে. | ৮.৪ সে. | ❌ Render 502 |
| ১০০০ | ৭২% | ৩৬ সে. | ৩৯ সে. | ❌ Render 502 |

- **সিদ্ধান্ত:** Render ফ্রিতে নিরাপদ সীমা **~২০০ জন** (ল্যাব ক্লাস/সেকশন ঠিক আছে)। ১০০০ জনের Take-Off-এর জন্য বেশি CPU লাগবে।
- **ধরা পড়া bug:** Render-এর সামনের Cloudflare ETag-কে weak (`W/"…"`) করে দেয় → 304 কখনো আসত না। ঠিক করা হয়েছে (weak comparison)।
- [x] কোডে CPU বাঁচানো (৫গ):
      - production-এ প্রতি request-এর লগ বন্ধ (শুধু warn/error; `LOG_LEVEL=info` দিলে আবার চালু) → প্রতি request-এ সার্ভার CPU ~১৯% কম (০.২৬৩ → ০.২১৩ ms)
      - standings আর মেসেজ ৩০ → ৬০ সে. (+০-১০ সে. এলোমেলো)
      - সাবমিশন পেজ: আগে প্রতি সেকেন্ডে; এখন judge চলাকালীন ১.৫ সে., লাইনে থাকলে ১.৫ → ৫ সে. পর্যন্ত ধীরে ধীরে
      - সাবমিশন তালিকা: ২ সে. → ৩ সে. (judge চলাকালীন) / ৫ সে. (শুধু লাইনে)
      - ট্যাব লুকানো থাকলে কোনো পোলিং নেই, ট্যাবে ফিরলেই একবার
      - কনটেস্টের প্রবলেম (স্টেটমেন্ট + sample) ৩০ সে. memory-তে — A/B/C-তে যাতায়াতে DB-তে যায় না
- [ ] ১০০০ জনের জন্য API Oracle Free VM-এ (৪ CPU, ফ্রি) বা Render paid — তারপর আবার load test
- [ ] Judge-এর গতি মাপা (C++ compile ~১.৭ সে. — বড় কনটেস্টে একাধিক worker / precompiled header)

### ছোট উন্নতি (২০২৬-১০-০৯)
- [x] Judge-এর অগ্রগতি: "In queue · #3" → "Compiling…" → "Running 8/15 · 53%" বার; সাবমিশন তালিকায় spinner
- [x] সাবমিশনের পর বাটন: ← প্রবলেম, পরের প্রবলেম, My submissions, Standings
- [x] এক প্রবলেমের কোড আরেক প্রবলেমে থেকে যাওয়া আর ব্যাক বাটনে crash — ঠিক
- [x] checker-এর বার্তা (টেস্টের ইনপুট/উত্তর থাকে) শুধু author/Admin দেখেন
- [x] ল্যাব পিসির জন্য `start-judge.bat` / `remove-judge.bat` (double-click)

### ফেজ ৫ — ডেমোর আগেই শুরু (ক্রম: ভাষা → Virtual/Window → CPU বাঁচানো → বাকিগুলো)
**৫ক — Python ও Java ✅**
- [x] Python 3.13 আর Java (OpenJDK 21); judge image ৬৮৯ MB → ১.২ GB
- [x] ধীর ভাষায় বেশি সময়: Java ×২, Python ×৩ (`LANGUAGE_INFO`-তে বদলানো যায়); প্রবলেম পেজে দেখায়
- [x] Java: যেকোনো class নাম (public class, নইলে main()-ওয়ালা class); heap ভরলে OutOfMemoryError → MLE;
      ৬৪ MB stack (গভীর DFS চলে); JVM-এর নিজের জন্য +১২৮ MB
- [x] Python: syntax error → CE; MemoryError → MLE; RE-তে exception-এর নাম author দেখেন
- [x] কনটেস্টে কোন ভাষা চলবে author ঠিক করেন (নতুন কনটেস্টে ডিফল্ট C/C++); শেষ হলে upsolve-এ সব ভাষা
- [x] পুরোনো worker (আপডেট না করা ল্যাব পিসি) শুধু C/C++ পায় — Java/Python নতুন worker-এর জন্য অপেক্ষা করে
- [x] কোড মিল (plagiarism): ভাষা অনুযায়ী আলাদা তুলনা; Python-এর `#` কমেন্ট, `//` ভাগ, docstring চেনে
- [x] Self-test: ৩১/৩১ (চার ভাষায় সব verdict)

**৫খ — Window contest ও Virtual participation ✅**
- [x] Window: জানালা (যেমন ১০টা–৪টা) + প্রত্যেকের সময় (যেমন ২ ঘণ্টা); রেজিস্টার করে নিজের সময়ে **Start**;
      দেরিতে শুরু করলে জানালা বন্ধ হওয়া পর্যন্ত; সময় শেষ হলে জানালা বন্ধ না হওয়া পর্যন্ত প্রবলেম লুকানো
- [x] Window-এ standings জানালা বন্ধ হওয়া পর্যন্ত শুধু author দেখেন (পরে যারা দেবে তারা যেন না জানে কোনটা সহজ);
      penalty প্রত্যেকের নিজের Start থেকে; প্রশ্ন শুধু নিজের সময়ের মধ্যে
- [x] Virtual: Public কনটেস্ট শেষে যে অংশ নেয়নি সে একবার নিজের ঘড়িতে দিতে পারে; চলাকালীন standings-এ আসলরা
      ঠিক ততক্ষণের অবস্থায় ("ভূত" standings)
- [x] Standings-এ virtual সারি "virtual" চিহ্নসহ, ডিফল্টে লুকানো; আসলদের rank বদলায় না; CSV আর প্রোফাইলে virtual বাদ
**৫ঘ — Team contest ✅**
- [x] স্থায়ী টিম (`/teams`): একজন বানায় (owner), username দিয়ে invite, অন্যরা Accept; সর্বোচ্চ ৫ জন;
      owner সদস্য বাদ দিতে/invite বাতিল করতে পারে; সদস্য চলে যেতে পারে; কনটেস্টে অংশ নেওয়া টিম মোছা যায় না
- [x] কনটেস্ট ফর্মে "Team contest — at most N" (২-৫); কেউ রেজিস্টার করার পর একক ↔ টিম বদলানো যায় না
- [x] যেকোনো সদস্য পুরো টিম রেজিস্টার করে (তখনকার Accept করা সদস্যরা); কেউ আগে থেকে অন্য টিমে/একা থাকলে আটকায়
- [x] Standings-এ প্রতি টিমের একটা সারি (নাম + সদস্য); CSV-তেও টিম; সতীর্থরা একে অপরের সাবমিশন (কোড সহ) দেখে
- [x] Window-এ একজন Start চাপলে পুরো টিমের ঘড়ি; virtual-ও পুরো টিম মিলে; কোড মিলে সতীর্থদের জোড়া বাদ
- [ ] Rating সিস্টেম
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
