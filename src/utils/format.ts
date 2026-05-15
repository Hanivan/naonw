/**
 * Compact number: 23112 → "23.1K", 1234567 → "1.2M", 0 → "0".
 * Uses 1000-base (SI), one decimal for K/M/B/T, no decimal under 1000.
 */
export function compactNum(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs < 1000) return `${sign}${abs}`;
  const units = ["K", "M", "B", "T"];
  let v = abs;
  let i = -1;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  // Drop trailing ".0" (e.g. 5000 → "5K" not "5.0K")
  const s = v >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, "");
  return `${sign}${s}${units[i]}`;
}
