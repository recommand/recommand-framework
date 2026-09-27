import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export type RecommandApp = {
    name: string;
    apiMount?: string;
    absolutePath: string;
    termsOfUse?: string;
    privacyPolicy?: string;
    // Declares that the package registers the deployment's entitlement resolver.
    entitlementResolver?: boolean;
}

let installedApps: RecommandApp[] = [];

/** Record the apps this process runs, before any of them initializes. */
export function setInstalledApps(apps: RecommandApp[]) {
    installedApps = [...apps];
}

/** The apps this process runs; empty outside the server, for example in tests. */
export function getInstalledApps(): RecommandApp[] {
    return installedApps;
}

export async function getApps(): Promise<RecommandApp[]> {
    const apps: RecommandApp[] = [];
    const rootDir = process.cwd().split('/').slice(0, -1).join('/'); // Get parent directory
    
    // Get all items from the parent directory with readdir
    const items = await readdir(rootDir);
    
    // Filter for directories only
    for (const item of items) {
        const fullPath = join(rootDir, item);
        const stats = await stat(fullPath);
        
        if (stats.isDirectory() && !item.startsWith(".") && item !== "node_modules") {

            // Get the app name from the package.json
            const packageJson = await readFile(join(fullPath, "package.json"), "utf-8");
            const packageJsonData = JSON.parse(packageJson);
            const appName = packageJsonData.name;
            const apiMount = packageJsonData.recommand?.apiMount;
            const termsOfUse = packageJsonData.recommand?.termsOfUse;
            const privacyPolicy = packageJsonData.recommand?.privacyPolicy;
            const entitlementResolver = packageJsonData.recommand?.entitlementResolver === true;

            if(appName === "recommand-framework") {
                continue;
            }

            apps.push({ name: appName, absolutePath: fullPath, apiMount, termsOfUse, privacyPolicy, entitlementResolver });
        }
    }

    // Sort apps by name
    apps.sort((a, b) => a.name.localeCompare(b.name));

    return apps;
}