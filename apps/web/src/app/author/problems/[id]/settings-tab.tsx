"use client";

import { useState } from "react";
import { LIMITS, SLUG_PATTERN, VISIBILITIES, type Visibility } from "@vibejudge/shared";
import { Field, buttonClass, inputClass } from "@/components/ui";
import { VISIBILITY_HELP } from "../visibility-badge";
import { SaveStatus, useSaver, type TabProps } from "./problem-editor";

export function SettingsTab({ problem, save }: TabProps) {
  const [title, setTitle] = useState(problem.title);
  const [slug, setSlug] = useState(problem.slug);
  const [timeSec, setTimeSec] = useState(String(problem.timeLimitMs / 1000));
  const [memoryMb, setMemoryMb] = useState(String(problem.memoryLimitKb / 1024));
  const [visibility, setVisibility] = useState<Visibility>(problem.visibility);
  const saver = useSaver();

  const publishWithoutTests = visibility === "PUBLIC" && problem.tests.length === 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void saver.run(() =>
      save({
        title,
        slug,
        timeLimitMs: Math.round(Number(timeSec) * 1000),
        memoryLimitKb: Math.round(Number(memoryMb) * 1024),
        visibility,
      }),
    );
  }

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-5">
      <Field label="Title">
        <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required />
      </Field>
      <Field label="Short name (URL)" hint={`/problems/${slug || "…"}`}>
        <input
          className={inputClass}
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          pattern={SLUG_PATTERN.slice(1, -1)}
          title="3–40 characters: a-z, 0-9 and -"
          required
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Time limit (seconds)">
          <input
            className={inputClass}
            type="number"
            step="0.1"
            min={LIMITS.timeMs.min / 1000}
            max={LIMITS.timeMs.max / 1000}
            value={timeSec}
            onChange={(e) => setTimeSec(e.target.value)}
            required
          />
        </Field>
        <Field label="Memory limit (MB)">
          <input
            className={inputClass}
            type="number"
            step="1"
            min={LIMITS.memoryKb.min / 1024}
            max={LIMITS.memoryKb.max / 1024}
            value={memoryMb}
            onChange={(e) => setMemoryMb(e.target.value)}
            required
          />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">Visibility</legend>
        {VISIBILITIES.map((v) => (
          <label key={v} className="flex items-start gap-2 text-sm">
            <input type="radio" name="visibility" checked={visibility === v} onChange={() => setVisibility(v)} className="mt-1" />
            <span>
              <span className="font-medium">{v.charAt(0) + v.slice(1).toLowerCase()}</span>
              <span className="text-zinc-500"> — {VISIBILITY_HELP[v]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {publishWithoutTests && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          This problem has no tests yet — every submission would be accepted. Upload tests first.
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" className={buttonClass} disabled={saver.busy}>
          {saver.busy ? "Saving…" : "Save settings"}
        </button>
        <SaveStatus message={saver.message} error={saver.error} />
      </div>
    </form>
  );
}
