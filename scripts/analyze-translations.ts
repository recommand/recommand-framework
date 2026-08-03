#!/usr/bin/env bun

import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const packagesDir = resolve(import.meta.dir, "../..");
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);

function parseCsv(content: string): Map<string, string> {
  const translations = new Map<string, string>();

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    let separator = -1;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === "\\") i++;
      else if (line[i] === ",") {
        separator = i;
        break;
      }
    }
    if (separator < 0) continue;

    const unescape = (value: string) =>
      value.replace(/\\,/g, ",").replace(/\\\\/g, "\\");
    translations.set(
      unescape(line.slice(0, separator)),
      unescape(line.slice(separator + 1)),
    );
  }

  return translations;
}

function skipString(source: string, start: number, quote: string): number {
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === "\\") i++;
    else if (source[i] === quote) return i + 1;
  }
  return source.length;
}

function skipComment(source: string, start: number): number {
  if (source[start + 1] === "/") {
    const end = source.indexOf("\n", start + 2);
    return end < 0 ? source.length : end + 1;
  }
  const end = source.indexOf("*/", start + 2);
  return end < 0 ? source.length : end + 2;
}

function expressionEnd(source: string, start: number): number {
  let depth = 1;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (char === "'" || char === '"') i = skipString(source, i, char) - 1;
    else if (char === "/" && ["/", "*"].includes(source[i + 1])) {
      i = skipComment(source, i) - 1;
    } else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return i;
  }
  return source.length;
}

function templateKey(source: string, start: number): string | undefined {
  let key = "";
  let placeholder = 0;

  for (let i = start; i < source.length; i++) {
    if (source[i] === "\\" && i + 1 < source.length) {
      const escaped = source[++i];
      key += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
    } else if (source[i] === "`") {
      return key;
    } else if (source[i] === "$" && source[i + 1] === "{") {
      key += `{${placeholder++}}`;
      i = expressionEnd(source, i + 2);
    } else {
      key += source[i];
    }
  }
}

function sourceTerms(source: string): Set<string> {
  const terms = new Set<string>();
  const cleanSource = withoutComments(source);

  for (const match of cleanSource.matchAll(/\bt\s*`/g)) {
    const start = (match.index ?? 0) + match[0].length;
    const key = templateKey(cleanSource, start);
    if (key) terms.add(key);
  }

  for (const match of cleanSource.matchAll(/\bt\s*\(\s*(["'])((?:\\.|(?!\1).)*)\1\s*\)/g)) {
    const key = match[2].replace(/\\([\\"'])/g, "$1");
    if (key) terms.add(key);
  }

  return terms;
}

function withoutComments(source: string): string {
  const result = source.split("");

  for (let i = 0; i < source.length; i++) {
    if (source[i] === "'" || source[i] === '"') {
      const end = skipString(source, i, source[i]);
      const isTranslationCall = /\bt\s*\(\s*$/.test(source.slice(Math.max(0, i - 20), i));
      if (!isTranslationCall) {
        for (let j = i; j < end; j++) {
          if (result[j] !== "\n") result[j] = " ";
        }
      }
      i = end - 1;
    } else if (source[i] === "`") {
      i = skipString(source, i, source[i]) - 1;
    } else if (source[i] === "/" && ["/", "*"].includes(source[i + 1])) {
      const end = skipComment(source, i);
      for (let j = i; j < end; j++) {
        if (result[j] !== "\n") result[j] = " ";
      }
      i = end - 1;
    }
  }

  return result.join("");
}

function sourceWithoutComments(source: string): string {
  const result = source.split("");

  for (let i = 0; i < source.length; i++) {
    if (["'", '"', "`"].includes(source[i])) {
      i = skipString(source, i, source[i]) - 1;
    } else if (source[i] === "/" && ["/", "*"].includes(source[i + 1])) {
      const end = skipComment(source, i);
      for (let j = i; j < end; j++) {
        if (result[j] !== "\n") result[j] = " ";
      }
      i = end - 1;
    }
  }

  return result.join("");
}

