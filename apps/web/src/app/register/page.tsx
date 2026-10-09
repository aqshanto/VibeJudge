import { Suspense } from "react";
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <main className="mx-auto w-full max-w-sm flex-1 px-4 py-16">
      <h1 className="mb-6 text-2xl font-semibold">Create an account</h1>
      <Suspense>
        <RegisterForm />
      </Suspense>
    </main>
  );
}
