import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import {
  Archive,
  ChevronDown,
  Copy,
  LogOut,
  Plus,
  Settings,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import type { AuthSession } from "@/features/auth/types";
import { exchangeTurnkeySessionForLotusJwt } from "@/features/auth/api/turnkey-auth";
import { LotusTurnkeyProvider } from "@/app/turnkey-provider";
import {
  clearStoredSession,
  createSessionFromJwt,
  loadStoredSession,
  storeSession,
} from "@/features/auth/session-storage";
import { DashboardV2Mockup, type LotusAppPage } from "@/design/mockups/DashboardV2Mockup";
import { TurnkeyAuthScreen } from "@/features/auth/components/turnkey-auth-screen";

function formatTurnkeyError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Turnkey login configuration failed to initialize.";
  }

  const maybeTurnkeyError = error as Error & { code?: string; errorCode?: string; cause?: unknown };
  const code = maybeTurnkeyError.code ?? maybeTurnkeyError.errorCode;
  const cause = maybeTurnkeyError.cause instanceof Error ? maybeTurnkeyError.cause.message : null;
  return [error.message, code ? `code: ${code}` : null, cause ? `cause: ${cause}` : null]
    .filter(Boolean)
    .join(" | ");
}

function shortId(value: string, prefix = 6, suffix = 4): string {
  if (!value) return "unknown";
  if (value.length <= prefix + suffix + 3) return value;
  return `${value.slice(0, prefix)}...${value.slice(-suffix)}`;
}

function getSessionInitial(session: AuthSession): string {
  const value = session.userId || "L";
  return value.charAt(0).toUpperCase();
}

