"use client";

import { useCallback, useEffect, useState } from "react";
import {
  contestPhase,
  personalState,
  type ContestDetail,
  type ContestPhase,
  type PersonalState,
} from "@vibejudge/shared";
import { api } from "@/lib/api";
import { useServerNow } from "@/lib/time";

/** দর্শকের নিজের শুরু-শেষ (WINDOW/virtual-এ Start চাপার পর থেকে); প্রতিযোগী না হলে null */
export function viewerWindow(contest: ContestDetail): { start: number; end: number } | null {
  const p = contest.viewer.participation;
  if (!p) return null;
  if (!p.virtual && contest.type === "FIXED") {
    return { start: new Date(contest.startsAt).getTime(), end: new Date(contest.endsAt).getTime() };
  }
  return p.startedAt && p.endsAt ? { start: new Date(p.startedAt).getTime(), end: new Date(p.endsAt).getTime() } : null;
}

/**
 * কনটেস্টের তথ্য + সার্ভারের ঘড়িতে চলা phase আর দর্শকের নিজের ঘড়ি (`personal`)।
 * শুরু বা শেষ হওয়ার মুহূর্তে (নিজের সময় শেষ হলেও) নিজে থেকে আবার লোড করে।
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
  const phase: ContestPhase | null = contest ? contestPhase(contest.startsAt, contest.endsAt, now) : null;
  const window = contest ? viewerWindow(contest) : null;
  const personal: PersonalState | null = contest?.viewer.participation ? personalState(window, now) : null;

  // সার্ভার যে অবস্থায় ডেটা দিয়েছিল তার থেকে বদলালে নতুন করে আনি
  const [loadedState, setLoadedState] = useState<string | null>(null);
  useEffect(() => {
    if (!contest) return;
    const at = new Date(contest.serverTime).getTime();
    const w = viewerWindow(contest);
    setLoadedState(`${contestPhase(contest.startsAt, contest.endsAt, at)}/${contest.viewer.participation ? personalState(w, at) : "-"}`);
  }, [contest]);
  const state = phase ? `${phase}/${personal ?? "-"}` : null;
  useEffect(() => {
    if (state && loadedState && state !== loadedState) {
      // একসাথে সবাই যেন সার্ভারে না ঝাঁপায় — ০-৩ সেকেন্ড এলোমেলো দেরি
      const t = setTimeout(() => void reload(), Math.random() * 3000);
      return () => clearTimeout(t);
    }
  }, [state, loadedState, reload]);

  return { contest, error, phase, personal, window, now, reload, setContest };
}
