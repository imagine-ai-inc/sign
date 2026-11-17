import { formatInTimeZone } from "date-fns-tz";

export const DEFAULT_TZ = "America/Los_Angeles";

export function fmtDateTime(d: Date | string | null | undefined, tz = DEFAULT_TZ): string {
  if (!d) return "";
  return formatInTimeZone(new Date(d), tz, "M/d/yyyy | h:mm a zzz");
}
export function fmtDate(d: Date | string | null | undefined, tz = DEFAULT_TZ): string {
  if (!d) return "";
  return formatInTimeZone(new Date(d), tz, "M/d/yyyy");
}
export function fmtShort(d: Date | string | null | undefined, tz = DEFAULT_TZ): string {
  if (!d) return "";
  const date = new Date(d);
  const now = new Date();
  const sameDay = formatInTimeZone(date, tz, "yyyyMMdd") === formatInTimeZone(now, tz, "yyyyMMdd");
  return sameDay ? formatInTimeZone(date, tz, "h:mm a") : formatInTimeZone(date, tz, "M/d/yyyy");
}
export function fmtList(d: Date | string | null | undefined, tz = DEFAULT_TZ): { date: string; time: string } {
  if (!d) return { date: "", time: "" };
  return { date: formatInTimeZone(new Date(d), tz, "M/d/yyyy"), time: formatInTimeZone(new Date(d), tz, "h:mm:ss a") };
}
export function envelopeIdDisplay(id: string) {
  return id.toUpperCase();
}
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
