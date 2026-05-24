import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import {
  Archive,
  Camera,
  Check,
  ChevronDown,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  LogOut,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import { KeyFormat, useTurnkey, type Wallet as TurnkeyWallet, type WalletAccount } from "@turnkey/react-wallet-kit";
import type { AuthSession } from "@/features/auth/types";
import { exchangeTurnkeySessionForLotusJwt } from "@/features/auth/api/turnkey-auth";
import { LotusTurnkeyProvider } from "@/app/turnkey-provider";
import { ApiClientError } from "@/lib/api/http-client";
import {
  clearStoredSession,
  createSessionFromJwt,
  loadStoredSession,
  storeSession,
} from "@/features/auth/session-storage";
import { TurnkeyAuthScreen } from "@/features/auth/components/turnkey-auth-screen";
import { DashboardV2Mockup, type LotusAppPage } from "@/design/mockups/DashboardV2Mockup";
import { DenseStripFooter } from "@/design/mockups/GlobalFooterVariations";
import { getPortfolioSummary, type PortfolioSummary } from "@/features/trading/api/execution-api";
import { getVenueBalances, getVenueCapabilities, mergeVenueBalanceSnapshots, type VenueBalance } from "@/features/funding/api/funding-api";
import { getMarketBatchQuotes, listEvents, listMarkets } from "@/features/markets/api/market-api";
import { getNotifications } from "@/features/notifications/api/notification-api";
import { listWallets, mergeUserWalletBalanceSnapshots, type UserWallet } from "@/features/wallets/api/wallet-api";

const lotusPageRouteByPage: Record<LotusAppPage, string> = {
  home: "/dashboard",
  markets: "/markets",
  terminal: "/terminal",
  portfolio: "/portfolio",
  settings: "/settings",
};

const lotusPageTitleByPage: Record<LotusAppPage, string> = {
  home: "Lotus Dashboard",
  markets: "Lotus Markets",
  terminal: "Lotus Terminal",
  portfolio: "Lotus Portfolio",
  settings: "Lotus Settings",
};

function normalizeAppPath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized || "/";
}

function lotusPageFromPath(pathname: string): LotusAppPage {
  switch (normalizeAppPath(pathname)) {
    case "/":
    case "/dashboard":
    case "/home":
      return "home";
    case "/markets":
      return "markets";
    case "/terminal":
      return "terminal";
    case "/portfolio":
      return "portfolio";
    case "/settings":
      return "settings";
    default:
      return "home";
  }
}

function setLotusDocumentTitle(page: LotusAppPage): void {
  document.title = lotusPageTitleByPage[page];
}

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

function formatLotusSessionExchangeError(error: unknown): string {
  if (error instanceof ApiClientError) {
    return [
      "Turnkey login succeeded, but Lotus could not issue a session.",
      error.code ? `Backend code: ${error.code}.` : `HTTP ${error.status}.`,
      "Try again or check backend auth.",
    ].join(" ");
  }

  if (error instanceof Error) {
    return `Turnkey login succeeded, but Lotus could not issue a session. ${error.message}`;
  }

  return "Turnkey login succeeded, but Lotus could not issue a session. Try again or check backend auth.";
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

type LocalAccountProfile = {
  displayName: string;
  avatarDataUrl: string | null;
};

function profileStorageKey(userId: string): string {
  return `lotus.accountProfile.${userId}`;
}

function loadLocalAccountProfile(userId: string, fallbackName: string): LocalAccountProfile {
  try {
    const raw = window.localStorage.getItem(profileStorageKey(userId));
    if (!raw) return { displayName: fallbackName, avatarDataUrl: null };
    const parsed = JSON.parse(raw) as Partial<LocalAccountProfile>;
    return {
      displayName: typeof parsed.displayName === "string" && parsed.displayName.trim() ? parsed.displayName : fallbackName,
      avatarDataUrl: typeof parsed.avatarDataUrl === "string" ? parsed.avatarDataUrl : null,
    };
  } catch {
    return { displayName: fallbackName, avatarDataUrl: null };
  }
}

function saveLocalAccountProfile(userId: string, profile: LocalAccountProfile): void {
  window.localStorage.setItem(profileStorageKey(userId), JSON.stringify(profile));
}

function formatAccountCurrency(value: string | number | null | undefined): string {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[$,\s]/g, "")) : NaN;
  const safe = Number.isFinite(parsed) ? parsed : 0;
  return safe.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function walletAddressEquals(left?: string | null, right?: string | null): boolean {
  if (!left || !right) return false;
  if (left.startsWith("0x") && right.startsWith("0x")) {
    return left.toLowerCase() === right.toLowerCase();
  }
  return left === right;
}

