import { decodeUserIdFromJwt, type AuthSession } from "@/features/auth/types";

export function SessionPanel({
  session,
  onSessionChange,
}: {
  session: AuthSession | null;
  onSessionChange: (session: AuthSession | null) => void;
}) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Private beta session</h2>
          <p className="mt-1 text-xs text-zinc-400">Paste a user JWT for local beta testing. Tokens stay in memory only.</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${session ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>
          {session ? "USER READY" : "JWT REQUIRED"}
        </span>
      </div>
      <label className="mt-4 block text-xs font-semibold text-zinc-300">
        User JWT
        <textarea
          className="mt-2 h-24 w-full resize-none rounded-md border border-zinc-800 bg-black p-3 font-mono text-xs text-zinc-200 outline-none focus:border-lotus-500 focus:ring-1 focus:ring-lotus-500"
          placeholder="Paste user JWT..."
          value={session?.userJwt ?? ""}
          onChange={(event) => {
            const userJwt = event.target.value.trim();
            onSessionChange(userJwt ? { userJwt, userId: decodeUserIdFromJwt(userJwt) } : null);
          }}
        />
      </label>
    </section>
  );
}
