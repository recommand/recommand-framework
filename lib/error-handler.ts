import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { actionFailure } from "./utils";

/**
 * Turns an error that escaped a route into a response.
 *
 * An `HTTPException` with a 4xx status is the caller's mistake, such as a body
 * that is not valid JSON, so it keeps its status and message. Anything else is
 * a server error: it is logged and answered with a 500 whose message is only
 * shown in development.
 */
export function createErrorHandler({ isDev }: { isDev: boolean }) {
  return (err: Error, c: Context) => {
    if (err instanceof HTTPException && err.status >= 400 && err.status < 500) {
      return c.json(actionFailure(err.message), err.status as ContentfulStatusCode);
    }
    console.error(err);
    return c.json(actionFailure(isDev ? err.message : "An error occurred."), 500);
  };
}
