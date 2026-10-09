"use client";

import { useState } from "react";
import { buttonClass, inputClass } from "@/components/ui";
import { SaveStatus, useSaver, type TabProps } from "./problem-editor";

const TEMPLATE = `#include "testlib.h"

// inf = test input, ouf = contestant's output, ans = jury's answer file
int main(int argc, char* argv[]) {
    registerTestlibCmd(argc, argv);

    long long expected = ans.readLong();
    long long got = ouf.readLong();
    if (got != expected) quitf(_wa, "expected %lld, found %lld", expected, got);
    quitf(_ok, "answer is %lld", got);
}
`;

export function CheckerTab({ problem, save }: TabProps) {
  const [enabled, setEnabled] = useState(problem.checkerSource !== null);
  const [source, setSource] = useState(problem.checkerSource ?? TEMPLATE);
  const saver = useSaver();

  const desired = enabled ? source : null;
  const dirty = desired !== problem.checkerSource;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-start gap-2 text-sm">
        <input type="radio" checked={!enabled} onChange={() => setEnabled(false)} className="mt-1" />
        <span>
          <b>Default checker</b>
          <span className="text-zinc-500"> — compares the output with the answer token by token (extra spaces and newlines are ignored).</span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="radio" checked={enabled} onChange={() => setEnabled(true)} className="mt-1" />
        <span>
          <b>Custom checker (testlib)</b>
          <span className="text-zinc-500">
            {" "}
            — for problems with many correct answers or floating-point answers. Written in C++ with{" "}
            <a href="https://codeforces.com/testlib" target="_blank" rel="noreferrer" className="text-sky-700 underline dark:text-sky-400">
              testlib.h
            </a>
            .
          </span>
        </span>
      </label>

      {enabled && (
        <textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          spellCheck={false}
          className={`${inputClass} h-96 font-mono text-sm leading-6`}
        />
      )}
      {enabled && (
        <p className="text-xs text-zinc-500">
          The checker is compiled by the judge the first time it is needed. If it does not compile, submissions get
          &quot;Internal Error&quot; — test-submit a correct solution after saving.
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          className={buttonClass}
          disabled={saver.busy || !dirty}
          onClick={() => saver.run(() => save({ checkerSource: desired }))}
        >
          {saver.busy ? "Saving…" : "Save checker"}
        </button>
        <SaveStatus message={dirty ? null : saver.message} error={saver.error} />
      </div>
    </div>
  );
}
