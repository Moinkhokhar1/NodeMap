# NodeMap

A small, colorful disk usage visualizer for the terminal — a lightweight
reimagining of `ncdu`. Read-only: it never deletes or modifies anything.

## Install

```bash
git clone <your-repo-url>
cd diskviz
npm install
npm link      # installs the `diskviz` command globally
```

## Usage

Static bar-chart report of the current directory:

```bash
diskviz
```

Scan a specific path, printing 2 levels deep, top 15 entries per level:

```bash
diskviz ~/Downloads --depth 2 --top 15
```

Interactive mode — navigate with arrow keys, like `ncdu`:

```bash
diskviz ~ --interactive
```

**Interactive controls:**
| Key | Action |
|---|---|
| ↑ / ↓ (or j/k) | Move selection |
| → / Enter (or l) | Open selected folder |
| ← / Backspace (or h) | Go back up |
| q / Esc / Ctrl-C | Quit |

## Options

| Flag | Description |
|---|---|
| `-i, --interactive` | Navigate interactively instead of printing a static report |
| `-d, --depth <n>` | How many levels deep to print (static mode only), default `1` |
| `-t, --top <n>` | How many entries to show per level (static mode only), default `20` |

## Notes

- Symlinks are not followed (avoids infinite loops and double-counting).
- Folders you don't have permission to read are shown as `[unreadable]`
  and excluded from totals rather than crashing the scan.
- Large trees are scanned with a bounded concurrency pool so it won't try
  to open thousands of file descriptors at once.

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you'd like to change.

---

## 📄 License

© 2026 moinworksonlocalhost. All rights reserved.

This project is **not open source**. No part of this codebase may be copied, modified, distributed, or used without explicit written permission from the author.

---

<div align="center">

**Built with ❤️ by [Moinworksonlocalhost](https://moinworksonlocalhost.onrender.com/)**

*Making payments accessible everywhere — even without a single bar of signal.*

</div>
