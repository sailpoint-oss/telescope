You can treat Volar as the “LSP shell” and let the existing VS Code JSON/YAML language services do **all** the schema-aware work. Volar’s service plugins just wire documents + configuration into those services and forward results back to the client.

Below is a concrete, end-to-end example:

- Uses **`vscode-json-languageservice`** (the JSON language service extracted from VS Code) ([GitHub][1])
- Uses **`yaml-language-server`**’s embedded language service for YAML, which supports `yaml.schemas` and `$schema` modelines as VS Code’s YAML extension does. ([Yarn][2])
- Runs on top of **`@volar/language-server`** using its “services” API. ([Volar.js][3])

I’ll show:

1. The Volar LSP entrypoint (`server.ts`)
2. A JSON service plugin (`services/json.ts`)
3. A YAML service plugin (`services/yaml.ts`)
4. How arbitrary schemas flow from client → Volar → JSON/YAML LS

---

## 1. Volar server entrypoint (`server.ts`)

```ts
// server.ts
import { createConnection } from "vscode-languageserver/node";
import { createServer } from "@volar/language-server/node";
import type { ServerInitializationOptions } from "@volar/language-server";
import { createJsonService } from "./services/json";
import { createYamlService } from "./services/yaml";

const connection = createConnection();

// Standard Volar server bootstrap
const server = createServer(connection, {
  // You can add more services here (Vue, custom DSLs, etc.)
  services: {
    jsonSchemas: createJsonService,
    yamlSchemas: createYamlService,
  },
} satisfies ServerInitializationOptions);

connection.listen();
```

The important bit is `services: { ... }`: each factory returns a **Volar ServicePlugin** that hooks into diagnostics, completion, hover, etc., delegating to the JSON/YAML language services.

---

## 2. JSON + JSON Schema via `vscode-json-languageservice`

`services/json.ts`

```ts
// services/json.ts
import type {
  ServicePlugin,
  LanguageServiceContext,
} from "@volar/language-service";

import {
  getLanguageService as getJsonLanguageService,
  TextDocument,
  type LanguageSettings,
  type SchemaConfiguration,
  type JSONDocument,
} from "vscode-json-languageservice";
```

```ts
export function createJsonService(): ServicePlugin {
  return {
    name: "json-schemas",

    create(context: LanguageServiceContext) {
      // --- 1. Create the underlying JSON language service ---

      const jsonLs = getJsonLanguageService({
        schemaRequestService: async (uri) => {
          // Volar gives you an abstracted FS in env.
          // You can support http(s) here as well if you like.
          const fs = context.env.fileSystem;

          if (uri.startsWith("file://")) {
            const filePath = context.env.uriToFileName(uri);
            const bytes = await fs.readFile(filePath);
            return bytes.toString("utf8");
          }

          // Fallback: fetch over HTTP(S) if you want remote schemas
          // (or reject to surface a schemaRequest error diagnostic)
          throw new Error(`Schema fetch not implemented for URI: ${uri}`);
        },
        workspaceContext: {
          resolveRelativePath(relativePath, resource) {
            // Very similar to how VS Code’s own JSON LS does this.
            const base = context.env.uriToFileName(resource);
            const resolved = require("path").resolve(
              require("path").dirname(base),
              relativePath
            );
            return context.env.fileNameToUri(resolved);
          },
        },
        clientCapabilities: undefined, // or map from context.env.lspCapabilities
      });

      let languageSettings: LanguageSettings = {
        validate: true,
        allowComments: true,
        schemas: [],
      };

      // --- 2. Load schema configuration from the client ---

      async function reloadConfiguration() {
        if (!context.configurationHost) return;

        // Expect the client to send something compatible with VS Code's json.schemas
        // {
        //   "json": {
        //     "schemas": [
        //       { "fileMatch": ["foo.json"], "url": "https://example.com/foo.schema.json" }
        //     ]
        //   }
        // }
        const jsonSection =
          await context.configurationHost.getConfiguration<"json">("json");

        const schemasSetting = (jsonSection?.schemas ?? []) as Array<
          SchemaConfiguration & { url?: string }
        >;

        const schemas: SchemaConfiguration[] = schemasSetting.map((s) => ({
          uri: s.uri ?? s.url!, // VS Code uses 'url', LS expects 'uri' internally
          fileMatch: s.fileMatch,
          schema: s.schema,
          folderUri: s.folderUri,
        }));

        languageSettings = {
          ...languageSettings,
          validate: jsonSection?.validate ?? true,
          allowComments: jsonSection?.allowComments ?? true,
          schemas,
        };

        jsonLs.configure(languageSettings);
      }

      // Initial load + react to config changes
      if (context.configurationHost) {
        context.configurationHost.onDidChangeConfiguration?.(
          reloadConfiguration
        );
        void reloadConfiguration();
      }

      // --- 3. Volar hooks → JSON LS calls ---

      function isJsonDoc(doc: TextDocument) {
        // Volar exposes languageId on its TextDocument wrapper
        return doc.languageId === "json" || doc.languageId === "jsonc";
      }

      return {
        // Diagnostics (schema + syntax)
        async provideDiagnostics(doc) {
          const textDoc = doc as unknown as TextDocument;
          if (!isJsonDoc(textDoc)) return;

          const jsonDoc: JSONDocument = jsonLs.parseJSONDocument(textDoc);
          const diagnostics = await jsonLs.doValidation(textDoc, jsonDoc);
          return diagnostics;
        },

        // Completion (schema-driven)
        async provideCompletionItems(doc, position, _ctx) {
          const textDoc = doc as unknown as TextDocument;
          if (!isJsonDoc(textDoc)) return;

          const jsonDoc = jsonLs.parseJSONDocument(textDoc);
          return jsonLs.doComplete(textDoc, position, jsonDoc);
        },

        // Hover (schema descriptions, enums, etc.)
        async provideHover(doc, position) {
          const textDoc = doc as unknown as TextDocument;
          if (!isJsonDoc(textDoc)) return;

          const jsonDoc = jsonLs.parseJSONDocument(textDoc);
          return jsonLs.doHover(textDoc, position, jsonDoc);
        },

        // (Optional) other JSON LS features:
        //  - document symbols
        //  - folding ranges
        //  - selection ranges
        //  - color info
      };
    },
  };
}
```