function AccountDropdown({
  session,
  onLogout,
}: {
  session: AuthSession;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const displayId = useMemo(() => shortId(session.userId, 12, 6), [session.userId]);
  const shortWallet = useMemo(() => shortId(session.userId, 4, 4), [session.userId]);
  const sourceLabel = session.source === "lotus_jwt" ? "Lotus session" : "Turnkey session";

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const copyUserId = () => {
    void navigator.clipboard?.writeText(session.userId);
  };

  return (
    <div ref={menuRef} className="fixed right-5 top-3 z-50">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="group flex h-10 items-center gap-2 rounded-full border border-zinc-800 bg-[#070708]/95 pl-1.5 pr-3 text-xs font-semibold text-zinc-200 shadow-2xl shadow-black/40 backdrop-blur transition hover:border-zinc-700 hover:bg-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#ccff00] via-emerald-300 to-teal-400 text-[11px] font-black text-black shadow-[0_0_24px_rgba(204,255,0,0.18)]">
          {getSessionInitial(session)}
        </span>
        <span className="max-w-[150px] truncate font-mono text-[11px] text-zinc-300">{displayId}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-zinc-500 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-3 w-[342px] overflow-hidden rounded-2xl border border-zinc-800 bg-[#121214] text-zinc-100 shadow-2xl shadow-black/60"
        >
          <div className="relative border-b border-zinc-800 p-4">
            <div className="absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_18%_0%,rgba(204,255,0,0.13),transparent_42%),radial-gradient(circle_at_90%_10%,rgba(16,185,129,0.08),transparent_34%)]" />
            <div className="relative flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ccff00] via-emerald-300 to-teal-400 text-sm font-black text-black">
                {getSessionInitial(session)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-white">{displayId}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                  <span className="font-mono">{shortWallet}</span>
                  <button
                    type="button"
                    onClick={copyUserId}
                    className="rounded-md p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-[#ccff00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/60"
                    aria-label="Copy session user id"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/60"
                aria-label="Account settings"
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="p-3">
            <div className="rounded-xl border border-zinc-800 bg-[#18181a]">
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-sm font-bold">Main</span>
                  <span className="rounded-full border border-[#ccff00]/25 bg-[#ccff00]/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-[#ccff00]">
                    Primary
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="font-mono">{shortWallet}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 px-4 py-3">
                <AccountStat label="Portfolio" value="Not synced" />
                <AccountStat label="Positions" value="Open app" />
                <AccountStat label="Cash" value="Backend-led" />
              </div>
            </div>

            <div className="mt-3 space-y-1">
              <AccountMenuButton icon={<Plus className="h-4 w-4" />} label="New wallet" disabled />
              <AccountMenuButton icon={<WalletCards className="h-4 w-4" />} label="Show archived wallets" trailing={<span className="h-5 w-9 rounded-full bg-zinc-950 p-0.5"><span className="block h-4 w-4 rounded-full bg-zinc-600" /></span>} disabled />
              <AccountMenuButton icon={<Archive className="h-4 w-4" />} label="Account recovery" disabled />
              <AccountMenuButton icon={<ShieldCheck className="h-4 w-4 text-[#ccff00]" />} label={sourceLabel} disabled />
              <AccountMenuButton icon={<LogOut className="h-4 w-4" />} label="Log out" onClick={onLogout} />
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3 text-[11px] text-zinc-600">
            <span className="text-[#ccff00]">Lotus private beta</span>
            <span>Privacy Policy&nbsp;&nbsp;|&nbsp;&nbsp;Terms of Use</span>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-600">{label}</div>
      <div className="mt-2 truncate text-xs font-semibold text-zinc-300">{value}</div>
    </div>
  );
}

function AccountMenuButton({
  icon,
  label,
  trailing,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  trailing?: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm font-semibold text-zinc-300 transition enabled:hover:bg-zinc-800/70 enabled:hover:text-white disabled:cursor-not-allowed disabled:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/60"
    >
      <span className="flex items-center gap-3">
        <span className="text-zinc-500">{icon}</span>
        {label}
      </span>
      {trailing}
    </button>
  );
}

export function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [activePage, setActivePage] = useState<LotusAppPage>("home");

  useEffect(() => {
    setSession(loadStoredSession());
  }, []);

  const applySession = (nextSession: AuthSession) => {
    storeSession(nextSession);
    setSession(nextSession);
    setAuthError(null);
  };

  const handleEmailSubmit = async (_email: string) => {
    setAuthError("Email login needs the approved backend user auth endpoint before it can issue a Lotus JWT.");
  };

  const handleLogout = () => {
    clearStoredSession();
    setSession(null);
  };

  const handleTurnkeyAuthenticationSuccess = (params: {
    session:
      | {
          token: string;
          userId: string;
          organizationId: string;
        }
      | undefined;
  }) => {
    if (!params.session) {
      setAuthError("Turnkey completed authentication without returning a session.");
      return;
    }

    setAuthLoading(true);
    setAuthError(null);
    void exchangeTurnkeySessionForLotusJwt({
      turnkeySessionToken: params.session.token,
      turnkeyUserId: params.session.userId,
      turnkeyOrganizationId: params.session.organizationId,
    })
      .then((result) => {
        applySession({
          ...createSessionFromJwt(result.userJwt),
          turnkeySessionToken: params.session?.token,
          turnkeyOrganizationId: params.session?.organizationId,
          source: "lotus_jwt",
        });
      })
      .catch(() => {
        applySession({
          userJwt: params.session?.token ?? "",
          userId: params.session?.userId ?? "turnkey-user",
          turnkeySessionToken: params.session?.token,
          turnkeyOrganizationId: params.session?.organizationId,
          source: "turnkey",
        });
        setAuthError("Logged in with Turnkey. Lotus backend JWT exchange is not configured yet.");
      })
      .finally(() => setAuthLoading(false));
  };

  if (!session) {
    return (
      <LotusTurnkeyProvider
        onAuthenticationSuccess={handleTurnkeyAuthenticationSuccess}
        onError={(error) => setAuthError(formatTurnkeyError(error))}
      >
        <TurnkeyAuthScreen
          onEmailSubmit={handleEmailSubmit}
          loading={authLoading}
          error={authError}
          onError={setAuthError}
        />
      </LotusTurnkeyProvider>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-black">
      <AccountDropdown session={session} onLogout={handleLogout} />
      <DashboardV2Mockup activePage={activePage} onNavigate={setActivePage} />
    </div>
  );
}
