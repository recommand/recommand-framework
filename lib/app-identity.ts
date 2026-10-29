import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Who the app presents itself as. A deployment sets it under `recommand.app`
 * in its root package.json, next to `recommand.theme`:
 *
 * ```json
 * "recommand": {
 *   "app": {
 *     "name": "Acme",
 *     "favicon": "@acme/brand/favicon.svg",
 *     "logo": "@acme/brand/logo.svg",
 *     "logoDark": "@acme/brand/logo-white.svg",
 *     "sidebarLogo": "@acme/brand/logo-white.svg",
 *     "supportEmail": "support@acme.example",
 *     "website": "https://acme.example",
 *     "emailLogoUrl": "https://app.acme.example/email-logo.png",
 *     "emailAccent": "#0E3B2C",
 *     "emailAccentForeground": "#FFFFFF"
 *   }
 * }
 * ```
 *
 * Files are paths relative to the deployment root or package specifiers.
 * Everything is optional: without it the app calls itself "App", has no
 * logo or favicon, and emails carry no support address or website.
 */
export interface AppIdentity {
  /** The product name: page titles, emails and the API reference. */
  name: string;
  /** The favicon file. */
  favicon?: string;
  /** The logo for light grounds, such as the sign-in page. */
  logo?: string;
  /** The logo for dark grounds; defaults to `logo`. */
  logoDark?: string;
  /** The logo at the top of the sidebar, in the colourway of its default theme. */
  sidebarLogo?: string;
  /** The address emails offer for help, and their default sender. */
  supportEmail?: string;
  /** The public website, linked from emails. */
  website?: string;
  /** An absolute URL of the logo emails show; most mail clients need a PNG. */
  emailLogoUrl?: string;
  /** The fill of buttons in emails, as a hex colour. */
  emailAccent?: string;
  /** The label colour on `emailAccent`, as a hex colour. */
  emailAccentForeground?: string;
}

const DEFAULT_NAME = 'App';

/** Reads `recommand.app` from the deployment's package.json. */
export function readAppIdentity(deploymentRoot: string): AppIdentity {
  let config: unknown;
  try {
    const packageJson = JSON.parse(readFileSync(join(deploymentRoot, 'package.json'), 'utf-8'));
    config = packageJson.recommand?.app;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (config === undefined) return { name: DEFAULT_NAME };
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    throw new Error('recommand.app must be an object');
  }
  const entries = Object.entries(config);
  for (const [key, value] of entries) {
    if (typeof value !== 'string') throw new Error(`recommand.app.${key} must be a string`);
  }
  const identity = Object.fromEntries(entries) as Partial<AppIdentity>;
  return { ...identity, name: identity.name || DEFAULT_NAME };
}

let cached: AppIdentity | undefined;

/**
 * The deployment's app identity, for server code. The framework sits at
 * `packages/framework` in the deployment, so the deployment root is two
 * levels up from the framework package.
 */
export function getAppIdentity(): AppIdentity {
  cached ??= readAppIdentity(resolve(import.meta.dirname, '../../..'));
  return cached;
}
