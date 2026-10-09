import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto w-full max-w-sm flex-1 px-4 py-16">
      <h1 className="mb-6 text-2xl font-semibold">Log in</h1>
      {/* useSearchParams() Suspense-এর ভেতরে থাকতে হয় */}
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
