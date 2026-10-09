// Rating হিসাব — Codeforces-এর প্রকাশিত পদ্ধতি ("Open Codeforces Rating System"), DB ছাড়া pure function।
//
// ১) seed = এই rating নিয়ে প্রত্যাশিত rank = ১ + সবার কাছে হারার সম্ভাবনার যোগফল (Elo)।
// ২) আসল rank আর seed-এর গুণোত্তর গড় (মাঝামাঝি) যে rating-এ পাওয়া যেত — তার দিকে অর্ধেক পথ যাই।
// ৩) সবার মোট পরিবর্তন যেন শূন্যের একটু নিচে থাকে (rating ফুলে না ওঠে), আর উপরের দিকের
//    ~৪√n জনের মোট পরিবর্তন প্রায় শূন্য (ভালোরা হঠাৎ অনেক না বাড়ে)।

import { INITIAL_RATING } from "@vibejudge/shared";

export { INITIAL_RATING };

export interface RatingInput {
  userId: string;
  /** আগের rating (প্রথম rated কনটেস্ট হলে INITIAL_RATING) */
  rating: number;
  /** standings-এ অবস্থান: বেশি points আগে, তারপর কম penalty — সমান হলে একই points/penalty */
  points: number;
  penalty: number;
}

export interface RatingResult {
  userId: string;
  /** standings-এর মতো: সমান হলে দলের প্রথম অবস্থান (দেখানোর জন্য) */
  rank: number;
  oldRating: number;
  newRating: number;
}

const MAX_RATING = 8000;
/** BEAT[d + MAX_RATING] = যার rating অন্যজনের চেয়ে d বেশি, তার জেতার সম্ভাবনা (Elo) — একবারই হিসাব */
const BEAT = Float64Array.from({ length: 2 * MAX_RATING + 1 }, (_, k) => 1 / (1 + Math.pow(10, -(k - MAX_RATING) / 400)));
const clamp = (r: number) => Math.min(Math.max(Math.round(r), 1), MAX_RATING - 1);

export function computeRatingChanges(input: RatingInput[]): RatingResult[] {
  const n = input.length;
  if (n < 2) return [];

  // ভালো থেকে খারাপ; সমান points+penalty হলে সবার rank = দলের শেষ অবস্থান
  const people = [...input].sort((a, b) => b.points - a.points || a.penalty - b.penalty);
  // হিসাবে সমান হলে দলের শেষ অবস্থান (Codeforces-এর নিয়ম); দেখানোর জন্য প্রথম অবস্থান (standings-এর মতো)
  const rank = new Array<number>(n);
  const shownRank = new Array<number>(n);
  for (let i = 0; i < n; ) {
    let j = i;
    while (j + 1 < n && people[j + 1]!.points === people[i]!.points && people[j + 1]!.penalty === people[i]!.penalty) j++;
    for (let k = i; k <= j; k++) {
      rank[k] = j + 1;
      shownRank[k] = i + 1;
    }
    i = j + 1;
  }
  const ratings = people.map((p) => p.rating);

  // ১০০০ জনে সরাসরি হিসাব করলে Render-এর ০.১ CPU-তে ~১৭ সেকেন্ড লাগত। তাই: একই rating-এর মানুষ
  // এক সাথে গুনি, আর প্রতিটা rating R-এর "সবার সাথে" seed একবারই হিসাব করে মনে রাখি।
  const count = new Map<number, number>();
  for (const r of ratings) count.set(clamp(r), (count.get(clamp(r)) ?? 0) + 1);
  const groups = [...count];
  const seedAll = new Float64Array(MAX_RATING).fill(-1);
  const seedWithEveryone = (R: number) => {
    if (seedAll[R]! < 0) {
      let s = 1;
      for (const [v, c] of groups) s += c * BEAT[v - R + MAX_RATING]!;
      seedAll[R] = s;
    }
    return seedAll[R]!;
  };
  /** এই rating-এর কেউ এই দলে থাকলে প্রত্যাশিত rank (`self` নিজেকে বাদ দিয়ে) */
  const seedOf = (rating: number, self: number) => {
    const R = clamp(rating);
    return seedWithEveryone(R) - (self >= 0 ? BEAT[clamp(ratings[self]!) - R + MAX_RATING]! : 0);
  };

  const delta = people.map((p, i) => {
    const midRank = Math.sqrt(rank[i]! * seedOf(p.rating, i));
    // কোন rating-এ প্রত্যাশিত rank = midRank (rating বাড়লে seed কমে) — binary search।
    // Codeforces-এর কোডে এখানে নিজের পুরোনো rating-ও তুলনায় থাকে — হাজার জনের কনটেস্টে তফাত নেই,
    // কিন্তু ল্যাবের ছোট কনটেস্টে (৩০-১০০ জন) সেটা অদ্ভুত লাফ দেয়, তাই নিজেকে বাদ দিই
    let lo = 1;
    let hi = 8000;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (seedOf(mid, i) < midRank) hi = mid;
      else lo = mid;
    }
    return Math.trunc((lo - p.rating) / 2);
  });

  // rating অনুযায়ী বড় থেকে ছোট (সংশোধনের জন্য)
  const byRating = people.map((_, i) => i).sort((a, b) => ratings[b]! - ratings[a]!);

  // ১) মোট পরিবর্তন ≤ ০
  {
    const sum = delta.reduce((s, d) => s + d, 0);
    const inc = Math.trunc(-sum / n) - 1;
    for (let i = 0; i < n; i++) delta[i]! += inc;
  }
  // ২) সবচেয়ে বেশি rating-এর ~৪√n জনের মোট পরিবর্তন ≈ ০ (সর্বোচ্চ ১০ কমিয়ে)
  {
    const top = Math.min(4 * Math.round(Math.sqrt(n)), n);
    let sum = 0;
    for (let k = 0; k < top; k++) sum += delta[byRating[k]!]!;
    const inc = Math.min(Math.max(Math.trunc(-sum / top), -10), 0);
    for (let i = 0; i < n; i++) delta[i]! += inc;
  }

  return people.map((p, i) => ({
    userId: p.userId,
    rank: shownRank[i]!,
    oldRating: p.rating,
    newRating: p.rating + delta[i]!,
  }));
}
