import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtUsd(n: number | undefined): string {
  return n === undefined ? "—" : `$${n.toLocaleString()}`;
}

export function daysLeft(deadline: { toDate(): Date }): number {
  return Math.ceil((deadline.toDate().getTime() - Date.now()) / 86_400_000);
}
