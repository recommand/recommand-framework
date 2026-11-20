import { expect, test } from "bun:test";
import { Hono } from "hono";
import { forbidContentSniffing } from "../lib/content-type-options";

const app = () => {
  const hono = new Hono();
  hono.use(forbidContentSniffing());
  hono.get("/document", (c) => c.body("<p>Invoice</p>", 200, { "Content-Type": "application/octet-stream" }));
  hono.get("/failure", () => {
    throw new Error("Boom");
  });
  hono.onError((_error, c) => c.json({ success: false }, 500));

  return hono;
};

test("every response tells the browser not to guess its content type", async () => {
  for (const path of ["/document", "/failure", "/missing"]) {
    const response = await app().request(path);

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  }
});
