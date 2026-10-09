"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

const linkClass = "text-zinc-600 hover:text-foreground dark:text-zinc-400";

export function UserMenu() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  if (loading) return <span className="ml-auto" />;

  if (!user) {
    return (
      <div className="ml-auto flex items-center gap-4">
        <Link href="/login" className={linkClass}>
          Log in
        </Link>
        <Link href="/register" className="rounded-md bg-foreground px-3 py-1.5 font-medium text-background">
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="ml-auto flex items-center gap-4">
      <Link href="/teams" className={linkClass}>
        Teams
      </Link>
      {user.role !== "USER" && (
        <Link href="/author/problems" className={linkClass}>
          My problems
        </Link>
      )}
      {user.role === "ADMIN" && (
        <Link href="/admin" className={linkClass}>
          Admin
        </Link>
      )}
      {user.role === "USER" && (
        <Link href="/become-author" className={linkClass}>
          Become an author
        </Link>
      )}
      <Link href={`/users/${user.username}`} className="font-medium hover:underline">
        {user.username}
        {user.role !== "USER" && (
          <span className="ml-1.5 rounded bg-sky-600/15 px-1.5 py-0.5 text-xs text-sky-700 dark:text-sky-300">
            {user.role.toLowerCase()}
          </span>
        )}
      </Link>
      <button
        type="button"
        className={linkClass}
        onClick={async () => {
          await logout();
          router.push("/");
        }}
      >
        Log out
      </button>
    </div>
  );
}
