import chalk from "chalk";

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

/**
 * Format a byte count as a human-readable string, e.g. 1536 -> "1.5 KB".
 * @param {number} bytes
 */
export function formatSize(bytes) {
  if (bytes === 0) return "0 B";
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / Math.pow(1024, exp);
  const decimals = value >= 100 || exp === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${UNITS[exp]}`;
}

/**
 * Color a formatted size string by magnitude relative to the largest sibling.
 * @param {number} bytes
 * @param {number} maxBytes - size of the largest sibling, for relative coloring
 */
export function colorForSize(bytes, maxBytes) {
  if (maxBytes === 0) return chalk.gray;
  const ratio = bytes / maxBytes;
  if (ratio > 0.5) return chalk.red;
  if (ratio > 0.2) return chalk.yellow;
  if (ratio > 0.05) return chalk.green;
  return chalk.gray;
}

/**
 * Render a fixed-width bar chart segment representing `ratio` (0-1) filled.
 * @param {number} ratio
 * @param {number} width
 */
export function renderBar(ratio, width = 20) {
  const filled = Math.max(0, Math.min(width, Math.round(ratio * width)));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

/**
 * Pad a string on the right to a fixed visible width (ignoring ANSI codes
 * would be ideal, but for our fixed-format labels plain length is fine).
 */
export function padRight(str, width) {
  return str.length >= width ? str : str + " ".repeat(width - str.length);
}

export function padLeft(str, width) {
  return str.length >= width ? str : " ".repeat(width - str.length) + str;
}
