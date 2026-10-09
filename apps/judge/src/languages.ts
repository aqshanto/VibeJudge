import type { Language } from "@vibejudge/shared";

export interface LanguageConfig {
  sourceFile: string;
  compile: string[];
  run: string[];
}

// সব path sandbox-এর ভেতরের (working directory = /box)
export const LANGUAGES: Record<Language, LanguageConfig> = {
  c: {
    sourceFile: "main.c",
    compile: ["/usr/bin/gcc", "-std=gnu17", "-O2", "-pipe", "-DONLINE_JUDGE", "-o", "main", "main.c", "-lm"],
    run: ["./main"],
  },
  cpp: {
    sourceFile: "main.cpp",
    compile: ["/usr/bin/g++", "-std=gnu++20", "-O2", "-pipe", "-DONLINE_JUDGE", "-o", "main", "main.cpp"],
    run: ["./main"],
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
