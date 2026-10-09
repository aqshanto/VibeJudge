"use client";

import { useCallback, useEffect, useState } from "react";
import { contestPhase, type ContestDetail, type ContestPhase } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { useServerNow } from "@/lib/time";

/**
 * কনটেস্টের তথ্য + সার্ভারের ঘড়িতে চলা phase।
 * শুরু বা শেষ হওয়ার মুহূর্তে নিজে থেকে আবার লোড করে (যেমন শুরু হলেই প্রবলেম দেখা যায়)।
 */
export function useContest(slug: string) {
  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setContest(await api<ContestDetail>(`/contests/${encodeURIComponent(slug)}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [slug]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const now = useServerNow(contest?.serverTime);
  const phase: ContestPhase | null = contest ? contestPhase(contest.startsAt, contest.durationMinutes, now) : null;

  // সার্ভার যে phase-এ ডেটা দিয়েছিল তার থেকে বদলালে নতুন করে আনি
  const [loadedPhase, setLoadedPhase] = useState<ContestPhase | null>(null);
  useEffect(() => {
    if (!contest) return;
    const serverPhase = contestPhase(contest.startsAt, contest.durationMinutes, new Date(contest.serverTime).getTime());
    setLoadedPhase(serverPhase);
  }, [contest]);
  useEffect(() => {
    if (phase && loadedPhase && phase !== loadedPhase) {
      // একসাথে সবাই যেন সার্ভারে না ঝাঁপায় — ০-৩ সেকেন্ড এলোমেলো দেরি
      const t = setTimeout(() => void reload(), Math.random() * 3000);
      return () => clearTimeout(t);
    }
  }, [phase, loadedPhase, reload]);

  return { contest, error, phase, now, reload };
}