function containsLiteral(source: string, term: string): boolean {
  const singleQuoted = `'${term
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")}'`;
  const template = `\`${term
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")}\``;
  return source.includes(JSON.stringify(term)) || source.includes(singleQuoted) || source.includes(template);
}

async function filesIn(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (
      ["node_modules", ".git", "translations", "dist", "build", "coverage"].includes(
        entry.name,
      )
    ) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesIn(path)));
    else if (sourceExtensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

type PackageAnalysis = {
  name: string;
  path: string;
  source: string;
  terms: Set<string>;
  languages: Map<string, Map<string, string>>;
};

async function analyzePackage(name: string): Promise<PackageAnalysis> {
  const path = join(packagesDir, name);
  const terms = new Set<string>();
  let source = "";
  for (const file of await filesIn(path)) {
    const fileSource = await readFile(file, "utf8");
    source += `${sourceWithoutComments(fileSource)}\n`;
    for (const term of sourceTerms(fileSource)) terms.add(term);
  }

  const languages = new Map<string, Map<string, string>>();
  const translationsDir = join(path, "translations");
  try {
    for (const file of await readdir(translationsDir)) {
      if (extname(file) !== ".csv") continue;
      languages.set(
        file.slice(0, -4),
        parseCsv(await readFile(join(translationsDir, file), "utf8")),
      );
    }
  } catch {
    // A package does not have to contain translations.
  }

  return { name, path, source, terms, languages };
}

const packageNames: string[] = [];
for (const entry of await readdir(packagesDir)) {
  const path = join(packagesDir, entry);
  if ((await stat(path)).isDirectory()) packageNames.push(entry);
}

const packages = await Promise.all(packageNames.sort().map(analyzePackage));
const languages = [
  ...new Set(packages.flatMap((pkg) => [...pkg.languages.keys()])),
].sort();
console.log("\nTranslation overview");
console.log(
  "Coverage uses static translation calls; exact CSV-key literals still count as present.\n",
);

for (const pkg of packages) {
  console.log(`━━ ${pkg.name} ━━`);
  console.log(`${pkg.terms.size} terms found in ${relative(packagesDir, pkg.path)}`);
  if (pkg.terms.size === 0 && pkg.languages.size === 0) {
    console.log("  No static translation terms or translation files\n");
    continue;
  }

  const missingByTerm = new Map<string, string[]>();
  for (const language of languages) {
    const translations = pkg.languages.get(language) ?? new Map();
    const missing = [...pkg.terms].filter((term) => !translations.get(term)).sort();
    const translated = pkg.terms.size - missing.length;
    const percentage = pkg.terms.size
      ? ((translated / pkg.terms.size) * 100).toFixed(1)
      : "100.0";
    const noFile = pkg.languages.has(language) ? "" : "  no file";
    console.log(
      `  ${language.padEnd(5)} ${percentage.padStart(6)}%  (${translated}/${pkg.terms.size})${noFile}`,
    );
    for (const term of missing) {
      missingByTerm.set(term, [...(missingByTerm.get(term) ?? []), language]);
    }
  }
  if (missingByTerm.size) {
    console.log(`  Missing translations (${missingByTerm.size}):`);
    for (const [term, languages] of [...missingByTerm].sort()) {
      console.log(`    - ${term}  [${languages.join(", ")}]`);
    }
  }

  const translatedTerms = new Set(
    [...pkg.languages.values()].flatMap((translations) => [...translations.keys()]),
  );
  const unused = [...translatedTerms]
    .filter((term) => !pkg.terms.has(term) && !containsLiteral(pkg.source, term))
    .sort();
  if (unused.length) {
    console.log(`  Not found in this package (${unused.length}):`);
    for (const term of unused) {
      const usedBy = packages
        .filter(
          (owner) =>
            owner !== pkg &&
            (owner.terms.has(term) || containsLiteral(owner.source, term)),
        )
        .map((owner) => owner.name);
      const location = usedBy.length ? `  → used by ${usedBy.join(", ")}` : "";
      const values = [...pkg.languages]
        .sort()
        .map(([language, translations]) => `${language}: ${translations.get(term) ?? "—"}`)
        .join(" | ");
      console.log(`    - ${term}${location}`);
      console.log(`      ${values}`);
    }
  }
  console.log();
}
