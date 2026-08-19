import { readdir, lstat, stat } from "node:fs/promises";
import path from "node:path";

const CONCURRENCY = 64;

/**
 * A tiny concurrency-limited task runner so we don't try to open thousands
 * of file descriptors at once on large trees.
 *
 * IMPORTANT: this must only ever wrap the actual fs syscalls (stat/readdir),
 * never the recursive scan() call itself. If a parent folder's scan() is
 * run inside a limited slot and then has to wait on child folders that also
 * need a slot from the same pool, you can deadlock: every slot ends up held
 * by a parent that's blocked on a child that never gets to run because
 * there's no room left. Wrapping only the leaf I/O calls avoids this —
 * recursion fans out freely, and only the actual syscalls are throttled.
 */
class Pool {
  constructor(limit) {
    this.limit = limit;
    this.active = 0;
    this.queue = [];
  }

  run(fn) {
    return new Promise((resolve, reject) => {
      const task = () => {
        this.active++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            this.active--;
            this._next();
          });
      };
      this.queue.push(task);
      this._next();
    });
  }

  _next() {
    if (this.active >= this.limit) return;
    const task = this.queue.shift();
    if (task) task();
  }
}

const pool = new Pool(CONCURRENCY);

/**
 * Recursively compute size info for a directory or file.
 * Directories: { name, path, isDirectory: true, size, fileCount, children: [...] }
 * Files:       { name, path, isDirectory: false, size }
 *
 * @param {string} targetPath
 * @param {object} opts
 * @param {number} [opts.maxDepth] - stop descending past this depth (children still sized, just not recursed into for the tree). Infinity by default.
 * @param {number} [opts.depth] - internal, current depth
 * @param {(err: {path: string, message: string}) => void} [opts.onError] - called for unreadable entries, scan continues
 * @param {() => void} [opts.onProgress] - called once per file/dir visited, for progress reporting on large trees
 * @returns {Promise<object>}
 */
export async function scan(targetPath, opts = {}) {
  const { maxDepth = Infinity, depth = 0, onError = () => {}, onProgress = () => {} } = opts;

  let stats;
  try {
    // At the root (depth 0), follow symlinks/junctions — on Windows,
    // folders like Desktop/Documents are often NTFS junctions pointing
    // into OneDrive, and lstat reports those as symlinks. If we bailed
    // out here, scanning "Desktop" directly would silently report 0 B.
    // Deeper in the tree we still use lstat and skip symlinks, to avoid
    // infinite loops and double-counting.
    stats = await pool.run(() => (depth === 0 ? stat(targetPath) : lstat(targetPath)));
  } catch (err) {
    onError({ path: targetPath, message: err.message });
    onProgress();
    return { name: path.basename(targetPath), path: targetPath, isDirectory: false, size: 0, error: true };
  }

  if (stats.isSymbolicLink()) {
    // Don't follow symlinks — avoids infinite loops and double-counting.
    onProgress();
    return { name: path.basename(targetPath), path: targetPath, isDirectory: false, size: 0, isSymlink: true };
  }

  if (!stats.isDirectory()) {
    onProgress();
    return { name: path.basename(targetPath), path: targetPath, isDirectory: false, size: stats.size };
  }

  let entries;
  try {
    entries = await pool.run(() => readdir(targetPath, { withFileTypes: true }));
  } catch (err) {
    onError({ path: targetPath, message: err.message });
    onProgress();
    return {
      name: path.basename(targetPath) || targetPath,
      path: targetPath,
      isDirectory: true,
      size: 0,
      fileCount: 0,
      children: [],
      error: true,
    };
  }

  // Recursion itself is NOT routed through the pool — see the class
  // comment above for why. The pool only bounds the concurrent syscalls
  // that happen inside each of these calls.
  const childResults = await Promise.all(
    entries.map((entry) =>
      scan(path.join(targetPath, entry.name), { maxDepth, depth: depth + 1, onError, onProgress })
    )
  );

  const size = childResults.reduce((sum, c) => sum + c.size, 0);
  const fileCount = childResults.reduce(
    (sum, c) => sum + (c.isDirectory ? c.fileCount ?? 0 : 1),
    0
  );

  childResults.sort((a, b) => b.size - a.size);

  onProgress();

  return {
    name: path.basename(targetPath) || targetPath,
    path: targetPath,
    isDirectory: true,
    size,
    fileCount,
    children: depth < maxDepth ? childResults : undefined,
  };
}

/**
 * Lazily scan just the immediate children of a directory, computing full
 * recursive size for each child. Used by interactive mode so drilling into
 * a folder doesn't require re-scanning the whole tree from the root.
 * @param {string} dirPath
 * @param {(err: {path: string, message: string}) => void} [onError]
 * @param {() => void} [onProgress]
 */
export async function scanChildren(dirPath, onError = () => {}, onProgress = () => {}) {
  // Resolve the directory itself through symlinks/junctions first (see the
  // comment in scan() about Windows/OneDrive junctions), then list it.
  try {
    const s = await pool.run(() => stat(dirPath));
    if (!s.isDirectory()) {
      onError({ path: dirPath, message: "Not a directory" });
      return [];
    }
  } catch (err) {
    onError({ path: dirPath, message: err.message });
    return [];
  }

  let entries;
  try {
    entries = await pool.run(() => readdir(dirPath, { withFileTypes: true }));
  } catch (err) {
    onError({ path: dirPath, message: err.message });
    return [];
  }

  const results = await Promise.all(
    entries.map((entry) => scan(path.join(dirPath, entry.name), { maxDepth: 0, onError, onProgress }))
  );

  results.sort((a, b) => b.size - a.size);
  return results;
}