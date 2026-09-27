import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { attachApps } from "../lib/attach";

const directories: string[] = [];
async function fixture() {
  const directory = await mkdtemp(join(import.meta.dir, ".startup-"));
  directories.push(directory);
  return async (name: string, source: string) => {
    const absolutePath = join(directory, name);
    await mkdir(absolutePath);
    await writeFile(join(absolutePath, "index.ts"), `
      import { Hono } from "hono";
      export default new Hono().get("/shared", (c) => c.text("${name}"));
      ${source}
    `);
    return { name, absolutePath, apiMount: "" };
  };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

test("background work waits for a later package's slow initialization", async () => {
  const app = await fixture();
  const worker = await app("worker", `
    export let started = false;
    export async function init() {}
    export function start() { started = true; }
  `);
  const policy = await app("policy", `
    export let release;
    export let entered;
    export const initializing = new Promise(resolve => { entered = resolve; });
    const ready = new Promise(resolve => { release = resolve; });
    export async function init() { entered(); await ready; }
  `);
  const workerModule = await import(join(worker.absolutePath, "index.ts"));
  const policyModule = await import(join(policy.absolutePath, "index.ts"));
  const loading = attachApps([worker, policy], new Hono());
  await policyModule.initializing;
  await Bun.sleep(20);
  expect(workerModule.started).toBe(false);
  policyModule.release();
  await loading;
  expect(workerModule.started).toBe(true);
});

test("failed initialization prevents every background worker from starting", async () => {
  const app = await fixture();
  const worker = await app("worker", `
    export let started = false;
    export async function init() {}
    export function start() { started = true; }
  `);
  const broken = await app("broken", `
    export async function init() { throw new Error("policy unavailable"); }
  `);
  const workerModule = await import(join(worker.absolutePath, "index.ts"));
  await expect(attachApps([worker, broken], new Hono())).rejects.toThrow("policy unavailable");
  expect(workerModule.started).toBe(false);
});

test("packages without a start hook still load and keep route precedence", async () => {
  const app = await fixture();
  const first = await app("first", "export async function init() {}");
  const second = await app("second", "export async function init() {}");
  const hono = new Hono();
  await attachApps([first, second], hono);
  expect(await (await hono.request("/api/shared")).text()).toBe("first");
});

test("an asynchronous start failure propagates to the server entry point", async () => {
  const app = await fixture();
  const broken = await app("broken", `
    export async function init() {}
    export async function start() { throw new Error("worker unavailable"); }
  `);
  await expect(attachApps([broken], new Hono())).rejects.toThrow("worker unavailable");
});
