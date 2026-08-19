import chalk from "chalk";
import path from "node:path";
import { scanChildren } from "./scan.js";
import { formatSize, colorForSize, renderBar, padRight, padLeft } from "./render.js";

const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR = "\x1b[2J\x1b[H";

function clampName(name, width) {
  return name.length > width ? name.slice(0, width - 1) + "…" : name;
}

/**
 * Run the interactive navigator starting at `rootPath`.
 * Read-only: this tool never deletes or modifies anything on disk.
 * @param {string} rootPath
 */
export async function runInteractive(rootPath) {
  const stdin = process.stdin;
  const stdout = process.stdout;

  if (!stdin.isTTY) {
    console.error("Interactive mode requires a real terminal (TTY).");
    process.exit(1);
  }

  // Stack of { dirPath, entries, selected, scroll, totalSize }
  const stack = [];
  let loadingMessage = "";

  async function loadDir(dirPath) {
    loadingMessage = `Scanning ${dirPath} ...`;
    render();
    const errors = [];
    const entries = await scanChildren(dirPath, (e) => errors.push(e));
    const totalSize = entries.reduce((s, e) => s + e.size, 0);
    loadingMessage = "";
    return { dirPath, entries, selected: 0, scroll: 0, totalSize, errorCount: errors.length };
  }

  function currentFrame() {
    return stack[stack.length - 1];
  }

  function render() {
    const rows = stdout.rows || 24;
    const cols = stdout.columns || 80;
    const listHeight = rows - 5;

    let out = CLEAR;
    const frame = currentFrame();

    if (loadingMessage) {
      out += chalk.gray(loadingMessage) + "\n";
      stdout.write(out);
      return;
    }

    out += chalk.bold(frame.dirPath) + chalk.gray(`  — ${formatSize(frame.totalSize)}\n`);
    if (frame.errorCount) {
      out += chalk.yellow(`  ${frame.errorCount} item(s) skipped (permission denied)\n`);
    } else {
      out += "\n";
    }
    out += chalk.gray("─".repeat(Math.min(cols, 100))) + "\n";

    if (frame.entries.length === 0) {
      out += chalk.gray("  (empty directory)\n");
    }

    // keep selection in view
    if (frame.selected < frame.scroll) frame.scroll = frame.selected;
    if (frame.selected >= frame.scroll + listHeight) frame.scroll = frame.selected - listHeight + 1;

    const maxSize = frame.entries[0]?.size ?? 0;
    const visible = frame.entries.slice(frame.scroll, frame.scroll + listHeight);

    visible.forEach((entry, i) => {
      const idx = frame.scroll + i;
      const isSelected = idx === frame.selected;
      const ratio = frame.totalSize > 0 ? entry.size / frame.totalSize : 0;
      const color = colorForSize(entry.size, maxSize);
      const icon = entry.isDirectory ? "📁" : "📄";
      const nameWidth = Math.max(10, cols - 45);
      const name = clampName(entry.name, nameWidth);
      const flag = entry.error ? chalk.red(" [!]") : entry.isSymlink ? chalk.gray(" [link]") : "";

      const line = `${color(renderBar(ratio, 16))}  ${padLeft(formatSize(entry.size), 9)}  ${padLeft(
        (ratio * 100).toFixed(1) + "%",
        6
      )}  ${icon} ${padRight(name, nameWidth)}${flag}`;

      out += (isSelected ? chalk.inverse(" " + line + " ") : "  " + line) + "\n";
    });

    out += chalk.gray("─".repeat(Math.min(cols, 100))) + "\n";
    out += chalk.gray(
      "↑/↓ move   →/enter open   ←/backspace up   q quit" +
        (stack.length > 1 ? `   (depth ${stack.length})` : "")
    );

    stdout.write(out);
  }

  async function open() {
    const frame = currentFrame();
    const entry = frame.entries[frame.selected];
    if (!entry || !entry.isDirectory || entry.error) return;
    const next = await loadDir(entry.path);
    stack.push(next);
    render();
  }

  function up() {
    if (stack.length > 1) {
      stack.pop();
      render();
    }
  }

  function move(delta) {
    const frame = currentFrame();
    if (frame.entries.length === 0) return;
    frame.selected = Math.max(0, Math.min(frame.entries.length - 1, frame.selected + delta));
    render();
  }

  function cleanup() {
    stdin.setRawMode(false);
    stdin.pause();
    stdout.write(SHOW_CURSOR);
    stdout.write(CLEAR);
  }

  stack.push(await loadDir(path.resolve(rootPath)));
  stdout.write(HIDE_CURSOR);
  render();

  return new Promise((resolve) => {
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    stdin.on("data", async (key) => {
      switch (key) {
        case "\u0003": // Ctrl-C
        case "q":
        case "\u001b": // Esc
          cleanup();
          resolve();
          process.exit(0);
          break;
        case "\u001b[A": // Up
        case "k":
          move(-1);
          break;
        case "\u001b[B": // Down
        case "j":
          move(1);
          break;
        case "\u001b[C": // Right
        case "\r": // Enter
        case "l":
          await open();
          break;
        case "\u001b[D": // Left
        case "\u007f": // Backspace
        case "h":
          up();
          break;
        default:
          break;
      }
    });
  });
}
