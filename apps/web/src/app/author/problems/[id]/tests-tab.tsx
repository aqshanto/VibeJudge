"use client";

import { useState } from "react";
import { MAX_TEST_FILE_BYTES, type AuthorProblemDetail, type TestUpload } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { formatBytes, readTestFiles, toBase64, type TestPair } from "@/lib/test-files";
import { ErrorText, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import type { TabProps } from "./problem-editor";

// Vercel-এর ভেতর দিয়ে এক request-এ ~৪.৫ MB-র বেশি যায় না; base64 ৩৩% বড় হয়
const BATCH_BYTES = 2.5 * 1024 * 1024;

export function TestsTab({ problem, setProblem }: TabProps) {
  const [pairs, setPairs] = useState<TestPair[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [mode, setMode] = useState<TestUpload["mode"]>(problem.tests.length ? "append" : "replace");
  const [sampleCount, setSampleCount] = useState(problem.tests.length ? 0 : 1);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyOrdinal, setBusyOrdinal] = useState<number | null>(null);

  async function pickFiles(files: FileList | null) {
    setError(null);
    setPairs(null);
    if (!files?.length) return;
    try {
      const result = await readTestFiles([...files]);
      const tooBig = result.pairs.find((p) => p.input.length > MAX_TEST_FILE_BYTES || p.answer.length > MAX_TEST_FILE_BYTES);
      if (tooBig) {
        setError(`Test "${tooBig.name}" is larger than ${formatBytes(MAX_TEST_FILE_BYTES)} — not supported yet.`);
        return;
      }
      setPairs(result.pairs);
      setWarnings(result.warnings);
    } catch (e) {
      setError(`Could not read files: ${(e as Error).message}`);
    }
  }

  async function upload() {
    if (!pairs?.length) return;
    setError(null);
    // ছোট ছোট ভাগে পাঠাই; প্রথম ভাগ "replace" হলে বাকিগুলো "append"
    const batches: TestPair[][] = [[]];
    let size = 0;
    for (const p of pairs) {
      const bytes = p.input.length + p.answer.length;
      if (size + bytes > BATCH_BYTES && batches.at(-1)!.length) {
        batches.push([]);
        size = 0;
      }
      batches.at(-1)!.push(p);
      size += bytes;
    }

    try {
      let done = 0;
      let latest: AuthorProblemDetail | null = null;
      for (const [i, batch] of batches.entries()) {
        setProgress(`Uploading ${done + 1}–${done + batch.length} of ${pairs.length}…`);
        const body: TestUpload = {
          mode: i === 0 ? mode : "append",
          tests: batch.map((p, j) => ({
            input: toBase64(p.input),
            answer: toBase64(p.answer),
            isSample: mode === "replace" && done + j < sampleCount,
          })),
        };
        latest = await api<AuthorProblemDetail>(`/author/problems/${problem.id}/tests`, { method: "POST", body });
        done += batch.length;
      }
      setProblem(latest!);
      setPairs(null);
      setWarnings([]);
      setMode("append");
      setProgress(`Uploaded ${pairs.length} tests.`);
    } catch (e) {
      setProgress(null);
      setError((e as Error).message);
    }
  }

  async function changeTest(ordinal: number, action: "sample" | "delete", isSample?: boolean) {
    setBusyOrdinal(ordinal);
    setError(null);
    try {
      const path = `/author/problems/${problem.id}/tests/${ordinal}`;
      const updated =
        action === "delete"
          ? await api<AuthorProblemDetail>(path, { method: "DELETE" })
          : await api<AuthorProblemDetail>(path, { method: "PATCH", body: { isSample } });
      setProblem(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyOrdinal(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
        <h2 className="font-semibold">Upload tests</h2>
        <p className="text-sm text-zinc-500">
          Choose a <b>.zip</b> or several files. Pairs are matched by name: <code>1.in</code> + <code>1.out</code> (or{" "}
          <code>.ans</code>), or Polygon style <code>01</code> + <code>01.a</code>. Each file up to{" "}
          {formatBytes(MAX_TEST_FILE_BYTES)}.
        </p>
        <input
          type="file"
          multiple
          accept=".zip,.in,.out,.ans,.a,.txt,*"
          onChange={(e) => pickFiles(e.target.files)}
          className="text-sm file:mr-3 file:rounded-md file:border file:border-black/15 file:bg-transparent file:px-3 file:py-1.5 file:text-sm dark:file:border-white/20"
        />

        {pairs && (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              Found <b>{pairs.length}</b> tests: {pairs.slice(0, 8).map((p) => p.name).join(", ")}
              {pairs.length > 8 && ", …"}
            </p>
            {warnings.map((w) => (
              <p key={w} className="text-xs text-amber-700 dark:text-amber-400">
                {w}
              </p>
            ))}
            {problem.tests.length > 0 && (
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={mode === "append"} onChange={() => setMode("append")} />
                  Add after the existing {problem.tests.length} tests
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} />
                  Replace all existing tests
                </label>
              </div>
            )}
            {mode === "replace" && (
              <label className="flex items-center gap-2 text-sm">
                Show the first
                <input
                  type="number"
                  min={0}
                  max={pairs.length}
                  value={sampleCount}
                  onChange={(e) => setSampleCount(Number(e.target.value))}
                  className={`${inputClass} w-20`}
                />
                tests as examples in the statement
              </label>
            )}
            <button type="button" className={`${buttonClass} self-start`} onClick={upload} disabled={!pairs.length || progress?.startsWith("Uploading")}>
              Upload {pairs.length} tests
            </button>
          </div>
        )}
        {progress && <p className="text-sm text-zinc-600 dark:text-zinc-400">{progress}</p>}
        <ErrorText>{error}</ErrorText>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Tests ({problem.tests.length})</h2>
        {problem.tests.length === 0 ? (
          <p className="text-sm text-zinc-500">No tests yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
            <table className="w-full text-left text-sm">
              <thead className="bg-black/[.03] text-zinc-500 dark:bg-white/[.04]">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Input</th>
                  <th className="px-3 py-2 font-medium">Answer</th>
                  <th className="px-3 py-2 font-medium">Example</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {problem.tests.map((t) => (
                  <tr key={t.ordinal} className="border-t border-black/10 align-top dark:border-white/10">
                    <td className="px-3 py-2 font-mono">{t.ordinal}</td>
                    <td className="px-3 py-2">
                      <Preview text={t.inputPreview} bytes={t.inputBytes} />
                    </td>
                    <td className="px-3 py-2">
                      <Preview text={t.answerPreview} bytes={t.answerBytes} />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={t.isSample}
                        disabled={busyOrdinal !== null}
                        onChange={(e) => changeTest(t.ordinal, "sample", e.target.checked)}
                        aria-label={`Show test ${t.ordinal} as an example`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className={`${secondaryButtonClass} px-2 py-1 text-xs`}
                        disabled={busyOrdinal !== null}
                        onClick={() => {
                          if (confirm(`Delete test #${t.ordinal}?`)) void changeTest(t.ordinal, "delete");
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Preview({ text, bytes }: { text: string; bytes: number }) {
  return (
    <div>
      <pre className="max-h-20 max-w-xs overflow-hidden whitespace-pre-wrap break-all font-mono text-xs">
        {text}
        {bytes > text.length && "…"}
      </pre>
      <span className="text-xs text-zinc-500">{formatBytes(bytes)}</span>
    </div>
  );
}
