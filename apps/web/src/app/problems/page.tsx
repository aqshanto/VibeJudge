import { ProblemList } from "./problem-list";

export default function ProblemsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Problems</h1>
      <ProblemList />
    </main>
  );
}
