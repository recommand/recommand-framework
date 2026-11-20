import type { MiddlewareHandler } from "hono";

/**
 * Tells browsers to take every response's `Content-Type` as given rather than guess it from the
 * bytes, so a file someone else sent, or an error body, is never read as HTML or a script
 * (Fetch, section 3.6).
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Content-Type-Options#nosniff
 * @see https://fetch.spec.whatwg.org/#x-content-type-options-header
 */
export const forbidContentSniffing = (): MiddlewareHandler => async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
};
