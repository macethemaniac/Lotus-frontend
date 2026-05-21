import type React from "react";
import { ChevronDown, ExternalLink, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type NotificationToastTone = "info" | "success" | "warning" | "error" | "trade" | "venue";

type NotificationToastAction = {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
};

export type NotificationToastProps = {
  icon: React.ReactNode;
  tone?: NotificationToastTone;
  title: string;
  timeLabel: string;
  description: string;
  meta?: string;
  href?: string;
  onSelect?: () => void;
  onDismiss?: () => void;
  actions?: NotificationToastAction[];
  expandable?: boolean;
  processing?: boolean;
  autoCloseMs?: number;
  unread?: boolean;
};

const toneStyles: Record<NotificationToastTone, { icon: string; progress: string; accent: string }> = {
  info: {
    icon: "border-sky-500/20 bg-sky-500/10 text-sky-500 dark:text-sky-400",
    progress: "bg-sky-500",
    accent: "bg-sky-500",
  },
  success: {
    icon: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    progress: "bg-emerald-500",
    accent: "bg-emerald-500",
  },
  warning: {
    icon: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    progress: "bg-amber-500",
    accent: "bg-amber-500",
  },
  error: {
    icon: "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400",
    progress: "bg-red-500",
    accent: "bg-red-500",
  },
  trade: {
    icon: "border-lotus-500/25 bg-lotus-500/10 text-lotus-700 dark:text-lotus-500",
    progress: "bg-lotus-500",
    accent: "bg-lotus-500",
  },
  venue: {
    icon: "border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400",
    progress: "bg-violet-500",
    accent: "bg-violet-500",
  },
};

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

export function NotificationToast({
  icon,
  tone = "info",
  title,
  timeLabel,
  description,
  meta,
  href,
  onSelect,
  onDismiss,
  actions,
  expandable = false,
  processing = false,
  autoCloseMs,
  unread = false,
}: NotificationToastProps) {
  const [expanded, setExpanded] = useState(false);
  const [remainingMs, setRemainingMs] = useState(autoCloseMs ?? 0);
  const onDismissRef = useRef(onDismiss);
  const styles = toneStyles[tone];
  const hasInlineControls = Boolean(href || onDismiss || actions?.length || expandable);
  const hasTopControls = Boolean(href || onDismiss);
  const Root = onSelect && !hasInlineControls ? "button" : "article";
  const countdownPercent = useMemo(() => {
    if (!autoCloseMs || autoCloseMs <= 0) return 0;
    return Math.max(0, Math.min(100, (remainingMs / autoCloseMs) * 100));
  }, [autoCloseMs, remainingMs]);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!autoCloseMs || autoCloseMs <= 0 || !onDismiss) return undefined;

    const startedAt = Date.now();
    setRemainingMs(autoCloseMs);

    const interval = window.setInterval(() => {
      const next = Math.max(0, autoCloseMs - (Date.now() - startedAt));
      setRemainingMs(next);
    }, 100);

    const timeout = window.setTimeout(() => {
      onDismissRef.current?.();
    }, autoCloseMs);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [autoCloseMs, Boolean(onDismiss)]);

  return (
    <Root
      type={Root === "button" ? "button" : undefined}
      onClick={Root === "button" ? onSelect : undefined}
      role={Root === "article" ? "status" : undefined}
      aria-live={Root === "article" ? "polite" : undefined}
      className={cx(
        "relative flex w-full overflow-hidden rounded-lg border border-zinc-200 bg-white p-3.5 text-left shadow-lg shadow-zinc-950/5 transition-colors dark:border-zinc-800 dark:bg-surface-raised dark:shadow-black/30",
        Root === "button" && "hover:border-zinc-300 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lotus-500 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/80",
      )}
    >
      {unread && <span className={cx("absolute left-0 top-0 h-full w-1", styles.accent)} aria-hidden />}

      <div className="flex min-w-0 flex-1 items-start gap-3 pl-1">
        <span className={cx("mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border", styles.icon)}>
          {icon}
        </span>

        <span className="min-w-0 flex-1">
          <span className={cx("flex min-w-0 items-start justify-between gap-3", hasTopControls ? "pr-20" : "pr-1")}>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-zinc-950 dark:text-zinc-100">{title}</span>
              <span className="mt-1 block text-[13px] leading-5 text-zinc-600 dark:text-zinc-400">
                <span className={expanded ? "" : "line-clamp-2"}>{description}</span>
              </span>
            </span>
            <span className="shrink-0 pt-0.5 font-mono text-[11px] text-zinc-500">{timeLabel}</span>
          </span>

          {meta && (
            <span
              className={cx(
                "mt-2 block rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-[11px] text-zinc-500 dark:border-zinc-800 dark:bg-black/20 dark:text-zinc-400",
                !expanded && expandable && "truncate",
              )}
            >
              {meta}
            </span>
          )}

          {actions?.length ? (
            <span className="mt-3 flex flex-wrap items-center gap-2">
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className={cx(
                    "inline-flex min-h-10 items-center justify-center rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lotus-500",
                    action.variant === "secondary"
                      ? "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
                      : "bg-lotus-500 text-black hover:bg-lotus-400",
                  )}
                >
                  {action.label}
                </button>
              ))}
            </span>
          ) : null}

          {expandable && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="mt-2 inline-flex min-h-10 items-center gap-1 rounded-lg pr-2 text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lotus-500 dark:hover:text-zinc-200"
            >
              {expanded ? "Show less" : "View details"}
              <ChevronDown className={cx("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} aria-hidden />
            </button>
          )}
        </span>
      </div>

      {(href || onDismiss) && (
        <span className="absolute right-2 top-2 flex items-center gap-1">
          {href && (
            <a
              href={href}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lotus-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              aria-label={`Open ${title}`}
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lotus-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              aria-label={`Dismiss ${title}`}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </span>
      )}

      {(processing || autoCloseMs) && (
        <span className="absolute bottom-0 left-0 h-1 w-full bg-zinc-200 dark:bg-black/40" aria-hidden>
          <span
            className={cx(
              "block h-full rounded-r-full",
              styles.progress,
              processing && !autoCloseMs && "w-2/3 motion-safe:animate-pulse",
              Boolean(autoCloseMs) && "transition-[width] duration-100 ease-linear",
            )}
            style={autoCloseMs ? { width: `${countdownPercent}%` } : undefined}
          />
        </span>
      )}
    </Root>
  );
}