**Key point:** `LanguageSettings.schemas` is exactly how VS Code configures arbitrary JSON Schemas for `vscode-json-languageservice`. It’s a list of objects:

```ts
interface SchemaConfiguration {
  uri: string;
  fileMatch?: string[];
  schema?: JSONSchema;
  folderUri?: string;
}
```

The LS then automatically picks the right schema(s) per document based on those `fileMatch` patterns. ([jsDelivr][4])

By reading `json.schemas` from the client and passing it into `LanguageSettings.schemas`, your Volar-based server behaves just like VS Code’s built-in JSON support — but now inside your own LSP.

---

## 3. YAML + JSON Schema via `yaml-language-server`

`services/yaml.ts`

YAML is similar, but the YAML LS has its **own** configuration schema (`yaml.schemas`, `$schema` modelines, etc.). ([Yarn][2])

```ts
// services/yaml.ts
import type {
  ServicePlugin,
  LanguageServiceContext,
} from "@volar/language-service";

import {
  // Re-exported from yaml-language-server's UMD bundle
  getLanguageService as getYamlLanguageService,
} from "yaml-language-server/lib/umd/index";

import type {
  TextDocument,
  Diagnostic,
  CompletionList,
  Hover,
  Position,
} from "vscode-languageserver-types";
```

