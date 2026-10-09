import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VibeJudge",
  description: "An online judge for programming contests",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-black/10 dark:border-white/10">
          <nav className="mx-auto flex w-full max-w-4xl items-center gap-6 px-4 py-3 text-sm">
            <Link href="/" className="text-base font-semibold">
              VibeJudge
            </Link>
            <Link href="/problems" className="text-zinc-600 hover:text-foreground dark:text-zinc-400">
              Problems
            </Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
