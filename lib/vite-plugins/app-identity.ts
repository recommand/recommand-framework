import { createRequire } from 'node:module';
import { isAbsolute, join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { readAppIdentity } from '../app-identity';

const VIRTUAL_ID = 'virtual:recommand-app';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/** The files in the identity, which the client imports as asset URLs. */
const FILE_KEYS = ['favicon', 'logo', 'logoDark', 'sidebarLogo'] as const;

/**
 * Brings the deployment's app identity (`recommand.app`, see
 * lib/app-identity.ts) to the client: the page title in index.html, and a
 * `virtual:recommand-app` module with the name, contact details and the URLs
 * of the favicon and logos, which Vite serves and bundles as assets.
 */
export default function AppIdentityPlugin(): Plugin {
  const deploymentRoot = resolve(process.cwd(), '../..');
  const require = createRequire(join(deploymentRoot, 'package.json'));
  const identity = readAppIdentity(deploymentRoot);
  const resolveFile = (file: string) =>
    file.startsWith('.') || isAbsolute(file)
      ? resolve(deploymentRoot, file)
      : require.resolve(file);

  return {
    name: 'recommand-app-identity',

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },

    load(id) {
      if (id !== RESOLVED_ID) return;
      const imports: string[] = [];
      const files: string[] = [];
      for (const key of FILE_KEYS) {
        const file = identity[key];
        if (!file) continue;
        imports.push(`import ${key} from ${JSON.stringify(`${resolveFile(file)}?url`)};`);
        files.push(key);
      }
      const { name, supportEmail, website } = identity;
      return [
        ...imports,
        `export const app = { ...${JSON.stringify({ name, supportEmail, website })}, ${files.join(', ')} };`,
        'export default app;',
      ].join('\n');
    },

    transformIndexHtml(html) {
      return html.replace(/<title>.*<\/title>/, `<title>${escapeHtml(identity.name)}</title>`);
    },
  };
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);
}
