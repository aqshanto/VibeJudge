"use client";

import { useEffect, useState } from "react";
import type { ClarificationView, ContestMessages } from "@vibejudge/shared";
import { api } from "@/lib/api";
import { ErrorText, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { ContestHeader } from "../contest-header";
import { useContest } from "../use-contest";
import { useContestMessages } from "../use-messages";

export function MessagesView({ slug }: { slug: string }) {
  const { contest, phase, personal, now, error } = useContest(slug);
  const msgs = useContestMessages(slug, phase);
  const { markSeen, messages } = msgs;

  // এই পেজ খুললেই সব "দেখা হয়েছে"
  useEffect(() => {
    if (messages) markSeen();
  }, [messages, markSeen]);

  if (error) return <p className="text-red-600">Could not load contest: {error}</p>;
  if (!contest || !phase) return <p className="text-zinc-500">Loading…</p>;

  const canManage = contest.viewer.canManage;
  // প্রতিযোগী নিজের ঘড়িতে চলাকালীন (WINDOW-এ Start চাপার পর থেকে); author পুরো সময়
  const canAsk = canManage ? phase === "RUNNING" : contest.viewer.registered && personal === "RUNNING";
  const unanswered = messages?.clarifications.filter((c) => c.answer === null) ?? [];
  const answered = messages?.clarifications.filter((c) => c.answer !== null) ?? [];

  return (
    <div className="flex flex-col gap-8">
      <ContestHeader contest={contest} phase={phase} now={now} active="messages" messages={msgs} />

      {canManage && <AnnounceForm slug={slug} onDone={msgs.setMessages} />}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Announcements</h2>
        {!messages && <p className="text-sm text-zinc-500">Loading…</p>}
        {messages?.announcements.length === 0 && <p className="text-sm text-zinc-500">No announcements.</p>}
        {messages?.announcements.map((a) => (
          <div key={a.id} className="rounded-lg border border-amber-500/30 bg-amber-400/10 px-4 py-3">
            <p className="whitespace-pre-wrap">{a.message}</p>
            <p className="mt-1 text-xs text-zinc-500">{new Date(a.createdAt).toLocaleTimeString()}</p>
          </div>
        ))}
      </section>

      {canAsk && !canManage && (
        <AskForm slug={slug} labels={contest.problems.map((p) => p.label)} onDone={msgs.setMessages} />
      )}

      {canManage && unanswered.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Waiting for your answer ({unanswered.length})</h2>
          {unanswered.map((c) => (
            <AnswerCard key={c.id} slug={slug} clar={c} onDone={msgs.setMessages} />
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Clarifications</h2>
        {messages && answered.length === 0 && (canManage || unanswered.length === 0) && (
          <p className="text-sm text-zinc-500">No answered questions yet.</p>
        )}
        {!canManage &&
          unanswered.map((c) => (
            <ClarCard key={c.id} clar={c}>
              <p className="text-sm text-zinc-500">Waiting for an answer…</p>
            </ClarCard>
          ))}
        {answered.map((c) =>
          canManage ? (
            <AnswerCard key={c.id} slug={slug} clar={c} onDone={msgs.setMessages} />
          ) : (
            <ClarCard key={c.id} clar={c}>
              <p className="whitespace-pre-wrap">
                <b>Answer:</b> {c.answer}
              </p>
            </ClarCard>
          ),
        )}
      </section>
    </div>
  );
}

function ClarCard({ clar, children }: { clar: ClarificationView; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-black/10 px-4 py-3 dark:border-white/15">
      <p className="text-xs text-zinc-500">
        {clar.label ? `Problem ${clar.label}` : "General"}
        {clar.askedBy && ` · asked by ${clar.askedBy}`}
        {clar.mine && " (you)"} · {new Date(clar.createdAt).toLocaleTimeString()}
        {clar.answer !== null && (clar.isPublic ? " · visible to everyone" : " · private answer")}
      </p>
      <p className="whitespace-pre-wrap font-medium">{clar.question}</p>
      {children}
    </div>
  );
}

function AskForm({
  slug,
  labels,
  onDone,
}: {
  slug: string;
  labels: string[];
  onDone: (m: ContestMessages) => void;
}) {
  const [label, setLabel] = useState("");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await api<ContestMessages>(`/contests/${slug}/clarifications`, { method: "POST", body: { label: label || null, question } }));
      setQuestion("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h2 className="font-semibold">Ask a question</h2>
      <p className="text-sm text-zinc-500">Only the contest author sees your question. Don&apos;t paste your code.</p>
      <select className={`${inputClass} w-48`} value={label} onChange={(e) => setLabel(e.target.value)}>
        <option value="">General</option>
        {labels.map((l) => (
          <option key={l} value={l}>
            Problem {l}
          </option>
        ))}
      </select>
      <textarea
        className={`${inputClass} h-24`}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        minLength={3}
        maxLength={2000}
        required
      />
      <ErrorText>{error}</ErrorText>
      <button type="submit" className={`${buttonClass} self-start`} disabled={busy}>
        {busy ? "Sending…" : "Send question"}
      </button>
    </form>
  );
}

function AnswerCard({
  slug,
  clar,
  onDone,
}: {
  slug: string;
  clar: ClarificationView;
  onDone: (m: ContestMessages) => void;
}) {
  const [answer, setAnswer] = useState(clar.answer ?? "");
  const [isPublic, setIsPublic] = useState(clar.isPublic);
  const [editing, setEditing] = useState(clar.answer === null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(text: string, pub: boolean) {
    setBusy(true);
    setError(null);
    try {
      onDone(
        await api<ContestMessages>(`/contests/${slug}/clarifications/${clar.id}/answer`, {
          method: "POST",
          body: { answer: text, isPublic: pub },
        }),
      );
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ClarCard clar={clar}>
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea className={`${inputClass} h-20`} value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={2000} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            Show question and answer to everyone
          </label>
          <ErrorText>{error}</ErrorText>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass} disabled={busy || !answer.trim()} onClick={() => send(answer, isPublic)}>
              Send answer
            </button>
            {/* ICPC-র প্রচলিত দ্রুত উত্তর */}
            <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => send("No comment. Read the problem statement.", false)}>
              No comment
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <p className="whitespace-pre-wrap">
            <b>Answer:</b> {clar.answer}
          </p>
          <button type="button" className="text-sm text-sky-700 underline dark:text-sky-400" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
      )}
    </ClarCard>
  );
}

function AnnounceForm({ slug, onDone }: { slug: string; onDone: (m: ContestMessages) => void }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirm("Send this announcement to every participant?")) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await api<ContestMessages>(`/contests/${slug}/announcements`, { method: "POST", body: { message } }));
      setMessage("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h2 className="font-semibold">New announcement</h2>
      <textarea
        className={`${inputClass} h-20`}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="e.g. Problem B: the constraints were fixed, n ≤ 10^5."
        maxLength={2000}
        required
      />
      <ErrorText>{error}</ErrorText>
      <button type="submit" className={`${buttonClass} self-start`} disabled={busy}>
        {busy ? "Sending…" : "Announce to everyone"}
      </button>
    </form>
  );
}
