import type { Language } from "@vibejudge/shared";

export interface LanguageConfig {
  /** সোর্স ফাইলের নাম (Java-তে public class-এর নামে হতে হয়) */
  sourceFile(source: string): string;
  compile(sourceFile: string): string[];
  /** compile box থেকে run box-এ কোন ফাইলগুলো যাবে */
  isArtifact(fileName: string, sourceFile: string): boolean;
  /** heapKb = প্রবলেমের memory limit (Java-র -Xmx) */
  run(source: string, heapKb: number): string[];
  /** cgroup limit = প্রবলেমের limit + এটা (JVM-এর নিজের memory) */
  extraMemoryKb: number;
  /** thread চালাতে দিতে হয় (JVM নিজেই কয়েকটা thread বানায়) */
  processes: number;
  /** stderr রেখে দিই — OutOfMemoryError/MemoryError চিনতে আর author-কে কারণ দেখাতে */
  keepStderr: boolean;
  /** sandbox-এ read-only mount (Java-র security সেটিং /etc-এ থাকে, sandbox-এ /etc নেই) */
  mounts?: Record<string, string>;
}

const JAVA_BIN = "/usr/lib/jvm/vj-java/bin"; // Dockerfile-এর symlink
const JAVA_ETC = "/etc/java-21-openjdk";

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/** "public class Solution" → "Solution"; না থাকলে null */
function publicClass(source: string): string | null {
  return /\bpublic\s+(?:(?:final|abstract|strictfp)\s+)*class\s+([A-Za-z_$][\w$]*)/.exec(stripComments(source))?.[1] ?? null;
}

/** ফাইলের নাম: public class থাকলে javac সেই নামই চায় */
export function javaSourceFile(source: string): string {
  return `${publicClass(source) ?? "Main"}.java`;
}

/** কোন class চালাব: public class, নইলে main()-এর ঠিক আগের class, নইলে "Main" */
export function javaMainClass(source: string): string {
  const code = stripComments(source);
  const pub = publicClass(code);
  if (pub) return pub;
  const mainAt = code.search(/\bstatic\s+void\s+main\s*\(/);
  let last: string | null = null;
  for (const m of code.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)) {
    if (mainAt >= 0 && m.index > mainAt) break;
    last = m[1]!;
  }
  return last ?? "Main";
}

// সব path sandbox-এর ভেতরের (working directory = /box)
export const LANGUAGES: Record<Language, LanguageConfig> = {
  c: {
    sourceFile: () => "main.c",
    compile: () => ["/usr/bin/gcc", "-std=gnu17", "-O2", "-pipe", "-DONLINE_JUDGE", "-o", "main", "main.c", "-lm"],
    isArtifact: (f) => f === "main",
    run: () => ["./main"],
    extraMemoryKb: 0,
    processes: 1,
    keepStderr: false,
  },
  cpp: {
    sourceFile: () => "main.cpp",
    compile: () => ["/usr/bin/g++", "-std=gnu++20", "-O2", "-pipe", "-DONLINE_JUDGE", "-o", "main", "main.cpp"],
    isArtifact: (f) => f === "main",
    run: () => ["./main"],
    extraMemoryKb: 0,
    processes: 1,
    keepStderr: false,
  },
  java: {
    sourceFile: javaSourceFile,
    compile: (file) => [
      `${JAVA_BIN}/javac`,
      "-J-Xmx384m",
      "-J-XX:+UseSerialGC",
      "-J-XX:TieredStopAtLevel=1", // javac নিজে দ্রুত চালু হয়
      "-J-XX:-UsePerfData",
      "-encoding",
      "UTF-8",
      file,
    ],
    isArtifact: (f) => f.endsWith(".class"),
    run: (source, heapKb) => [
      `${JAVA_BIN}/java`,
      `-Xmx${heapKb}k`,
      "-Xss64m", // গভীর recursion (DFS) যেন StackOverflowError না দেয়
      "-XX:+UseSerialGC", // একটাই GC thread — CPU time কম গোনা হয়
      "-XX:-UsePerfData",
      "-DONLINE_JUDGE=true",
      "-cp",
      ".",
      javaMainClass(source),
    ],
    // heap-এর বাইরে JVM-এর নিজের অংশ (~২০-৬০ MB): heap ভরলে OutOfMemoryError → MLE, cgroup kill না
    extraMemoryKb: 128 * 1024,
    processes: 64,
    keepStderr: true,
    mounts: { [JAVA_ETC]: JAVA_ETC },
  },
  python: {
    sourceFile: () => "main.py",
    // compile = শুধু syntax যাচাই, যাতে syntax error হলে CE দেখায় (RE না)
    compile: () => ["/usr/bin/python3", "-m", "py_compile", "main.py"],
    isArtifact: (f) => f === "main.py",
    run: () => ["/usr/bin/python3", "-B", "main.py"],
    extraMemoryKb: 0,
    processes: 1,
    keepStderr: true,
  },
};

// testlib checker কম্পাইল করার কমান্ড (/opt/testlib sandbox-এ mount করা থাকে)
export const CHECKER_COMPILE = [
  "/usr/bin/g++",
  "-std=gnu++20",
  "-O2",
  "-pipe",
  "-I/opt/testlib",
  "-o",
  "checker",
  "checker.cpp",
];