function canonicalQuoteOutcomeId(label: string): string {
  const trimmed = label.trim();
  const normalized = trimmed.toUpperCase().replace(/\s+/g, "_");
  if (normalized === "YES" || normalized === "NO" || normalized === "UP" || normalized === "DOWN") {
    return normalized;
  }
  return trimmed;
}

type TurnkeyWalletMatch = {
  wallet: TurnkeyWallet;
  account: WalletAccount;
};

function findTurnkeyWalletAccount(wallets: TurnkeyWallet[], address: string): TurnkeyWalletMatch | null {
  for (const wallet of wallets) {
    for (const account of wallet.accounts ?? []) {
      if (walletAddressEquals(account.address, address)) {
        return { wallet, account };
      }
    }
  }
  return null;
}

function walletExportKeyFormat(wallet: UserWallet): KeyFormat {
  return wallet.chainFamily.toUpperCase() === "SOLANA" ? KeyFormat.Solana : KeyFormat.Hexadecimal;
}

function AccountDropdown({
  session,
  onLogout,
  onNavigate,
}: {
  session: AuthSession;
  onLogout: () => void;
  onNavigate: (page: LotusAppPage) => void;
}) {
  const { handleExportWallet, handleExportWalletAccount, refreshWallets, wallets: turnkeyWallets } = useTurnkey();
  const [open, setOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [showRecoveryGate, setShowRecoveryGate] = useState(false);
  const [copiedRecovery, setCopiedRecovery] = useState<string | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [exportingWalletId, setExportingWalletId] = useState<string | null>(null);
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummary | null>(null);
  const [venueBalances, setVenueBalances] = useState<VenueBalance[]>([]);
  const [wallets, setWallets] = useState<UserWallet[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const displayId = useMemo(() => shortId(session.userId, 12, 6), [session.userId]);
  const shortWallet = useMemo(() => shortId(session.userId, 4, 4), [session.userId]);
  const sourceLabel = session.source === "lotus_jwt" ? "Lotus session" : "Turnkey session";
  const [profile, setProfile] = useState<LocalAccountProfile>(() => loadLocalAccountProfile(session.userId, displayId));
  const [draftName, setDraftName] = useState(profile.displayName);
  const cashTotal = venueBalances.reduce((sum, balance) => {
    const parsed = Number(balance.availableAmount ?? balance.readyAmount ?? 0);
    return Number.isFinite(parsed) ? sum + parsed : sum;
  }, 0);
  const portfolioTotal = portfolioSummary?.totalMarkValue ?? portfolioSummary?.totalCostBasis ?? "0";
  const evmWallet = wallets.find((wallet) => wallet.status === "ACTIVE" && wallet.chainFamily.toUpperCase() === "EVM") ?? null;
  const solanaWallet = wallets.find((wallet) => wallet.status === "ACTIVE" && wallet.chainFamily.toUpperCase() === "SOLANA") ?? null;
  const avatarInitial = (profile.displayName || session.userId || "L").trim().charAt(0).toUpperCase();

  useEffect(() => {
    const nextProfile = loadLocalAccountProfile(session.userId, displayId);
    setProfile(nextProfile);
    setDraftName(nextProfile.displayName);
  }, [displayId, session.userId]);

  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    setStatsError(null);
    Promise.all([
      getPortfolioSummary(session.userJwt),
      getVenueBalances(session.userJwt),
      listWallets(session.userJwt),
    ])
      .then(([summary, balances, walletResponse]) => {
        if (cancelled) return;
        setPortfolioSummary(summary);
        setVenueBalances((current) => mergeVenueBalanceSnapshots(current, balances.balances ?? balances.venues ?? []));
        setWallets((current) => mergeUserWalletBalanceSnapshots(current, walletResponse.wallets ?? []));
      })
      .catch((error) => {
        if (cancelled) return;
        setStatsError(error instanceof Error ? error.message : "Account stats are unavailable.");
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session.userJwt]);

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

  const copyRecoveryValue = (label: string, value: string | null | undefined) => {
    if (!value) return;
    void navigator.clipboard?.writeText(value);
    setCopiedRecovery(label);
    window.setTimeout(() => setCopiedRecovery(null), 1500);
  };

  const formatTurnkeyExportError = (error: unknown): string => {
    const messages: string[] = [];
    let cursor: unknown = error;
    for (let depth = 0; depth < 4 && cursor; depth += 1) {
      if (cursor instanceof Error && cursor.message && !messages.includes(cursor.message)) {
        messages.push(cursor.message);
      }
      cursor = cursor instanceof Error && "cause" in cursor ? cursor.cause : null;
    }
    return messages.length ? messages.join(" ") : "Turnkey wallet export failed.";
  };

  const exportWalletWithTurnkey = async (label: string, wallet: UserWallet | null) => {
    if (!wallet) {
      setRecoveryMessage(`${label} is not provisioned yet.`);
      return;
    }

    if (wallet.provider.toUpperCase() !== "TURNKEY" || !wallet.exportable) {
      setRecoveryMessage(`${label} cannot be exported from Lotus. Use the wallet provider recovery flow for this account.`);
      return;
    }

    setRecoveryMessage(null);
    setExportingWalletId(wallet.walletId);
    try {
      let account = findTurnkeyWalletAccount(turnkeyWallets, wallet.address);
      if (!account) {
        const refreshedWallets = await refreshWallets();
        account = findTurnkeyWalletAccount(refreshedWallets, wallet.address);
      }

      if (!account) {
        setRecoveryMessage(`${label} was found in Lotus, but the matching Turnkey wallet is not loaded in this browser session. Refresh your wallet session and try again.`);
        return;
      }

      const exportWalletId = account.account.walletId ?? account.wallet.walletId;
      setOpen(false);
      setRecoveryOpen(false);
      if (exportWalletId) {
        await handleExportWallet({ walletId: exportWalletId });
      } else {
        await handleExportWalletAccount({
          address: account.account.address,
          keyFormat: walletExportKeyFormat(wallet),
        });
      }
      setRecoveryMessage(`${label} export completed through Turnkey secure recovery.`);
    } catch (error) {
      const message = formatTurnkeyExportError(error);
      setOpen(true);
      setRecoveryOpen(true);
      setRecoveryMessage(message.toLowerCase().includes("canceled") ? `${label} export was canceled.` : message);
    } finally {
      setExportingWalletId(null);
    }
  };

  const saveProfile = () => {
    const nextProfile = { ...profile, displayName: draftName.trim() || displayId };
    setProfile(nextProfile);
    saveLocalAccountProfile(session.userId, nextProfile);
    setEditingProfile(false);
  };

  const updateAvatar = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const avatarDataUrl = typeof reader.result === "string" ? reader.result : null;
      const nextProfile = { ...profile, avatarDataUrl };
      setProfile(nextProfile);
      saveLocalAccountProfile(session.userId, nextProfile);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div ref={menuRef} className="fixed right-3 top-3 z-50 sm:right-5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="group flex h-10 items-center gap-2 rounded-full border border-zinc-800 bg-[#070708]/95 pl-1.5 pr-3 text-xs font-semibold text-zinc-200 shadow-2xl shadow-black/40 backdrop-blur transition hover:border-zinc-700 hover:bg-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/70"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#ccff00] via-emerald-300 to-teal-400 text-[11px] font-black text-black shadow-[0_0_24px_rgba(204,255,0,0.18)]">
          {profile.avatarDataUrl ? (
            <img src={profile.avatarDataUrl} alt="" className="h-full w-full rounded-full object-cover" />
          ) : avatarInitial}
        </span>
        <span className="max-w-[150px] truncate text-[11px] font-bold text-zinc-200">{profile.displayName}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-zinc-500 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-3 w-[min(342px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-zinc-800 bg-[#121214] text-zinc-100 shadow-2xl shadow-black/60"
        >
          <div className="relative border-b border-zinc-800 p-4">
            <div className="absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_18%_0%,rgba(204,255,0,0.13),transparent_42%),radial-gradient(circle_at_90%_10%,rgba(16,185,129,0.08),transparent_34%)]" />
            <div className="relative flex items-start gap-3">
              <label className="group/avatar relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#ccff00] via-emerald-300 to-teal-400 text-sm font-black text-black">
                {profile.avatarDataUrl ? (
                  <img src={profile.avatarDataUrl} alt="" className="h-full w-full object-cover" />
                ) : avatarInitial}
                <span className="absolute inset-0 hidden items-center justify-center bg-black/55 text-white group-hover/avatar:flex">
                  <Camera className="h-4 w-4" />
                </span>
                <input type="file" accept="image/*" onChange={updateAvatar} className="sr-only" />
              </label>
              <div className="min-w-0 flex-1">
                {editingProfile ? (
                  <div className="flex items-center gap-1">
                    <input
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm font-bold text-white outline-none focus:border-[#ccff00]/60"
                    />
                    <button type="button" onClick={saveProfile} className="rounded-md p-1 text-[#ccff00] hover:bg-zinc-800" aria-label="Save profile name">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => { setDraftName(profile.displayName); setEditingProfile(false); }} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white" aria-label="Cancel profile edit">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="truncate text-sm font-bold text-white">{profile.displayName}</div>
                    <button
                      type="button"
                      onClick={() => setEditingProfile(true)}
                      className="rounded-md p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-[#ccff00]"
                      aria-label="Edit profile name"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                  <span className="font-mono">{shortId(session.userId, 4, 4)}</span>
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
                onClick={() => {
                  setOpen(false);
                  onNavigate("settings");
                }}
                className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]/60"
                aria-label="Open settings"
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
                  <span className="font-mono">{displayId}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 px-4 py-3">
                <AccountStat label="Portfolio" value={statsLoading ? "Syncing" : formatAccountCurrency(portfolioTotal)} />
                <AccountStat label="Positions" value={statsLoading ? "Syncing" : `${portfolioSummary?.positionCount ?? 0} open`} />
                <AccountStat label="Cash" value={statsLoading ? "Syncing" : formatAccountCurrency(cashTotal)} />
              </div>
            </div>
            {statsError && (
              <div className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-200">
                {statsError}
              </div>
            )}

            <div className="mt-3 space-y-1">
              <AccountMenuButton icon={<Archive className="h-4 w-4" />} label="Account recovery" onClick={() => setRecoveryOpen(true)} />
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

      {recoveryOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#121214] p-4 text-zinc-100 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white">Account recovery</h2>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  Lotus does not display or copy raw private keys. Wallet export must happen through Turnkey secure recovery so the key is not exposed to Lotus.
                </p>
              </div>
              <button type="button" onClick={() => setRecoveryOpen(false)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-white" aria-label="Close account recovery">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Secure export gate</span>
                <button
                  type="button"
                  onClick={() => setShowRecoveryGate((value) => !value)}
                  className="flex items-center gap-1 rounded-lg border border-zinc-800 px-2 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
                >
                  {showRecoveryGate ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {showRecoveryGate ? "Hide" : "Show"} passkey note
                </button>
              </div>
              <div className={`rounded-lg border border-zinc-800 bg-[#18181a] p-3 text-xs leading-relaxed text-zinc-400 ${showRecoveryGate ? "" : "blur-sm select-none"}`}>
                Use the Turnkey passkey-backed export flow for private key recovery. Lotus can help identify the account, but it must not render the private key in this app.
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <RecoveryCopyRow label="User ID" value={session.userId} copied={copiedRecovery === "User ID"} onCopy={() => copyRecoveryValue("User ID", session.userId)} />
              <RecoveryWalletRow
                label="EVM wallet"
                wallet={evmWallet}
                copied={copiedRecovery === "EVM wallet"}
                exporting={exportingWalletId === evmWallet?.walletId}
                onCopy={() => copyRecoveryValue("EVM wallet", evmWallet?.address)}
                onExport={() => void exportWalletWithTurnkey("EVM wallet", evmWallet)}
              />
              <RecoveryWalletRow
                label="Solana wallet"
                wallet={solanaWallet}
                copied={copiedRecovery === "Solana wallet"}
                exporting={exportingWalletId === solanaWallet?.walletId}
                onCopy={() => copyRecoveryValue("Solana wallet", solanaWallet?.address)}
                onExport={() => void exportWalletWithTurnkey("Solana wallet", solanaWallet)}
              />
            </div>
            {recoveryMessage && (
              <div className="mt-3 rounded-xl border border-[#ccff00]/25 bg-[#ccff00]/10 px-3 py-2 text-xs font-semibold leading-relaxed text-[#ccff00]">
                {recoveryMessage}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RecoveryWalletRow({
  label,
  wallet,
  copied,
  exporting,
  onCopy,
  onExport,
}: {
  label: string;
  wallet: UserWallet | null;
  copied: boolean;
  exporting: boolean;
  onCopy: () => void;
  onExport: () => void;
}) {
  const canCopy = Boolean(wallet?.address);
  const canExport = Boolean(wallet?.address && wallet.exportable && wallet.provider.toUpperCase() === "TURNKEY");
  return (
    <div className="rounded-xl border border-zinc-800 bg-[#18181a] px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-600">{label}</div>
          <div className="mt-1 truncate font-mono text-xs text-zinc-300">{wallet?.address ?? "Not provisioned"}</div>
        </div>
        <button
          type="button"
          onClick={onCopy}
          disabled={!canCopy}
          className="rounded-lg p-2 text-zinc-500 transition enabled:hover:bg-zinc-800 enabled:hover:text-[#ccff00] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="h-4 w-4 text-[#ccff00]" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <button
        type="button"
        onClick={onExport}
        disabled={!canExport || exporting}
        className="mt-2 w-full rounded-lg border border-[#ccff00]/25 bg-[#ccff00]/10 px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-[#ccff00] transition enabled:hover:bg-[#ccff00]/15 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-950 disabled:text-zinc-600"
      >
        {exporting ? "Opening Turnkey..." : canExport ? "Export with Turnkey" : "Export unavailable"}
      </button>
    </div>
  );
}

function RecoveryCopyRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  const canCopy = value !== "Not provisioned";
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-[#18181a] px-3 py-2">
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-600">{label}</div>
        <div className="mt-1 truncate font-mono text-xs text-zinc-300">{value}</div>
      </div>
      <button
        type="button"
        onClick={onCopy}
        disabled={!canCopy}
        className="rounded-lg p-2 text-zinc-500 transition enabled:hover:bg-zinc-800 enabled:hover:text-[#ccff00] disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check className="h-4 w-4 text-[#ccff00]" /> : <Copy className="h-4 w-4" />}
      </button>
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
  const [activePage, setActivePage] = useState<LotusAppPage>(() => lotusPageFromPath(window.location.pathname));

  useEffect(() => {
    setSession(loadStoredSession());
  }, []);

  useEffect(() => {
    setLotusDocumentTitle(activePage);
  }, [activePage]);

  useEffect(() => {
    const syncPageFromLocation = () => {
      setActivePage(lotusPageFromPath(window.location.pathname));
    };

    window.addEventListener("popstate", syncPageFromLocation);
    return () => window.removeEventListener("popstate", syncPageFromLocation);
  }, []);

  const navigateToPage = useCallback((page: LotusAppPage) => {
    setActivePage(page);
    const nextPath = lotusPageRouteByPage[page];
    const currentPath = normalizeAppPath(window.location.pathname);
    if (currentPath !== nextPath) {
      window.history.pushState({ lotusPage: page }, "", nextPath);
    }
  }, []);

  const applySession = (nextSession: AuthSession) => {
    storeSession(nextSession);
    setSession(nextSession);
    setAuthError(null);
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
      .catch((error) => {
        setAuthError(formatLotusSessionExchangeError(error));
      })
      .finally(() => setAuthLoading(false));
  };

  useEffect(() => {
    if (!session?.userJwt) return;
    void getPortfolioSummary(session.userJwt).catch(() => undefined);
    void getVenueBalances(session.userJwt).catch(() => undefined);
    void getVenueCapabilities(session.userJwt).catch(() => undefined);
    void getNotifications(session.userJwt, { limit: 8 }).catch(() => undefined);
    void listEvents({ limit: 24 }).catch(() => undefined);
    void listMarkets({ limit: 24, quoteReadyOnly: true, routeCoverage: "all" })
      .then((response) => {
        const items = response.markets.slice(0, 12).flatMap((market) => {
          const outcomes = market.venueMarkets
            .flatMap((venueMarket) => venueMarket.outcomes)
            .filter((outcome) => ["YES", "NO"].includes(outcome.label.trim().toUpperCase()))
            .slice(0, 2);
          return outcomes.flatMap((outcome) => [
            { marketId: market.canonicalMarketIds[0] ?? market.canonicalEventId, outcomeId: canonicalQuoteOutcomeId(outcome.label), side: "buy" as const, amount: "1" },
            { marketId: market.canonicalMarketIds[0] ?? market.canonicalEventId, outcomeId: canonicalQuoteOutcomeId(outcome.label), side: "sell" as const, amount: "1" },
          ]);
        });
        if (items.length > 0) void getMarketBatchQuotes({ items }).catch(() => undefined);
      })
      .catch(() => undefined);
  }, [session?.userJwt]);

  return (
    <LotusTurnkeyProvider
      onAuthenticationSuccess={handleTurnkeyAuthenticationSuccess}
      onError={(error) => setAuthError(formatTurnkeyError(error))}
    >
      {!session ? (
        <TurnkeyAuthScreen
          loading={authLoading}
          error={authError}
          onError={setAuthError}
        />
      ) : (
        <div className="relative h-[100dvh] min-h-[100dvh] overflow-hidden bg-black">
          <AccountDropdown session={session} onLogout={handleLogout} onNavigate={navigateToPage} />
          <DashboardV2Mockup activePage={activePage} onNavigate={navigateToPage} session={session} />
          <DenseStripFooter fixed />
        </div>
      )}
    </LotusTurnkeyProvider>
  );
}
