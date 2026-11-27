import { createMarkdownFromOpenApi } from "@scalar/openapi-to-markdown";
import type { Context, Hono } from "hono";
import type { GenerateSpecOptions } from "hono-openapi";
import { generateSpecs } from "hono-openapi";

/**
 * What an application says about its OpenAPI document: its `info` and `tags`,
 * and the paths it leaves out with `exclude`. The servers and the security
 * schemes are the same for every application, so `registerOpenApiRoutes()`
 * adds those itself.
 */
export type OpenApiOptions = Partial<Pick<GenerateSpecOptions, "exclude">> & {
  documentation: Pick<GenerateSpecOptions["documentation"], "info" | "tags">;
};

// Every application authenticates its API requests the same way, with an API
// key and secret or with a JWT
const securitySchemes = {
  httpBasic: {
    type: "http",
    scheme: "basic",
    description: "Basic API key authentication. Create a new API key and secret in the Recommand dashboard.",
  },
  jwt: {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    description: "JWT authentication. Create a new JWT token in the Recommand dashboard.",
  },
} as const;

type Parameter = { $ref?: string; in?: string; name?: string };

const PARAMETER_LOCATIONS = ["path", "query", "header", "cookie"];

const PARAMETER_REFERENCE = "#/components/parameters/";

const isParameterList = (value: unknown): value is Parameter[] => Array.isArray(value);

// A `$ref` sorts as the parameter component it names
const resolved = (parameter: Parameter, components: Record<string, Parameter>): Parameter => {
  if (!parameter.$ref?.startsWith(PARAMETER_REFERENCE)) {
    return parameter;
  }

  const name = parameter.$ref.slice(PARAMETER_REFERENCE.length).replace(/~1/g, "/").replace(/~0/g, "~");

  return components[name] ?? {};
};

// A parameter without a known location, such as a `$ref` that names no parameter
// component, goes last and keeps its place among the others like it
const locationRank = ({ in: location }: Parameter) => {
  const rank = PARAMETER_LOCATIONS.indexOf(location ?? "");

  return rank === -1 ? PARAMETER_LOCATIONS.length : rank;
};

const sortedParameters = (path: string, parameters: Parameter[], components: Record<string, Parameter>) =>
  parameters.toSorted((first, second) => {
    const [a, b] = [resolved(first, components), resolved(second, components)];

    if (locationRank(a) !== locationRank(b)) {
      return locationRank(a) - locationRank(b);
    }

    if (a.in === "path") {
      return path.indexOf(`{${a.name}}`) - path.indexOf(`{${b.name}}`);
    }

    const [firstName, secondName] = [a.name ?? "", b.name ?? ""];

    return firstName < secondName ? -1 : firstName > secondName ? 1 : 0;
  });

/**
 * List every operation's parameters in a fixed order: path parameters as they
 * appear in the path, then query, header and cookie parameters, each by name.
 *
 * `hono-openapi` lists them in the key order of the validators' schemas, so
 * building a schema from shared parts, with `.merge()` or `.extend()`, reorders
 * the published parameters although none of them changed.
 *
 * https://github.com/rhinobase/hono-openapi/pull/332 proposes this order
 * upstream, as the `sortParameters` option; until the `hono-openapi` release
 * this package uses has it, the document is sorted here.
 */
export const withSortedParameters = <
  T extends { components?: { parameters?: Record<string, unknown> }; paths?: Record<string, unknown> },
>(specs: T): T => {
  if (!specs.paths) {
    return specs;
  }

  const components = (specs.components?.parameters ?? {}) as Record<string, Parameter>;
  const paths = Object.fromEntries(
    Object.entries(specs.paths).map(([path, item]) => {
      if (item === null || typeof item !== "object") {
        return [path, item];
      }

      const sortedItem = Object.fromEntries(
        Object.entries(item).map(([key, value]) => {
          if (key === "parameters" && isParameterList(value)) {
            return [key, sortedParameters(path, value, components)];
          }

          if (value !== null && typeof value === "object" && "parameters" in value && isParameterList(value.parameters)) {
            return [key, { ...value, parameters: sortedParameters(path, value.parameters, components) }];
          }

          return [key, value];
        }),
      );

      return [path, sortedItem];
    }),
  );

  return { ...specs, paths };
};

type Tagged = { tags?: unknown };

const operationTags = (item: unknown): string[] => {
  if (item === null || typeof item !== "object") {
    return [];
  }

  return Object.values(item).flatMap((operation: Tagged | null) =>
    Array.isArray(operation?.tags) ? operation.tags : []
  );
};

/**
 * Keep only the declared tags that some operation in the document uses.
 *
 * A package declares a tag for each group of its routes, but an application
 * leaves some routes out of its document, with `exclude` or `hide`, and a tag
 * no operation uses would show up as an empty group.
 */
export const withUsedTags = <
  T extends { paths?: Record<string, unknown>; tags?: { name: string }[]; webhooks?: Record<string, unknown> },
>(specs: T): T => {
  if (!specs.tags) {
    return specs;
  }

  const used = new Set(
    [...Object.values(specs.paths ?? {}), ...Object.values(specs.webhooks ?? {})].flatMap(operationTags)
  );

  return { ...specs, tags: specs.tags.filter(({ name }) => used.has(name)) };
};

/**
 * Serves the OpenAPI document of every route on `server` at `/openapi`, and the
 * same document as Markdown at `/llms-full.txt`. Exported so that tooling can
 * build the document exactly as it is served, without starting the server.
 */
export const registerOpenApiRoutes = (
  server: Hono,
  { documentation: { info, ...documentation }, ...options }: OpenApiOptions
): void => {
  const specsOptions: Partial<GenerateSpecOptions> = {
    // An `Output` component is written over its input form, so the two don't
    // repeat each other's inline enumerations.
    composeOutputComponents: true,
    // `hono-openapi` would document a 400 on every validated route with the
    // body its own validator sends, but `zodValidator` answers with a body of
    // its own, so that response would describe a body that is never sent.
    defaultValidationErrorResponse: false,
    documentation: {
      info,
      servers: [{ url: process.env.BASE_URL!, description: "Recommand API" }],
      components: { securitySchemes },
      security: [{ httpBasic: [] }, { jwt: [] }],
      ...documentation,
    },
    ...options,
  };
  // The routes do not change once the server runs, so generate the document
  // once and serve it from both routes, with every operation's parameters in a
  // fixed order (see withSortedParameters) and only the tags it uses (see
  // withUsedTags).
  let openApiDocument: ReturnType<typeof generateSpecs> | undefined;
  const getOpenApiDocument = (c: Context) => {
    openApiDocument ??= generateSpecs(server, specsOptions, c).then(
      (document) => withUsedTags(withSortedParameters(document)),
      (error) => {
        openApiDocument = undefined;
        throw error;
      }
    );
    return openApiDocument;
  };
  server.get("/openapi", async (c) => c.json(await getOpenApiDocument(c)));
  server.get("/llms-full.txt", async (c) => {
    const markdown = await createMarkdownFromOpenApi(
      await getOpenApiDocument(c)
    );
    return c.text(markdown);
  });
};
