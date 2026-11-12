import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { actionFailure } from "./utils";

/**
 * Answers credentialed cross-origin requests from the app's own origin only.
 * Any other origin, including a sibling on the same site, gets no CORS headers,
 * so a browser neither sends it a preflighted request nor lets it read a response.
 */
export const allowOwnOrigin = (baseUrl: string): MiddlewareHandler =>
  cors({ credentials: true, origin: [new URL(baseUrl).origin] });

/**
 * Rejects state-changing requests that carry the session cookie but were not
 * made by the app itself.
 *
 * `SameSite=Lax` keeps the cookie off requests from other sites, but not off
 * requests from another subdomain of the same site, so a page there could
 * submit a form to any route that does not insist on a JSON body. Browsers say
 * where a request comes from in `Sec-Fetch-Site`; `Origin` is the fallback for
 * those that do not send it.
 *
 * Requests without the cookie pass: there is no ambient credential to borrow.
 * That covers API clients, incoming webhooks and OAuth clients, none of which
 * have the cookie. A request that carries the cookie is checked even when it
 * also sends `Authorization`, as the session cookie is the credential that
 * authenticates it.
 */
export const rejectCrossSiteRequests = ({
  baseUrl,
  sessionCookie,
}: {
  baseUrl: string;
  sessionCookie: string;
}): MiddlewareHandler => {
  const check = csrf({
    origin: new URL(baseUrl).origin,
    secFetchSite: ["none", "same-origin"],
  });

  return async (c, next) => {
    if (getCookie(c, sessionCookie) === undefined) {
      return next();
    }

    try {
      // Only the check runs here; the route runs below, outside the `try`, so
      // its own errors reach the error handler untouched.
      await check(c, async () => {});
    } catch (error) {
      if (error instanceof HTTPException && error.status === 403) {
        return c.json(actionFailure("Cross-site requests are not allowed."), 403);
      }

      throw error;
    }

    return next();
  };
};
