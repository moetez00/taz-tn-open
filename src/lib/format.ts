// Dates in front matter are calendar days, parsed as UTC midnight, so format them in UTC.
// Month names are spelled out here because ICU versions disagree on "Sep" and "Sept".
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const formatDate = (date: Date) =>
  `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
export const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export const formatMonth = (date: Date) => `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;

/** "Feb – May 2026", "Dec 2025 – Jan 2026", or one month. */
export function formatPeriod(from: Date, to?: Date): string {
  if (!to || formatMonth(from) === formatMonth(to)) return formatMonth(from);
  const sameYear = from.getUTCFullYear() === to.getUTCFullYear();
  return `${sameYear ? MONTHS[from.getUTCMonth()] : formatMonth(from)} – ${formatMonth(to)}`;
}
