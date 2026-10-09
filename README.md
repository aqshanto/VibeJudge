# VibeJudge

প্রোগ্রামিং কনটেস্টের জন্য একটা Online Judge। পুরো প্ল্যান: [PLAN.md](PLAN.md)

```
apps/web      → Next.js ওয়েবসাইট (Vercel)
apps/api      → Fastify API + Prisma (Render)
apps/judge    → Judge worker: isolate sandbox-এ C/C++ চালায় (Docker)
packages/shared → web, api, judge-এর কমন টাইপ (verdict, language, role)
```

## Judge (Docker লাগবে)

```bash
pnpm judge:build
```

```bash
pnpm judge:selftest
```

`apps/judge/fixtures/`-এর প্রতিটা সমাধান judge করে, ফাইলের নামের verdict-এর সাথে মেলায়
(যেমন `tle-loop.cpp` → TLE)। নতুন টেস্ট যোগ করতে ওখানে ফাইল রাখলেই হবে।

### Worker চালানো

```bash
cp apps/judge/.env.example apps/judge/.env
```

`apps/judge/.env`-এ `API_URL` আর `JUDGE_TOKEN` বসাও (API-র `JUDGE_TOKEN`-এর সাথে হুবহু এক)।
লোকাল API হলে `API_URL=http://host.docker.internal:4000`, লাইভ হলে Render-এর URL।

```bash
pnpm judge:worker
```

পুরো সিস্টেম পরীক্ষা (API + worker চালু থাকতে হবে, প্রবলেম seed করা থাকতে হবে):

```bash
pnpm --filter @vibejudge/api db:seed
```

```bash
pnpm judge:e2e
```

> কনটেইনার `--privileged` লাগে, কারণ isolate নিজে cgroup আর namespace বানায়।
> ইউজারের কোড তবুও isolate-এর sandbox-এ চলে: আলাদা user, নেটওয়ার্ক নেই, time/memory সীমিত।

---

## লোকালি চালানো

লাগবে: Node.js 22+, pnpm 10 (`npm install -g pnpm@10`)

```bash
pnpm install
```

```bash
cp apps/api/.env.example apps/api/.env
```

```bash
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000/api/health

`DATABASE_URL` খালি থাকলেও সব চলবে — হোম পেজে Database "Not configured" দেখাবে।

### ডাটাবেস কানেক্ট করা (Neon)
1. https://neon.tech-এ ফ্রি অ্যাকাউন্ট → New Project → Region: **Singapore**
2. Connection string কপি করে `apps/api/.env`-এ `DATABASE_URL=`-এর পরে বসাও
3. প্রথম migration চালাও:

```bash
pnpm --filter @vibejudge/api db:migrate --name init
```

---

## ডিপ্লয়

### ১. GitHub-এ পুশ
GitHub-এ একটা **খালি** রিপো বানাও (README ছাড়া), তারপর:

```bash
git remote add origin https://github.com/<তোমার-username>/vibejudge.git
```

```bash
git push -u origin main
```

### ২. API → Render
1. https://render.com → New → **Blueprint** → রিপো সিলেক্ট
2. `render.yaml` দেখে নিজেই সার্ভিস বানাবে। জিজ্ঞেস করবে:
   - `DATABASE_URL` → Neon-এর connection string
   - `WEB_ORIGIN` → এখনো Vercel URL না থাকলে আপাতত `http://localhost:3000` দাও, পরে বদলাবে
3. ডিপ্লয় শেষে URL পাবে, যেমন `https://vibejudge-api.onrender.com` → ব্রাউজারে `/api/health` খুলে চেক করো

### ৩. Web → Vercel
1. https://vercel.com → Add New → Project → রিপো ইমপোর্ট
2. **Root Directory: `apps/web`** (জরুরি!)
3. Environment Variable: `API_URL` = Render-এর URL (শেষে `/` ছাড়া)
4. Deploy

### ৪. শেষ ধাপ
Render-এ `WEB_ORIGIN`-এর মান Vercel-এর URL দিয়ে বদলাও।

> ⚠️ `API_URL` বদলালে Vercel-এ **Redeploy** করতে হবে (build-এর সময় পড়ে)।
> ⚠️ Render ফ্রি সার্ভার ১৫ মিনিট idle থাকলে ঘুমায় — প্রথম লোডে ~৫০ সেকেন্ড লাগতে পারে।
