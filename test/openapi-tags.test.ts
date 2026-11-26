import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import type { OpenApiOptions } from "../lib/openapi";
import { registerOpenApiRoutes } from "../lib/openapi";

const tags = [
  { name: "Notes", description: "Notes in a notebook." },
  { name: "Notebooks", description: "Notebooks that hold notes." },
  { name: "Archive", description: "Notes that were archived." },
];

const servedTags = async (options: Partial<OpenApiOptions> = {}) => {
  const app = new Hono();
  app.get(
    "/notes",
    describeRoute({ operationId: "listNotes", responses: { 200: { description: "ok" } }, tags: ["Notes"] }),
    (c) => c.json([]),
  );
  app.get(
    "/archive",
    describeRoute({ operationId: "listArchivedNotes", responses: { 200: { description: "ok" } }, tags: ["Archive"] }),
    (c) => c.json([]),
  );
  registerOpenApiRoutes(app, { documentation: { info: { title: "Notes", version: "1.0.0" }, tags }, ...options });

  const response = await app.request("/openapi");

  return ((await response.json()) as { tags?: { name: string }[] }).tags;
};

describe("registerOpenApiRoutes", () => {
  test("lists only the declared tags an operation uses, in the declared order", async () => {
    expect(await servedTags()).toEqual([tags[0], tags[2]]);
  });

  test("leaves out a tag whose operations are all excluded", async () => {
    expect(await servedTags({ exclude: [/^\/archive$/] })).toEqual([tags[0]]);
  });
});
