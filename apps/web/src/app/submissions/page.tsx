"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { SubmissionTable } from "@/components/submission-table";

export default function SubmissionsPage() {
  const { user } = useAuth();
  const [mine, setMine] = useState(false);

  // "/submissions?mine=1" (সাবমিশন পেজের "My submissions" বাটন) → সরাসরি "Mine" ট্যাব
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mine") === "1") setMine(true);
  }, []);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Submissions</h1>
        {user && (
          <div className="flex gap-1 text-sm">
            {[
              { label: "All", value: false },
              { label: "Mine", value: true },
            ].map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => setMine(t.value)}
                className={`rounded-md px-3 py-1 ${mine === t.value ? "bg-foreground text-background" : "hover:bg-black/[.05] dark:hover:bg-white/[.08]"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <SubmissionTable query={mine ? "mine=true" : ""} />
    </main>
  );
}
