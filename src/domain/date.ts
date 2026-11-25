/** Dates are ISO `YYYY-MM-DD` strings with no time zone (spec v1 §2); no `Date` parsing, so no shifts. */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Validates a calendar date in `YYYY-MM-DD` and returns it trimmed. Throws on anything else. */
export function parseIsoDate(text: string): string {
  const value = text.trim();
  const match = ISO_DATE.exec(value);
  const [year, month, day] = match ? match.slice(1).map(Number) : [];
  if (
    year === undefined || month === undefined || day === undefined ||
    month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)
  ) {
    throw new Error(`Invalid date: ${JSON.stringify(text)} (expected YYYY-MM-DD)`);
  }
  return value;
}
