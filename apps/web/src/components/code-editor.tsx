"use client";

// Monaco (VS Code-এর এডিটর)। CDN থেকে লোড হয় — ভার্সিটির নেটওয়ার্কে CDN আটকানো থাকলে
// কয়েক সেকেন্ড পর সাধারণ textarea দেখায়, যাতে পরীক্ষার সময় কেউ আটকে না যায়।

import Editor from "@monaco-editor/react";
import { useEffect, useState } from "react";
import type { Language } from "@vibejudge/shared";
import { inputClass } from "./ui";

const MONACO_LANG: Record<Language, string> = { c: "c", cpp: "cpp" };
const LOAD_TIMEOUT_MS = 8000;

function usePrefersDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return dark;
}

export function CodeEditor({
  value,
  onChange,
  language,
  height = "24rem",
}: {
  value: string;
  onChange: (value: string) => void;
  language: Language;
  height?: string;
}) {
  const dark = usePrefersDark();
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setFallback(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [ready]);

  if (fallback && !ready) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        placeholder="Paste or type your code here"
        style={{ height }}
        className={`${inputClass} font-mono text-sm leading-6`}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-black/15 dark:border-white/20" style={{ height }}>
      <Editor
        value={value}
        onChange={(v) => onChange(v ?? "")}
        language={MONACO_LANG[language]}
        theme={dark ? "vs-dark" : "light"}
        onMount={() => setReady(true)}
        loading={<p className="p-3 text-sm text-zinc-500">Loading editor…</p>}
        options={{
          fontSize: 14,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          tabSize: 4,
          automaticLayout: true,
          wordWrap: "off",
        }}
      />
    </div>
  );
}
