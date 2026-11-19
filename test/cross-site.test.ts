import { expect, test } from "bun:test";
import { Hono } from "hono";
import { allowOwnOrigin, rejectCrossSiteRequests } from "../lib/cross-site";

const baseUrl = "https://app.example.com";
const sibling = "https://www.example.com";
const session = "session=signed.value";

const app = () => {
  const hono = new Hono();
  hono.use(allowOwnOrigin(baseUrl));
  hono.use(rejectCrossSiteRequests({ baseUrl, sessionCookie: "session" }));
  hono.post("/auth/logout", (c) => c.json({ success: true }));
  hono.get("/auth/me", (c) => c.json({ success: true }));
  hono.post("/internal/webhook", (c) => c.json({ success: true }));

  return hono;
};

const formPost = (path: string, headers: Record<string, string>) =>
  app().request(`${baseUrl}${path}`, {
    body: new URLSearchParams({ confirm: "yes" }),
    headers,
    method: "POST",
  });

test("a form submitted from another origin with the session cookie is rejected", async () => {
  const requests: Record<string, string>[] = [
    { cookie: session, origin: sibling, "sec-fetch-site": "same-site" },
    { cookie: session, origin: "https://attacker.test", "sec-fetch-site": "cross-site" },
    { cookie: session, origin: sibling },
    { cookie: session },
  ];
  for (const headers of requests) {
    const response = await formPost("/auth/logout", headers);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      errors: { root: ["Cross-site requests are not allowed."] },
    });
  }
});

test("a form submitted by the app itself passes", async () => {
  const requests: Record<string, string>[] = [
    { cookie: session, origin: baseUrl, "sec-fetch-site": "same-origin" },
    { cookie: session, "sec-fetch-site": "none" },
    { cookie: session, origin: baseUrl },
  ];
  for (const headers of requests) {
    const response = await formPost("/auth/logout", headers);

    expect(response.status).toBe(200);
  }
});

test("a request authorized by header from another origin passes", async () => {
  const response = await formPost("/auth/logout", {
    authorization: "Basic a2V5X3h4eDpzZWNyZXRfeHh4",
    origin: "https://client.test",
    "sec-fetch-site": "cross-site",
  });

  expect(response.status).toBe(200);
});

test("a request authorized by header is still checked when the session cookie authenticates it", async () => {
  const response = await formPost("/auth/logout", {
    authorization: "Basic a2V5X3h4eDpzZWNyZXRfeHh4",
    cookie: session,
    origin: sibling,
    "sec-fetch-site": "same-site",
  });

  expect(response.status).toBe(403);
});

test("an incoming webhook passes", async () => {
  const response = await app().request(`${baseUrl}/internal/webhook`, {
    body: "{}",
    headers: { "content-type": "application/json", "x-signature": "abc" },
    method: "POST",
  });

  expect(response.status).toBe(200);
});

test("a read from another origin with the session cookie passes", async () => {
  const response = await app().request(`${baseUrl}/auth/me`, {
    headers: { cookie: session, origin: sibling, "sec-fetch-site": "same-site" },
  });

  expect(response.status).toBe(200);
});

test("only the app's own origin may make credentialed cross-origin requests", async () => {
  const own = await app().request(`${baseUrl}/auth/me`, { headers: { origin: baseUrl } });
  expect(own.headers.get("access-control-allow-origin")).toBe(baseUrl);
  expect(own.headers.get("access-control-allow-credentials")).toBe("true");

  for (const origin of ["https://example.com", sibling]) {
    const preflight = await app().request(`${baseUrl}/auth/logout`, {
      headers: {
        "access-control-request-method": "POST",
        origin,
      },
      method: "OPTIONS",
    });

    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
  }
});
