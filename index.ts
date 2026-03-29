import "./env";
import { Hono } from "hono";
import dotenv from "dotenv";
import { getApps } from "./lib/app";
import { attach } from "./lib/attach";
import { migrateAllApps } from "./lib/migrate";
import { cors } from "hono/cors";
import { proxy } from "hono/proxy";
import { serveStatic } from "hono/bun";
import fs from "fs/promises";
import path from "path";
import { openAPISpecs } from "hono-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { actionFailure } from "./lib/utils";

const isDev = process.env.NODE_ENV === "development";

const hono = new Hono();

const rootDomain = new URL(process.env.BASE_URL!).hostname.split(".").slice(-2).join(".");
const protocol = new URL(process.env.BASE_URL!).protocol;
hono.use(
  cors({
    origin: [process.env.BASE_URL!, `${protocol}//${rootDomain}`],
    credentials: true,
  })
);

const apps = await getApps();
// Create a framework app object for migrations
const frameworkApp = {
  name: "__recommand_framework",
  absolutePath: __dirname,
};

// Load per-package .env files (override root values)
for (const app of [frameworkApp, ...apps]) {
  const envPath = path.resolve(app.absolutePath, ".env");
  dotenv.config({ path: envPath, override: true });
}

// Run all migrations chronologically across all apps
await migrateAllApps([frameworkApp, ...apps]);

// Attach all apps
let indexOverride: string | null = null;
for (const app of apps.reverse()) { // Attach the apps in reverse order to allow for overriding hono routes
  // Attach the app to the hono instance
  const { indexOverride: appIndexOverride } = await attach(app, hono);
  if (appIndexOverride) {
    indexOverride = appIndexOverride;
  }
}

// For all /api/* routes that have no definition, return a 404
hono.all("/api/*", (c) => {
  return c.json(actionFailure("Not found"), 404);
});

hono.onError((err, c) => {
  console.error(err);
  return c.json(actionFailure(isDev ? err.message : "An error occurred."), 500);
});

hono.get(
  "/openapi",
  openAPISpecs(hono, {
    documentation: {
      info: {
        title: "Recommand API",
        version: "1.0.0",
        description: `Welcome to the Recommand API documentation.`,
      },
      servers: [{ url: process.env.BASE_URL!, description: "Recommand API" }],
      components: {
        securitySchemes: {
          httpBasic: {
            type: "http",
            scheme: "basic",
            description:
              "Basic API key authentication. Create a new API key and secret in the Recommand dashboard.",
          },
        },
      },
      security: [{ httpBasic: [] }],
    },
  })
);

hono.get(
  "/api-reference",
  apiReference({
    theme: "saturn",
    pageTitle: "Recommand API Documentation",
    // @ts-ignore
    spec: { url: "/openapi" },
    generateOperationSlug: (operation) => `${operation.method}${operation.path}`,
    hideClientButton: true,
    authentication: {
      preferredSecurityScheme: "httpBasic",
      securitySchemes: {
        httpBasic: {
          username: "key_xxx (replace with your API key)",
          password: "secret_xxx (replace with your API secret)",
        },
      },
    },
  })
);

// For backwards compatibility, redirect /docs to /api-reference
hono.get("/docs", (c) => {
  return c.redirect("/api-reference");
});

if (isDev) {
  // For all other routes, proxy to the app on port 5173
  hono.all("*", async (c) => {
    // If the indexOverride is set, and the request has no extension (.) and no @, serve the indexOverride
    if (
      indexOverride &&
      !c.req.path.includes(".") &&
      !c.req.path.includes("@")
    ) {
      const indexHtml = await fs.readFile(indexOverride, "utf-8");
      // Add the react refresh script
      const script = `<script type="module">
import RefreshRuntime from "/@react-refresh"
RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => (type) => type
window.__vite_plugin_react_preamble_installed__ = true
</script>`;
      let newIndexHtml = indexHtml.replace("</head>", script + "</head>");

      // Add the module script to the body
      const moduleScript = `<script type="module" src="/src/main.tsx"></script>`;
      newIndexHtml = newIndexHtml.replace("</body>", moduleScript + "</body>");
      return c.html(newIndexHtml);
    }

    const response = await proxy(`http://localhost:5173/${c.req.path}`, {
      ...c.req,
    });

    // Add cache control headers to the response
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");

    return response;
  });
} else {
  // For all other routes, return static files from the dist folder
  const distPath = path.resolve("./app/dist");
  const publicDirFilenames = await fs.readdir(distPath);

  // As the indexOverride does not have the correct script and stylesheet tags, we need to copy those from the index.html in the dist folder
  if (indexOverride) {
    const distIndexHtml = await fs.readFile(
      path.join(distPath, "index.html"),
      "utf-8"
    );
    const overrideIndexHtml = await fs.readFile(indexOverride, "utf-8");
    // Get the <script type="module" ... and <link rel="stylesheet" ... tags
    const distScript = distIndexHtml.match(
      /<script type="module"[^>]*>.*?<\/script>/g
    );
    const distStylesheet = distIndexHtml.match(/<link rel="stylesheet"[^>]*>/g);
    // Add those to the overrideIndexHtml
    const newOverrideIndexHtml = overrideIndexHtml.replace(
      "</head>",
      (distScript?.toString() ?? "") +
        (distStylesheet?.toString() ?? "") +
        "</head>"
    );
    // Write the overrideIndexHtml to the dist folder as index_override.html
    indexOverride = path.join(distPath, "index_override.html");
    await fs.writeFile(indexOverride, newOverrideIndexHtml);
  }

  hono.get(
    "*",
    serveStatic({
      root: "/",
      rewriteRequestPath: (requestPath) => {
        // Normalize the path to prevent directory traversal
        const normalizedPath = path
          .normalize(requestPath)
          .replace(/^(\.\.(\/|\\|$))+/, "");

        // Resolve the full path
        const fullPath = path.join(distPath, normalizedPath);

        // Ensure the resolved path is within the dist directory
        if (!fullPath.startsWith(distPath)) {
          return (
            indexOverride || path.join(process.cwd(), "app/dist/index.html")
          );
        }

        // Check if the file exists in the dist directory
        const relativePath = path.relative(distPath, fullPath);
        if (publicDirFilenames.includes(relativePath.split(path.sep)[0])) {
          return path.join(process.cwd(), "app/dist", normalizedPath);
        }

        // Default to index.html for all other routes
        return indexOverride || path.join(process.cwd(), "app/dist/index.html");
      },
    })
  );
}

const DEFAULT_PORT = 3000;
const MAX_PORT_ATTEMPTS = 10;

function serve(port: number) {
  Bun.serve({
    fetch: hono.fetch,
    idleTimeout: 0,
    port,
    maxRequestBodySize: 500 * 1024 * 1024, // 500MB
  });
  console.log(`Server running on http://localhost:${port}`);
}

if (isDev) {
  let port = DEFAULT_PORT;
  for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
    try {
      serve(port);
      break;
    } catch (e: any) {
      if (e?.code === "EADDRINUSE") {
        console.warn(`Port ${port} is in use, trying ${port + 1}...`);
        port++;
      } else {
        throw e;
      }
    }
  }
} else {
  serve(DEFAULT_PORT);
}
