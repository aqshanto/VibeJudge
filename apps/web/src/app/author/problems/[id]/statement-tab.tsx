"use client";

import { useState } from "react";
import { Markdown } from "@/components/markdown";
import { buttonClass, inputClass } from "@/components/ui";
import { SaveStatus, useSaver, type TabProps } from "./problem-editor";

const TEMPLATE = `Write the story and the task here. Use $...$ for math, e.g. $1 \\le n \\le 10^5$.

## Input
The first line contains an integer $n$ ($1 \\le n \\le 10^5$).

## Output
Print one integer — the answer.

## Note
Explain the first example here.
`;

export function StatementTab({ problem, save }: TabProps) {
  const [draft, setDraft] = useState(problem.statement || TEMPLATE);
  const saver = useSaver();
  const dirty = draft !== problem.statement;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-500">
        Markdown with LaTeX math: <code>$x^2$</code> inline, <code>$$\sum_i a_i$$</code> on its own line. Examples are
        added automatically from tests marked as samples.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className={`${inputClass} h-[32rem] font-mono text-sm leading-6`}
        />
        <div className="h-[32rem] overflow-auto rounded-md border border-black/10 p-4 dark:border-white/15">
          <h2 className="mb-3 text-xl font-semibold">{problem.title}</h2>
          <Markdown>{draft}</Markdown>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={buttonClass}
          disabled={saver.busy || !dirty}
          onClick={() => saver.run(() => save({ statement: draft }))}
        >
          {saver.busy ? "Saving…" : "Save statement"}
        </button>
        {dirty && !saver.busy && <span className="text-sm text-amber-700 dark:text-amber-400">Unsaved changes</span>}
        <SaveStatus message={dirty ? null : saver.message} error={saver.error} />
      </div>
    </div>
  );
}
