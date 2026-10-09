"use client";

// Monaco (VS Code-এর এডিটর)। CDN থেকে লোড হয় — ভার্সিটির নেটওয়ার্কে CDN আটকানো থাকলে
// কয়েক সেকেন্ড পর সাধারণ textarea দেখায়, যাতে পরীক্ষার সময় কেউ আটকে না যায়।
//
// @monaco-editor/react-এর <Editor> সরাসরি ব্যবহার করি না: Next আগের পেজ লুকিয়ে রাখে (<Activity>),
// লুকানোর সময় সেটা editor dispose করে কিন্তু আবার দেখানোর সময় নতুন বানায় না → ব্যাক বাটনে crash।
// এখানে effect-এর ভেতরে editor বানাই আর cleanup-এ ভাঙি, তাই লুকানো/দেখানো যতবারই হোক ঠিক থাকে।

import { loader, type Monaco } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import type { Language } from "@vibejudge/shared";
import { inputClass } from "./ui";

type MonacoEditor = ReturnType<Monaco["editor"]["create"]>;

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
  modelId,
  height = "24rem",
}: {
  value: string;
  onChange: (value: string) => void;
  language: Language;
  /**
   * প্রতিটা প্রবলেমের জন্য আলাদা (যেমন "aplusb" বা "contest/A")।
   * Monaco একই ঠিকানার model আবার ব্যবহার করে — আর Next আগের পেজ লুকিয়ে mounted রাখে,
   * তাই এটা না দিলে প্রবলেম B-তে প্রবলেম A-র কোড দেখা যেত।
   */
  modelId: string;
  height?: string;
}) {
  const dark = usePrefersDark();
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);

  const host = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  // effect আবার না চালিয়ে সর্বশেষ value/onChange/theme পড়ার জন্য
  const latest = useRef({ value, onChange, dark });
  latest.current = { value, onChange, dark };

  const uri = `inmemory://vibejudge/${encodeURIComponent(modelId)}/main.${language}`;

  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setFallback(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [ready]);

  // editor বানানো/ভাঙা — mount, পেজ আবার দেখানো, বা অন্য প্রবলেম/ভাষায় গেলে
  useEffect(() => {
    let cancelled = false;
    let editor: MonacoEditor | null = null;

    loader
      .init()
      .then((monaco) => {
        if (cancelled || !host.current) return;
        monacoRef.current = monaco;
        const modelUri = monaco.Uri.parse(uri);
        const { value: initial, dark: isDark } = latest.current;
        let model = monaco.editor.getModel(modelUri);
        if (!model) model = monaco.editor.createModel(initial, MONACO_LANG[language], modelUri);
        else if (model.getValue() !== initial) model.setValue(initial);

        editor = monaco.editor.create(host.current, {
          model,
          theme: isDark ? "vs-dark" : "light",
          fontSize: 14,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          tabSize: 4,
          automaticLayout: true,
          wordWrap: "off",
        });
        editor.onDidChangeModelContent(() => {
          const v = editor!.getValue();
          if (v !== latest.current.value) latest.current.onChange(v);
        });
        editorRef.current = editor;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFallback(true);
      });

    return () => {
      cancelled = true;
      editor?.dispose(); // model থেকে যায় — ফিরে এলে undo history সহ একই কোড
      if (editorRef.current === editor) editorRef.current = null;
    };
  }, [uri, language]);

  // বাইরে থেকে value বদলালে (টেমপ্লেট, ড্রাফট রিসেট) editor-এ বসাই
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.getValue() !== value) editor.setValue(value);
  }, [value]);

  useEffect(() => {
    monacoRef.current?.editor.setTheme(dark ? "vs-dark" : "light");
  }, [dark]);

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
    <div className="relative overflow-hidden rounded-lg border border-black/15 dark:border-white/20" style={{ height }}>
      {!ready && <p className="absolute p-3 text-sm text-zinc-500">Loading editor…</p>}
      <div ref={host} className="h-full w-full" />
    </div>
  );
}
