import fs from "fs/promises";
import path from "path";
import type { Plugin } from "vite";
import { getApps, type RecommandApp } from "../app";

type Route = {
  route: string;
  relativePath: string;
  pageFilePath: string | null;
  layoutFilePath: string | null;
  children: Route[];
}

async function getAllRoutes(app: RecommandApp, directory: string, routePath: string): Promise<Route | null> {
  const route: Route = {
    route: routePath,
    relativePath: path.relative(app.absolutePath, directory),
    pageFilePath: null,
    layoutFilePath: null,
    children: [],
  };
  
  // Get all files in the directory
  const files = await fs.readdir(directory, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(directory, file.name);

    if (file.isDirectory()) {
      const isGroup = file.name.startsWith("(");
      const isParameter = file.name.startsWith("[");
      if(isGroup) {
        const childRoute = await getAllRoutes(app, fullPath, routePath);
        if(childRoute) {
          route.children.push(childRoute);
        }
      } else if (isParameter) {
        // Parameter routes should start with a colon and have no []
        const parameterName = file.name.slice(1, -1);
        const childRoute = await getAllRoutes(app, fullPath, routePath + "/:" + parameterName);
        if (childRoute) {
          route.children.push(childRoute);
        }
      }else{
        const childRoute = await getAllRoutes(app, fullPath, routePath + "/" + file.name);
        if (childRoute) {
          route.children.push(childRoute);
        }
      }
    } else if (file.isFile() && file.name.endsWith('.tsx')) {
      if (file.name === 'page.tsx') {
        route.pageFilePath = fullPath;
      } else if (file.name === 'layout.tsx') {
        route.layoutFilePath = fullPath;
      }
    }
  }

  if (!route.pageFilePath && !route.layoutFilePath && route.children.length === 0) {
    return null;
  }

  return route;
}

async function getAppEntrypointPath(app: RecommandApp): Promise<string | null> {
  const entrypoint = path.join(app.absolutePath, "app", "main.tsx");
  try {
    await fs.access(entrypoint);
    return entrypoint;
  } catch {
    return null;
  }
}

function mergeRoutes(routes: Route[]): Route[] {
  const routeMap = new Map<string, Route>();

  for (const route of routes) {
    const existing = routeMap.get(route.relativePath);
    if (!existing) {
      routeMap.set(route.relativePath, { ...route });
      continue;
    }

    // Merge components from different apps
    if (route.pageFilePath) existing.pageFilePath = route.pageFilePath;
    if (route.layoutFilePath) existing.layoutFilePath = route.layoutFilePath;

    // Recursively merge children
    const mergedChildren = mergeRoutes([...existing.children, ...route.children]);
    existing.children = mergedChildren;
  }

  return Array.from(routeMap.values());
}

export function FileBasedRouterPlugin(): Plugin {
  return {
    name: "recommand-file-based-router",
    resolveId(id) {
      if (id === "virtual:recommand-file-based-router") return id;
      return null;
    },
    async load(id) {
      if (id === "virtual:recommand-file-based-router") {
        const apps = await getApps();
        let allRoutes: Route[] = [];

        // Collect routes from all apps
        for (const app of apps) {
          const appDir = path.resolve(app.absolutePath, "app");
          try {
            await fs.access(appDir);
          } catch {
            continue; // Skip packages without an app/ directory
          }
          const route = await getAllRoutes(app, appDir, "");
          if (route) {
            allRoutes.push(route);
          }
        }

        // Merge routes from all apps
        const mergedRoutes = mergeRoutes(allRoutes);

        let componentCounter = 0;
        const importStatements: string[] = [];
        const componentNames = new Set<string>();

        // Recursive function to process routes and generate imports
        function processRoute(route: Route): any {
          const currentIndex = componentCounter++;
          
          const componentName = {
            page: route.pageFilePath ? `PageComponent${currentIndex}` : null,
            layout: route.layoutFilePath ? `LayoutComponent${currentIndex}` : null,
          };
          
          if (route.pageFilePath) {
            importStatements.push(`import PageComponent${currentIndex} from '${route.pageFilePath}';`);
            componentNames.add(`PageComponent${currentIndex}`);
          }
          if (route.layoutFilePath) {
            importStatements.push(`import LayoutComponent${currentIndex} from '${route.layoutFilePath}';`);
            componentNames.add(`LayoutComponent${currentIndex}`);
          }

          const processedChildren = route.children.map(child => processRoute(child));

          return {
            route: route.route,
            relativePath: route.relativePath,
            componentName,
            children: processedChildren
          };
        }

        const processedRoutes = mergedRoutes.map(route => processRoute(route));

        // Add entrypoint imports and components
        const entrypoints = await Promise.all(apps.map(getAppEntrypointPath));
        const entrypointComponentNames: string[] = [];
        for (const entrypoint of entrypoints) {
          if (entrypoint) {
            const currentIndex = componentCounter++;
            importStatements.push(`import MainComponent${currentIndex} from '${entrypoint}';`);
            componentNames.add(`MainComponent${currentIndex}`);
            entrypointComponentNames.push(`MainComponent${currentIndex}`);
          }
        }

        // Generate switch cases only for the components that exist
        const componentCases = Array.from(componentNames)
          .map(name => `case '${name}': return ${name};`)
          .join('\n');

        return `
          ${importStatements.join('\n')}
          
          const routeDefinitions = ${JSON.stringify(processedRoutes, null, 2)};
          const entrypointDefinitions = ${JSON.stringify(entrypointComponentNames, null, 2)};

          export const routes = routeDefinitions.map(route => {
            // Recursive function to map component names to actual components
            function mapComponents(node) {
              return {
                route: node.route,
                relativePath: node.relativePath,
                PageComponent: ${generateComponentMapping('page')},
                LayoutComponent: ${generateComponentMapping('layout')},
                children: node.children.map(child => mapComponents(child))
              };
            }
            return mapComponents(route);
          });

          export const entrypoints = entrypointDefinitions.map(node => {
            return ${generateEntrypointMapping()};
          });

          function getComponent(componentName) {
            switch (componentName) {
              ${componentCases}
              default:
                return null;
            }
          }
        `;
      }
    },
  };
}

// Helper function to generate component mapping code
function generateComponentMapping(type: 'page' | 'layout') {
  return `node.componentName.${type} ? getComponent(node.componentName.${type}) : null`;
}
function generateEntrypointMapping() {
  return `node ? getComponent(node) : null`;
}