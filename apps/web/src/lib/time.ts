"use client";

import { useEffect, useState } from "react";

/**
 * সার্ভারের ঘড়ি অনুযায়ী এখনকার সময় (ms), প্রতি সেকেন্ডে আপডেট হয়।
 * ছাত্রদের পিসির ঘড়ি ভুল থাকলেও countdown ঠিক থাকে।
 */
export function useServerNow(serverTime: string | undefined): number {
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (serverTime) setOffset(new Date(serverTime).getTime() - Date.now());
  }, [serverTime]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  return now + offset;
}

/** 3725000 → "1:02:05", ১ দিনের বেশি হলে "2d 03:04:05" */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const hms = `${String(h).padStart(d ? 2 : 1, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return d ? `${d}d ${hms}` : hms;
}

/** 150 → "2h 30m" */
export function formatDuration(minutes: number): string {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(" ") || "0m";
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** ISO → <input type="datetime-local">-এর মান (ব্রাউজারের লোকাল সময়ে) */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
