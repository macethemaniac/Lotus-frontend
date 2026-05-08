import type { HTMLAttributes } from "react";

export function Panel({ className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={`rounded-lg border border-zinc-800 bg-[#121214] ${className}`} />;
}
