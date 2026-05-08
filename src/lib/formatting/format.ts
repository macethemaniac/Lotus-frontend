export function formatUsd(value: string | number | undefined): string {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(numeric);
}

export function formatNumber(value: string | number | undefined, maximumFractionDigits = 6): string {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(numeric);
}

export function shortAddress(value: string | undefined): string {
  if (!value) return "Not linked";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function formatDateTime(value: string | undefined): string {
  if (!value) return "Not checked";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
