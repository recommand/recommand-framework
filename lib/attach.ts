import type { Hono } from "hono";
import { join } from "node:path";
import { type RecommandApp } from "./app";
import { frameworkLogger } from "./logger";
import { serveStatic } from "hono/bun";
import { existsSync, readdirSync } from "node:fs";

/**
 * Extra API mounts a package can export as `apiMounts`, next to its default
 * server. Each entry is mounted at `/api/<path>` (`/api` for an empty path),
 * so a package can keep serving routes whose URLs predate its ownership of
 * them, for example after routes moved here from another package.
 */
export type ApiMount = {
  path: string;
  server: Hono<any, any, any>;
};

export function apiMountPath(path: string): string {
  return ["api", path].filter(Boolean).join("/");
}

export async function attach(
  app: RecommandApp,
  hono: Hono
): Promise<{ indexOverride: string | null }> {
  frameworkLogger.info(`Loading ${app.name} from ${app.absolutePath}`);
  const appModule = await import(join(app.absolutePath, "index.ts"));
  await appModule.init(app, hono);
  try {
    hono.route(apiMountPath(app.apiMount ?? app.name), appModule.default);
  } catch (e) {
    frameworkLogger.error(`Failed to register api routes for ${app.name}`);
  }

  const apiMounts: ApiMount[] = appModule.apiMounts ?? [];
  for (const mount of apiMounts) {
    try {
      hono.route(apiMountPath(mount.path), mount.server);
    } catch (e) {
      frameworkLogger.error(`Failed to register api mount /${apiMountPath(mount.path)} for ${app.name}`);
    }
  }

  // For each file in the public folder, register a root route
  let indexOverride: string | null = null;
  const publicPath = join(app.absolutePath, "public");
  if (existsSync(publicPath)) {
    const files = readdirSync(publicPath);

    // Check for index.html and set it as the indexOverride
    if (files.includes("index.html")) {
      indexOverride = join(publicPath, "index.html");
    }

    files.forEach((file: string) => {
      hono.get(`/${file}/*`, serveStatic({ root: publicPath }));
    });
  }

  frameworkLogger.info(`${app.name} is loaded`);

  return { indexOverride };
}