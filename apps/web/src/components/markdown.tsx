// প্রবলেম স্টেটমেন্ট: Markdown (GFM টেবিল ইত্যাদি) + LaTeX ($...$ inline, $$...$$ block)।
// react-markdown ডিফল্টভাবে raw HTML চালায় না, তাই author-এর লেখা থেকে XSS হয় না।

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="statement">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
