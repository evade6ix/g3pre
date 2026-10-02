"use client";

import { useEffect, useRef, useState } from "react";

type Comment = { id: string; createdAt: string; message: string };
const requests = new Map<string, { expires: number; promise: Promise<Comment[]> }>();
// Limit simultaneous timeline requests when several order cards become visible together.
let active = 0;
const waiting: (() => void)[] = [];

function loadComments(orderId: string): Promise<Comment[]> {
  const existing = requests.get(orderId);
  if (existing && existing.expires > Date.now()) return existing.promise;
  const promise = (async () => {
    if (active >= 3) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/comments`);
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to load staff comments");
      return data.comments as Comment[];
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  })();
  requests.set(orderId, { expires: Date.now() + 60_000, promise });
  void promise.catch(() => {
    if (requests.get(orderId)?.promise === promise) requests.delete(orderId);
  });
  return promise;
}

export default function OrderComments({ orderId, hasTimelineComment }: { orderId: string; hasTimelineComment?: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!hasTimelineComment || !element.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
    }, { rootMargin: "150px" });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [hasTimelineComment]);

  useEffect(() => {
    if (!hasTimelineComment || !visible) return;
    let cancelled = false;
    const sync = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const notes = await loadComments(orderId);
        if (!cancelled) { setComments(notes); setError(""); }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load staff comments");
      }
    };
    void sync();
    const timer = window.setInterval(() => void sync(), 60_000);
    window.addEventListener("focus", sync);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener("focus", sync); };
  }, [orderId, hasTimelineComment, visible, retry]);

  if (!hasTimelineComment || (comments?.length === 0 && !error)) return null;
  return <div ref={element} className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/[.06] p-4">
    <p className="text-xs font-bold uppercase tracking-wider text-amber-200">Staff comments</p>
    {comments === null && !error && <p className="mt-2 text-sm text-slate-400">Loading timeline comments…</p>}
    {comments && <div className="mt-3 space-y-3">{comments.map((comment) => <div key={comment.id}>
      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{comment.message || "Comment has no text. View its attachment in Shopify."}</p>
      <p className="mt-1 text-xs text-slate-400"><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString("en-CA", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</time></p>
    </div>)}</div>}
    {error && <p className="mt-2 text-sm text-amber-200" role="status">{error} <button type="button" onClick={() => { requests.delete(orderId); setRetry((n) => n + 1); }} className="underline">Retry</button></p>}
  </div>;
}
