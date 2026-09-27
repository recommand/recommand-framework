import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { apiMountPath, attach } from "../lib/attach";

// A package serves its default server under /api/<name>, and can keep serving
// routes at older URLs through extra mounts it exports as `apiMounts`.

let directory: string;

beforeAll(async () => {
  // Inside the package, so the example module resolves hono like a package does.
  directory = await mkdtemp(join(import.meta.dir, ".attach-test-"));
  await writeFile(
    join(directory, "index.ts"),
    `import { Hono } from "hono";
const server = new Hono();
server.get("/own", (c) => c.text("own"));
const legacy = new Hono();
legacy.get("/v1/:teamId/legacy", (c) => c.text("legacy " + c.req.param("teamId")));
export const apiMounts = [{ path: "", server: legacy }, { path: "other", server: legacy }];
export async function init() {}
export default server;
`
  );
});

afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("attach", () => {
  test("mounts the default server and every extra mount", async () => {
    const hono = new Hono();
    await attach({ name: "example", absolutePath: directory }, hono);

    expect(await (await hono.request("/api/example/own")).text()).toBe("own");
    expect(await (await hono.request("/api/v1/team_1/legacy")).text()).toBe("legacy team_1");
    expect(await (await hono.request("/api/other/v1/team_2/legacy")).text()).toBe("legacy team_2");
  });

  test("builds mount paths under /api", () => {
    expect(apiMountPath("")).toBe("api");
    expect(apiMountPath("admin")).toBe("api/admin");
  });
});
