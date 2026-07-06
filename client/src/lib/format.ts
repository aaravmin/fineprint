// Presentation-free formatting helpers for the dashboard. The stat tiles and
// glanceable rows want compact figures ($1.28M, 12.4K, 480 t) rather than the
// full-precision engine formatters, and the operations surfaces want humanized
// time. Kept in lib so components stay JSX-only.

function trimTrailingZeros(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

// A dollar figure shortened for a stat tile: $1.28M, $124K, $12.4K, $480.
export function compactUsd(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);

  if (abs >= 1_000_000) {
    return `${sign}$${trimTrailingZeros((abs / 1_000_000).toFixed(2))}M`;
  }
  if (abs >= 1_000) {
    const thousands = abs / 1_000;
    const decimals = thousands >= 100 ? 0 : 1;
    return `${sign}$${trimTrailingZeros(thousands.toFixed(decimals))}K`;
  }
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

// A count or tonnage shortened the same way, without the currency symbol.
export function compactNumber(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  if (abs >= 1_000_000) {
    return `${sign}${trimTrailingZeros((abs / 1_000_000).toFixed(2))}M`;
  }
  if (abs >= 1_000) {
    const thousands = abs / 1_000;
    const decimals = thousands >= 100 ? 0 : 1;
    return `${sign}${trimTrailingZeros(thousands.toFixed(decimals))}K`;
  }
  return `${sign}${Math.round(abs).toLocaleString("en-US")}`;
}

// Emissions against the cap, as a severity tone: under the cap is fine, up to
// 10% over is a warning, further over is a violation.
export function capSeverity(actual: number, limit: number): "success" | "warning" | "destructive" {
  if (limit <= 0 || actual <= limit) {
    return "success";
  }
  if (actual <= limit * 1.1) {
    return "warning";
  }
  return "destructive";
}

// The street line only, for a row or bar label: "58-80 59 STREET, Maspeth, NY,
// USA" -> "58-80 59 STREET".
export function shortAddress(address: string): string {
  const street = address.split(",")[0]?.trim();
  return street && street.length > 0 ? street : address;
}

// Whole days from now until a target, signed: positive is the future, negative
// is overdue. Ceil so "12 hours away" still reads as "in 1 day".
export function daysUntil(target: Date, from: Date = new Date()): number {
  const millisecondsPerDay = 86_400_000;
  return Math.ceil((target.getTime() - from.getTime()) / millisecondsPerDay);
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function relativeTimeAgo(when: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - when.getTime()) / 1_000));
  if (seconds < 45) {
    return "just now";
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }

  const months = Math.round(days / 30);
  if (months < 12) {
    return `${months}mo ago`;
  }

  return `${Math.round(months / 12)}y ago`;
}
