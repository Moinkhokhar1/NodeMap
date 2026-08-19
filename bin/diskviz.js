#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import path from "node:path";
import os from "node:os";
import { access } from "node:fs/promises";
import { scan } from "../src/scan.js";
import { printReport } from "../src/tree.js";
import { runInteractive } from "../src/interactive.js";

// Never fail silently — print anything that slips through.
process.on("uncaughtException", (err) => {
  console.error(chalk.red("✖ Unexpected error:"), err.message);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  console.error(chalk.red("✖ Unexpected error:"), err instanceof Error ? err.message : err);
  process.exit(1);
});

// Shells other than bash/zsh (notably PowerShell and cmd.exe on Windows)
// don't expand a leading "~" in an argument before it reaches us, so we
// expand it ourselves.
function expandHome(p) {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

const program = new Command();

program
  .name("diskviz")
  .description("Visualize what's using your disk space — static bar-chart report or interactive navigation.")
  .version("1.0.0")
  .argument("[path]", "directory to scan", ".")
  .option("-i, --interactive", "navigate interactively (arrow keys), like ncdu")
  .option("-d, --depth <n>", "how many levels deep to print in the static report", "1")
  .option("-t, --top <n>", "how many entries to show per level in the static report", "20")
  .action(async (targetPath, opts) => {
    const resolved = path.resolve(expandHome(targetPath));

    try {
      await access(resolved);
    } catch {
      console.error(chalk.red(`✖ Path not found or inaccessible: ${resolved}`));
      process.exitCode = 1;
      return;
    }

    if (opts.interactive) {
      await runInteractive(resolved);
      return;
    }

    const errors = [];
    let scannedCount = 0;
    console.error(chalk.gray(`Scanning ${resolved} ...`));

    const progressTimer = setInterval(() => {
      process.stderr.write(chalk.gray(`\r  ${scannedCount.toLocaleString()} items scanned...`));
    }, 400);

    const depth = parseInt(opts.depth, 10);
    const top = parseInt(opts.top, 10);

    const result = await scan(resolved, {
      maxDepth: depth,
      onError: (e) => errors.push(e),
      onProgress: () => scannedCount++,
    });

    clearInterval(progressTimer);
    process.stderr.write("\x1b[2K\r");

    printReport(result, { top, depth });

    if (errors.length > 0) {
      console.log(chalk.yellow(`⚠ ${errors.length} item(s) skipped (permission denied or unreadable).`));
      console.log("");
    }

    console.log(chalk.gray("Tip: run with --interactive (-i) to browse folders with arrow keys."));
  });

await program.parseAsync(process.argv);