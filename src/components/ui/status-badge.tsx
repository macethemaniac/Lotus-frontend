type StatusTone = "ready" | "pending" | "blocked" | "neutral";

const tones: Record<StatusTone, string> = {
  ready: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  blocked: "border-red-500/40 bg-red-500/10 text-red-300",
  neutral: "border-zinc-700 bg-zinc-900 text-zinc-300",
};

export function StatusBadge({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${tones[tone]}`}>{children}</span>;
}
