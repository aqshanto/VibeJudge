"use client";

import { useCallback, useEffect, useState } from "react";
import type { ContestMessages, ContestPhase } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { jitter, schedulePoll } from "@/lib/poll";

// ঘোষণা দেরিতে এলে ক্ষতি নেই — ৬০ সেকেন্ড (১০০০ জনে সার্ভারে প্রতি সেকেন্ডে ~১৫টা request)
const POLL_MS = 60_000;
const seenKey = (slug: string) => `vj:seen:${slug}`;

function readSeen(slug: string): number {
  try {
    return Number(localStorage.getItem(seenKey(slug)) ?? 0);
  } catch {
    return 0;
  }
}

/**
 * কনটেস্টের ঘোষণা আর clarification। চলাকালীন প্রতি ~৬০ সেকেন্ডে আনে (ট্যাব লুকানো থাকলে না)।
 * "নতুন" = শেষবার Messages পেজ দেখার পরের ঘোষণা বা উত্তর (এই ব্রাউজারে মনে রাখা)।
 */
export function useContestMessages(slug: string, phase: ContestPhase | null) {
  const [messages, setMessages] = useState<ContestMessages | null>(null);
  const [seenAt, setSeenAt] = useState(0);

  useEffect(() => setSeenAt(readSeen(slug)), [slug]);

  const load = useCallback(async () => {
    try {
      setMessages(await api<ContestMessages>(`/contests/${encodeURIComponent(slug)}/messages`));
    } catch {
      // মেসেজ না এলে বাকি পেজ যেন না আটকায়
    }
  }, [slug]);

  useEffect(() => {
    if (!phase) return;
    let cancelPoll = () => {};
    let cancelled = false;
    const tick = async () => {
      await load();
      // ১০০০ জন একসাথে যেন না চায়
      if (!cancelled && phase === "RUNNING") cancelPoll = schedulePoll(tick, jitter(POLL_MS, 10_000));
    };
    void tick();
    return () => {
      cancelled = true;
      cancelPoll();
    };
  }, [load, phase]);

  const markSeen = useCallback(() => {
    const now = Date.now();
    try {
      localStorage.setItem(seenKey(slug), String(now));
    } catch {}
    setSeenAt(now);
  }, [slug]);

  const newAnnouncements = (messages?.announcements ?? []).filter((a) => new Date(a.createdAt).getTime() > seenAt);
  const newAnswers = (messages?.clarifications ?? []).filter(
    (c) => c.answeredAt && new Date(c.answeredAt).getTime() > seenAt,
  );
  const unansweredCount = (messages?.clarifications ?? []).filter((c) => c.answer === null).length;

  return { messages, setMessages, reload: load, markSeen, newAnnouncements, newAnswers, unansweredCount };
}