```ts
export function createYamlService(): ServicePlugin {
  return {
    name: "yaml-schemas",

    create(context: LanguageServiceContext) {
      const yamlLs = getYamlLanguageService({
        schemaRequestService: async (uri: string) => {
          const fs = context.env.fileSystem;

          if (uri.startsWith("file://")) {
            const filePath = context.env.uriToFileName(uri);
            const bytes = await fs.readFile(filePath);
            return bytes.toString("utf8");
          }

          throw new Error(`Schema fetch not implemented for URI: ${uri}`);
        },
        workspaceContext: {
          resolveRelativePath(relativePath: string, resource: string) {
            const base = context.env.uriToFileName(resource);
            const resolved = require("path").resolve(
              require("path").dirname(base),
              relativePath
            );
            return context.env.fileNameToUri(resolved);
          },
        },
        clientCapabilities: {}, // can map from context.env.lspCapabilities if desired
        // plus any YAML-specific initialization options (e.g. customTags)
      });

      // YAML LS expects a VS Code-like yaml.* config object
      type YamlConfig = {
        validate?: boolean;
        schemas?: Record<string, string | string[]>; // schemaUri -> glob(s)
        customTags?: string[];
        schemaStore?: { enable?: boolean; url?: string };
        // ... other yaml.* settings as needed
      };

      let yamlSettings: YamlConfig = {
        validate: true,
        schemas: {},
      };

      async function reloadConfiguration() {
        if (!context.configurationHost) return;

        // Expect the client to send a "yaml" section similar to VS Code:
        // {
        //   "yaml": {
        //     "schemas": {
        //       "https://json.schemastore.org/github-workflow": ".github/workflows/*.yml",
        //       "/path/to/local/schema.json": "config/**/*.yaml"
        //     }
        //   }
        // }
        const yamlSection =
          await context.configurationHost.getConfiguration<YamlConfig>("yaml");

        yamlSettings = {
          ...yamlSettings,
          ...yamlSection,
        };

        yamlLs.configure(yamlSettings);
      }

      if (context.configurationHost) {
        context.configurationHost.onDidChangeConfiguration?.(
          reloadConfiguration
        );
        void reloadConfiguration();
      }

      function isYamlDoc(doc: TextDocument) {
        return (
          doc.languageId === "yaml" ||
          doc.languageId === "yml" ||
          doc.languageId === "yaml-tmlanguage" ||
          doc.languageId === "yaml-textmate"
        );
      }

      return {
        async provideDiagnostics(doc): Promise<Diagnostic[] | undefined> {
          const textDoc = doc as unknown as TextDocument;
          if (!isYamlDoc(textDoc)) return;

          // YAML LS does its own parse & validation based on configured schemas
          const yamlDoc = yamlLs.parseYAMLDocument(textDoc);
          return yamlLs.doValidation(textDoc, yamlDoc);
        },

        async provideCompletionItems(
          doc,
          position
        ): Promise<CompletionList | undefined> {
          const textDoc = doc as unknown as TextDocument;
          if (!isYamlDoc(textDoc)) return;

          const yamlDoc = yamlLs.parseYAMLDocument(textDoc);
          return yamlLs.doComplete(textDoc, position as Position, yamlDoc);
        },

        async provideHover(doc, position): Promise<Hover | undefined> {
          const textDoc = doc as unknown as TextDocument;
          if (!isYamlDoc(textDoc)) return;

          const yamlDoc = yamlLs.parseYAMLDocument(textDoc);
          return yamlLs.doHover(textDoc, position as Position, yamlDoc);
        },
      };
    },
  };
}
```

Because `yaml-language-server` builds on top of `vscode-json-languageservice`, its `configure` API understands `yaml.schemas` the same way VS Code does: a map from schema URI (or keyword like `"kubernetes"`) to one or more glob patterns. It _also_ respects inline modelines like:

```yaml
# yaml-language-server: $schema=../schemas/my-schema.json
```

…which gives you “arbitrary JSON schema per YAML file” without even touching configuration. ([Yarn][2])

---

## 4. How arbitrary schemas actually flow

Putting it all together:

1. **Client → Server (Volar)**
   Your editor / client sends `workspace/didChangeConfiguration` with something like:

   ```jsonc
   {
     "json": {
       "schemas": [
         {
           "fileMatch": ["config/**/*.json"],
           "url": "https://example.com/schemas/my-config.schema.json"
         }
       ]
     },
     "yaml": {
       "schemas": {
         "https://example.com/schemas/my-config.schema.json": "config/**/*.y?(a)ml"
       }
     }
   }
   ```

2. **Volar → JSON/YAML Services**

   - The JSON plugin maps `json.schemas` → `LanguageSettings.schemas` and calls `jsonLs.configure(...)`.
   - The YAML plugin passes `yaml.schemas` into `yamlLs.configure(...)`.

3. **JSON/YAML Services → LSP Features**

   - On every diagnostics/hover/completion request:

     - Volar calls `jsonLs` or `yamlLs` with the current `TextDocument`.
     - Those LS instances select schemas via `fileMatch`/`schemas` and/or `$schema` fields.
     - They return schema-aware diagnostics, completions, hovers, etc., which Volar forwards to the client.

From the client’s perspective, it just speaks normal LSP to a single Volar server. Under the hood, you’ve glued VS Code’s existing JSON/YAML language brains into Volar’s framework and let them handle _all_ the JSON Schema logic.

---

If you’d like, I can next:

- Reshape this into a minimal **npm package layout** (e.g. `volar-service-json-schemas`, `volar-service-yaml-schemas`), or
- Show how to _also_ map **non-file URIs** (e.g. `mytool://schema/foo`) from your own config into `SchemaConfiguration.uri` so you can host schemas inside your tool instead of on disk/HTTP.

[1]: https://github.com/microsoft/vscode-json-languageservice?utm_source=chatgpt.com "microsoft/vscode-json-languageservice"
[2]: https://classic.yarnpkg.com/en/package/yaml-language-server "yaml-language-server | Yarn"
[3]: https://volarjs.dev/reference/services/?utm_source=chatgpt.com "Services"
[4]: https://cdn.jsdelivr.net/npm/vscode-json-languageservice%405.6.2/lib/umd/jsonLanguageService.d.ts "cdn.jsdelivr.net"
