// পোলিং-এর ছোট সাহায্যকারী: ট্যাব লুকানো থাকলে (অন্য প্রবলেমের ট্যাব, বা অন্য উইন্ডোতে) সার্ভারে
// কিছু চায় না — ট্যাবে ফিরলেই একবার চায়। ১০০০ জনের কনটেস্টে অনেকের কয়েকটা করে ট্যাব খোলা থাকে।

/** `ms` পরে `fn` চালায়, তখন ট্যাব লুকানো থাকলে দেখা না যাওয়া পর্যন্ত অপেক্ষা করে। ফেরত দেয় বাতিলের ফাংশন। */
export function schedulePoll(fn: () => void, ms: number): () => void {
  let cancelled = false;
  let onVisible: (() => void) | null = null;

  const run = () => {
    if (cancelled) return;
    if (!document.hidden) return fn();
    onVisible = () => {
      if (document.hidden) return;
      document.removeEventListener("visibilitychange", onVisible!);
      onVisible = null;
      if (!cancelled) fn();
    };
    document.addEventListener("visibilitychange", onVisible);
  };
  const timer = setTimeout(run, ms);

  return () => {
    cancelled = true;
    clearTimeout(timer);
    if (onVisible) document.removeEventListener("visibilitychange", onVisible);
  };
}

/** একসাথে সবাই যেন না চায় — base থেকে base + spread-এর মধ্যে এলোমেলো */
export const jitter = (base: number, spread: number) => base + Math.random() * spread;
