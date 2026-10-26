import { expect, spyOn, test } from "bun:test";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import { createErrorHandler } from "../lib/error-handler";

function app(isDev = false) {
  const hono = new Hono();
  hono.post("/json", validator("json", (value) => value), (c) => c.json(c.req.valid("json")));
  hono.get("/teapot", () => {
    throw new HTTPException(418, { message: "No coffee here" });
  });
  hono.get("/unavailable", () => {
    throw new HTTPException(503, { message: "Upstream is down" });
  });
  hono.get("/crash", () => {
    throw new Error("database password rejected");
  });
  hono.onError(createErrorHandler({ isDev }));
  return hono;
}

test("a body that is not valid JSON is a 400 with the parser's message", async () => {
  for (const body of ["", "{\"invoiceNumber\":"]) {
    const response = await app().request("/json", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      errors: { root: ["Malformed JSON in request body"] },
    });
  }
});

test("a client error keeps its own status and message", async () => {
  const response = await app().request("/teapot");

  expect(response.status).toBe(418);
  expect(await response.json()).toEqual({
    success: false,
    errors: { root: ["No coffee here"] },
  });
});

test("a server error is a 500 that hides its message outside development", async () => {
  const log = spyOn(console, "error").mockImplementation(() => {});
  try {
    for (const path of ["/crash", "/unavailable"]) {
      const response = await app().request(path);

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        success: false,
        errors: { root: ["An error occurred."] },
      });
    }
    expect(log).toHaveBeenCalledTimes(2);
  } finally {
    log.mockRestore();
  }
});

test("a server error shows its message in development", async () => {
  const log = spyOn(console, "error").mockImplementation(() => {});
  try {
    const response = await app(true).request("/crash");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      errors: { root: ["database password rejected"] },
    });
  } finally {
    log.mockRestore();
  }
});
