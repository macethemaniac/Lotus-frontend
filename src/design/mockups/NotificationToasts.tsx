import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowRightLeft,
  Building2,
  CheckCircle2,
  Clock,
  Store,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  NotificationToast,
  type NotificationToastProps,
  type NotificationToastTone,
} from "@/features/notifications/components/notification-toast";

type ScenarioToast = {
  id: string;
  category: string;
  tone: NotificationToastTone;
  icon: NotificationToastProps["icon"];
  title: string;
  description: string;
  meta: string;
  processing?: boolean;
  expandable?: boolean;
  actions?: NotificationToastProps["actions"];
};

const scenarios: ScenarioToast[] = [
  {
    id: "route-ready",
    category: "Execution",
    tone: "trade",
    icon: <Zap className="h-5 w-5" aria-hidden />,
    title: "Smart route ready",
    description: "Live market quote is ready. Review the route before placing the order.",
    meta: "Polymarket, 2.04 shares @ 99c",
  },
  {
    id: "trade-filled",
    category: "Execution",
    tone: "success",
    icon: <CheckCircle2 className="h-5 w-5" aria-hidden />,
    title: "Fill confirmed",
    description: "Your Polymarket buy filled and the verified position is updating.",
    meta: "exec_quote_6d32...b877",
    expandable: true,
  },
  {
    id: "execution-submitted",
    category: "Execution",
    tone: "info",
    icon: <Clock className="h-5 w-5" aria-hidden />,
    title: "Order submitted",
    description: "Lotus submitted the signed order and is waiting for venue fill evidence.",
    meta: "Settlement: pending",
    processing: true,
  },
  {
    id: "execution-blocked",
    category: "Execution",
    tone: "error",
    icon: <AlertCircle className="h-5 w-5" aria-hidden />,
    title: "Execution blocked",
    description: "Polymarket rejected the order parameters. Preview a new route before retrying.",
    meta: "POLYMARKET_CLOB_ORDER_PARAMS_REJECTED",
    expandable: true,
  },
  {
    id: "venue-activation",
    category: "Venue readiness",
    tone: "venue",
    icon: <Building2 className="h-5 w-5" aria-hidden />,
    title: "Venue activation required",
    description: "Polymarket needs activation before this balance can be used for live routes.",
    meta: "Step 2 of 3: collateral setup",
    actions: [
      { label: "Activate", onClick: () => undefined },
      { label: "Later", variant: "secondary", onClick: () => undefined },
    ],
  },
  {
    id: "clob-sync-pending",
    category: "Venue readiness",
    tone: "warning",
    icon: <Store className="h-5 w-5" aria-hidden />,
    title: "CLOB readiness pending",
    description: "CLOB sync is confirmed locally. Lotus is checking live submit spendable balance.",
    meta: "Next check: automatic",
    processing: true,
  },
  {
    id: "deposit-complete",
    category: "Funding",
    tone: "success",
    icon: <TrendingDown className="h-5 w-5" aria-hidden />,
    title: "Deposit completed",
    description: "500 USDC is now venue-ready for prediction routing.",
    meta: "Balance updated: 1,500 USDC",
  },
  {
    id: "withdrawal-complete",
    category: "Funding",
    tone: "success",
    icon: <ArrowDownLeft className="h-5 w-5" aria-hidden />,
    title: "Withdrawal complete",
    description: "USDC landed in the destination wallet and portfolio cash is updated.",
    meta: "Destination: 8h4z...Qm2a",
  },
  {
    id: "position-merged",
    category: "Portfolio",
    tone: "trade",
    icon: <ArrowRightLeft className="h-5 w-5" aria-hidden />,
    title: "Position merged",
    description: "Opposing Yes and No shares were merged and released back to cash.",
    meta: "Returned: 25.0 USDC",
    expandable: true,
  },
  {
    id: "sell-filled",
    category: "Portfolio",
    tone: "success",
    icon: <TrendingUp className="h-5 w-5" aria-hidden />,
    title: "Sell filled",
    description: "Your sell filled and the position balance is updating from venue evidence.",
    meta: "6.07 shares @ 99c",
  },
];

export function NotificationToastsDemo() {
  const [visibleToastIds, setVisibleToastIds] = useState(() => scenarios.map((item) => item.id));
  const visibleToasts = useMemo(
    () => scenarios.filter((item) => visibleToastIds.includes(item.id)),
    [visibleToastIds],
  );

  const dismissToast = (id: string) => {
    setVisibleToastIds((current) => current.filter((item) => item !== id));
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-16">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Production notification toasts</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Execution, funding, venue readiness, and portfolio notification states for the live Lotus app.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setVisibleToastIds(scenarios.map((item) => item.id))}
          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-lotus-500 px-4 text-sm font-semibold text-black transition-colors hover:bg-lotus-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lotus-500 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          Replay toasts
        </button>
      </div>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3" aria-label="Live notification toast examples">
        {visibleToasts.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-surface-panel p-5 text-sm text-zinc-400">
            Notifications cleared.
          </div>
        ) : (
          visibleToasts.map((item) => (
            <NotificationToast
              key={item.id}
              icon={item.icon}
              tone={item.tone}
              title={item.title}
              timeLabel="Now"
              description={item.description}
              meta={item.meta}
              processing={item.processing}
              expandable={item.expandable}
              actions={item.actions}
              autoCloseMs={4_000}
              onDismiss={() => dismissToast(item.id)}
              unread
            />
          ))
        )}
      </section>

      <section className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {["Execution", "Venue readiness", "Funding", "Portfolio"].map((category) => (
          <div key={category} className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{category}</h2>
            {scenarios
              .filter((item) => item.category === category)
              .map((item) => (
                <NotificationToast
                  key={`${category}-${item.id}`}
                  icon={item.icon}
                  tone={item.tone}
                  title={item.title}
                  timeLabel="2m"
                  description={item.description}
                  meta={item.meta}
                  processing={item.processing}
                  expandable={item.expandable}
                  actions={item.actions}
                />
              ))}
          </div>
        ))}
      </section>
    </div>
  );
}
