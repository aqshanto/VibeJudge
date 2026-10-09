"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MAX_BULK_ROWS,
  type BulkUserResult,
  type BulkUserRow,
  type ContestSummary,
} from "@vibejudge/shared";
import { api } from "@/lib/api";
import { downloadText, parseCsv, toCsv } from "@/lib/csv";
import { ErrorText, buttonClass, inputClass } from "@/components/ui";

// CSV-এর শিরোনাম → আমাদের field (কয়েকটা সাধারণ নাম চেনে)
const HEADER_MAP: Record<string, keyof BulkUserRow> = {
  username: "username",
  id: "username",
  "student id": "username",
  student_id: "username",
  roll: "username",
  name: "displayName",
  "full name": "displayName",
  displayname: "displayName",
  email: "email",
  "e-mail": "email",
  section: "section",
  batch: "batch",
  institution: "institution",
  university: "institution",
};

function toRows(text: string): { rows: BulkUserRow[]; error: string | null } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], error: null };
  const header = table[0]!.map((h) => HEADER_MAP[h.toLowerCase()]);
  if (!header.includes("username")) {
    return { rows: [], error: 'The first line must be a header with a "username" (or "id") column.' };
  }
  const rows = table.slice(1).map((cells) => {
    const row: BulkUserRow = { username: "" };
    header.forEach((field, i) => {
      if (field && cells[i]) row[field] = cells[i];
    });
    return row;
  });
  return { rows: rows.filter((r) => r.username), error: null };
}

const EXAMPLE = `username,name,section,batch
241-15-001,Rahim Uddin,61_A,61
241-15-002,Karima Akter,61_A,61
241-15-003,Sabbir Hossain,61_B,61`;

export function BulkAccounts() {
  const [text, setText] = useState("");
  const [contests, setContests] = useState<ContestSummary[]>([]);
  const [contestSlug, setContestSlug] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<BulkUserResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [institution, setInstitution] = useState("");

  useEffect(() => {
    api<{ contests: ContestSummary[] }>("/contests?scope=managed").then((r) => setContests(r.contests), () => {});
  }, []);

  const parsed = useMemo(() => toRows(text), [text]);

  async function loadFile(file: File | undefined) {
    if (file) setText(await file.text());
  }

  async function create() {
    setError(null);
    setResult(null);
    const rows = parsed.rows.map((r) => ({ ...r, institution: r.institution || institution || undefined }));
    const total: BulkUserResult = { created: [], skipped: [], registered: 0 };
    try {
      for (let i = 0; i < rows.length; i += MAX_BULK_ROWS) {
        setProgress(`Creating ${i + 1}–${Math.min(i + MAX_BULK_ROWS, rows.length)} of ${rows.length}…`);
        const r = await api<BulkUserResult>("/admin/users/bulk", {
          method: "POST",
          body: { rows: rows.slice(i, i + MAX_BULK_ROWS), contestSlug: contestSlug || undefined },
        });
        total.created.push(...r.created);
        total.skipped.push(...r.skipped);
        total.registered += r.registered;
      }
      setResult(total);
    } catch (e) {
      setError((e as Error).message);
      if (total.created.length) setResult(total); // যতটুকু হয়েছে তার পাসওয়ার্ড যেন হারিয়ে না যায়
    } finally {
      setProgress(null);
    }
  }

  function downloadCredentials() {
    if (!result) return;
    downloadText(
      `vibejudge-accounts-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv([["username", "password", "name", "section"], ...result.created.map((c) => [c.username, c.password, c.displayName, c.section])]),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Paste a CSV or choose a file. The first line is the header; only <b>username</b> is required (student IDs work
        well, e.g. <code>241-15-001</code>). Optional columns: name, email, section, batch, institution. Every account
        gets a random password — <b>you will see the passwords only once</b>, so download them right away.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => loadFile(e.target.files?.[0])} className="text-sm" />
        <button type="button" className="text-sm text-sky-700 underline dark:text-sky-400" onClick={() => setText(EXAMPLE)}>
          Fill an example
        </button>
      </div>
      <textarea
        className={`${inputClass} h-40 font-mono text-xs`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={EXAMPLE}
        spellCheck={false}
      />
      <ErrorText>{parsed.error}</ErrorText>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Institution (if not in the file)</span>
          <input className={inputClass} value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="DIU" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Also register them for a contest</span>
          <select className={inputClass} value={contestSlug} onChange={(e) => setContestSlug(e.target.value)}>
            <option value="">— no —</option>
            {contests.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {parsed.rows.length > 0 && !parsed.error && (
        <p className="text-sm">
          Ready: <b>{parsed.rows.length}</b> accounts
          {parsed.rows.length > 0 && ` (${parsed.rows.slice(0, 3).map((r) => r.username).join(", ")}${parsed.rows.length > 3 ? ", …" : ""})`}
        </p>
      )}
      <button
        type="button"
        className={`${buttonClass} self-start`}
        disabled={!parsed.rows.length || !!parsed.error || progress !== null}
        onClick={create}
      >
        {progress ?? `Create ${parsed.rows.length || ""} accounts`}
      </button>
      <ErrorText>{error}</ErrorText>

      {result && (
        <div className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
          <p>
            ✓ Created <b>{result.created.length}</b> accounts
            {result.skipped.length > 0 && <>, skipped <b>{result.skipped.length}</b></>}
            {contestSlug && <>, registered <b>{result.registered}</b> for the contest</>}.
          </p>
          {result.created.length > 0 && (
            <>
              <button type="button" className={`${buttonClass} self-start`} onClick={downloadCredentials}>
                ⬇ Download usernames &amp; passwords (CSV)
              </button>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Download now — passwords are not stored and can&apos;t be shown again.
              </p>
            </>
          )}
          {result.skipped.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm">Skipped rows</summary>
              <ul className="mt-2 text-sm">
                {result.skipped.map((s, i) => (
                  <li key={i}>
                    <span className="font-mono">{s.username}</span> — {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
