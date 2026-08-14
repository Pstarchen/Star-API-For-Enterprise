export const USER_TIME_ZONE_COOKIE = "star-api-time-zone";
export const DEFAULT_USER_TIME_ZONE = "UTC";

export function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function userTimeZone(value: unknown) {
  return validTimeZone(value) ? value : DEFAULT_USER_TIME_ZONE;
}

export function formatUserDate(value: string | number | Date, timeZone: string, dateOnly = false, options?: Intl.DateTimeFormatOptions) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const normalizedTimeZone = userTimeZone(timeZone);
  return dateOnly
    ? date.toLocaleDateString("zh-CN", { ...options, timeZone: normalizedTimeZone })
    : date.toLocaleString("zh-CN", { ...options, timeZone: normalizedTimeZone });
}
