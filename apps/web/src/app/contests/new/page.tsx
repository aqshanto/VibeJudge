"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { ContestForm } from "../contest-form";

export default function NewContestPage() {
  const { user, loading } = useAuth();
  const canManage = user?.role === "AUTHOR" || user?.role === "ADMIN";
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">New contest</h1>
      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : canManage ? (
        <ContestForm />
      ) : (
        <p>
          Only authors can create contests.{" "}
          <Link href="/become-author" className="text-sky-700 hover:underline dark:text-sky-400">
            Request author access
          </Link>
        </p>
      )}
    </main>
  );
}
