/**
 * Typecheck the framework and every sibling package.
 *
 * The framework's own tsconfig has no path mappings for @core/*, @peppol/* and
 * friends, so running `tsc` there only covers the framework itself. Packages
 * are discovered the same way the app loads them, so a newly added submodule is
 * picked up without touching this script.
 */
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const rootDir = resolve(import.meta.dir, "..", "..");

async function hasTsconfig(dir: string): Promise<boolean> {
  try {
    return (await stat(join(dir, "tsconfig.json"))).isFile();
  } catch {
    return false;
  }
}

const entries = await readdir(rootDir);
const packages: string[] = [];

for (const entry of entries) {
  const fullPath = join(rootDir, entry);
  try {
    if (!(await stat(fullPath)).isDirectory()) continue;
  } catch {
    continue;
  }
  if (await hasTsconfig(fullPath)) packages.push(entry);
}

packages.sort();

let failed = false;

for (const pkg of packages) {
  const proc = Bun.spawn(
    ["bunx", "tsc", "--noEmit", "-p", join(rootDir, pkg, "tsconfig.json")],
    { stdout: "inherit", stderr: "inherit" }
  );
  const code = await proc.exited;
  if (code !== 0) {
    console.error(`\ntypecheck failed: ${pkg}`);
    failed = true;
  } else {
    console.log(`typecheck ok: ${pkg}`);
  }
}

if (failed) process.exit(1);
