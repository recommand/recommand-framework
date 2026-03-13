import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export type RecommandApp = {
    name: string;
    apiMount?: string;
    absolutePath: string;
    termsOfUse?: string;
    privacyPolicy?: string;
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

            if(appName === "recommand-framework") {
                continue;
            }

            apps.push({ name: appName, absolutePath: fullPath, apiMount, termsOfUse, privacyPolicy });
        }
    }

    // Sort apps by name
    apps.sort((a, b) => a.name.localeCompare(b.name));

    return apps;
}