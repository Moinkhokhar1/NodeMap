import chalk from "chalk";
import { formatSize, colorForSize, renderBar, padRight, padLeft } from "./render.js";

/**
 * Print a static bar-chart report for a scanned directory node.
 * @param {object} node - result from scan()
 * @param {object} opts
 * @param {number} [opts.top=20] - max entries to show at each level
 * @param {number} [opts.depth=1] - how many levels deep to print
 */
export function printReport(node, opts = {}) {
  const { top = 20, depth = 1 } = opts;

  console.log("");
  console.log(
    chalk.bold(node.path) +
      chalk.gray(`  — ${formatSize(node.size)} total, ${node.fileCount ?? 0} files`)
  );
  console.log("");

  printLevel(node, { top, depth, currentDepth: 0, prefix: "" });
  console.log("");
}

function printLevel(node, { top, depth, currentDepth, prefix }) {
  if (!node.children || node.children.length === 0) return;

  const visible = node.children.slice(0, top);
  const hiddenCount = node.children.length - visible.length;
  const hiddenSize = node.children.slice(top).reduce((s, c) => s + c.size, 0);
  const maxSize = node.children[0]?.size ?? 0;

  const nameWidth = Math.min(
    40,
    Math.max(...visible.map((c) => c.name.length), 10)
  );

  for (const child of visible) {
    const ratio = node.size > 0 ? child.size / node.size : 0;
    const color = colorForSize(child.size, maxSize);
    const icon = child.isDirectory ? "📁" : "📄";
    const flag = child.error ? chalk.red(" [unreadable]") : child.isSymlink ? chalk.gray(" [symlink]") : "";
    const name = child.name.length > nameWidth ? child.name.slice(0, nameWidth - 1) + "…" : child.name;

    console.log(
      `${prefix}${color(renderBar(ratio, 18))}  ${padLeft(formatSize(child.size), 9)}  ${padLeft(
        (ratio * 100).toFixed(1) + "%",
        6
      )}  ${icon} ${padRight(name, nameWidth)}${flag}`
    );

    if (child.isDirectory && currentDepth + 1 < depth) {
      printLevel(child, { top, depth, currentDepth: currentDepth + 1, prefix: prefix + "    " });
    }
  }

  if (hiddenCount > 0) {
    console.log(chalk.gray(`${prefix}… ${hiddenCount} more entr${hiddenCount === 1 ? "y" : "ies"} (${formatSize(hiddenSize)})`));
  }
}
