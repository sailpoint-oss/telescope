# Guide: Runtime Validation with Zod (YAML Plugin)

This guide demonstrates an alternative approach to building a YAML Language Plugin for Volar.js. Instead of projecting YAML to TypeScript for compile-time validation, we will parse the YAML at runtime and validate it against a **Zod** schema.

This approach is ideal when:

1.  You already have Zod schemas for your data.
2.  You want to validate values at runtime (e.g., "age must be > 0").
3.  You want precise control over error messages without relying on TypeScript's type system.

## 1. Architecture

We will use a **Hybrid Approach**:

- **Language Plugin (`YamlRuntimeLanguagePlugin`)**:
  - Parses YAML $\to$ AST (using `yaml` package).
  - Generates a "Pass-Through" Virtual Code (keeps the content as YAML).
  - Builds precise mappings from AST ranges.
- **Service Plugin (`YamlRuntimeServicePlugin`)**:
  - **Validation 1 (Zod)**: Validates the parsed object against a Zod schema and reports specific semantic errors.
  - **Validation 2 (YAML LS)**: Uses `yaml-language-server` programmatically to validate against a JSON Schema (generated from Zod).

---

## 2. The Language Plugin (`YamlRuntimeLanguagePlugin`)

### Prerequisites

```bash
npm install yaml zod vscode-uri yaml-language-server zod-to-json-schema
```

### Step 1: The Virtual Code Class

This class manages the document state. We will parse the YAML into an AST to get precise line/column information (offsets).

```typescript
import type { VirtualCode, CodeMapping } from "@volar/language-core";
import type { IScriptSnapshot } from "typescript";
import { parseDocument, LineCounter } from "yaml";
import type { Document } from "yaml";

export class YamlRuntimeVirtualCode implements VirtualCode {
  id = "root";
  // We use 'yaml' as the language ID so other YAML-aware tools can pick it up
  languageId = "yaml";
  mappings: CodeMapping[] = [];
  embeddedCodes = [];

  // Store the parsed document for the service plugin to reuse
  ast: Document | undefined;
  lineCounter: LineCounter | undefined;

  constructor(public snapshot: IScriptSnapshot) {
    this.update(snapshot);
  }

  update(newSnapshot: IScriptSnapshot) {
    this.snapshot = newSnapshot;
    const text = newSnapshot.getText(0, newSnapshot.getLength());

    // 1. Parse to AST with 'yaml' using LineCounter for precise location tracking
    this.lineCounter = new LineCounter();
    this.ast = parseDocument(text, { lineCounter: this.lineCounter });

    // 2. Create Mappings
    // Since we aren't transforming the code, we map 1:1.
    this.mappings = this.createMappings();
  }

  private createMappings(): CodeMapping[] {
    const textLength = this.snapshot.getLength();
    return [
      {
        sourceOffsets: [0],
        generatedOffsets: [0],
        lengths: [textLength],
        data: {
          verification: true,
          completion: true,
          navigation: true,
          semantic: true,
          structure: true,
          format: true,
        },
      },
    ];
  }
}
```

### Step 2: The Language Plugin Factory

```typescript
import type { LanguagePlugin } from "@volar/language-core";
import { URI } from "vscode-uri";

export const yamlRuntimeLanguagePlugin: LanguagePlugin<URI> = {
  getLanguageId(uri) {
    if (uri.path.endsWith(".yaml") || uri.path.endsWith(".yml")) {
      return "yaml";
    }
  },

  createVirtualCode(uri, languageId, snapshot) {
    if (languageId === "yaml") {
      return new YamlRuntimeVirtualCode(snapshot);
    }
  },

  updateVirtualCode(uri, virtualCode, newSnapshot) {
    if (virtualCode instanceof YamlRuntimeVirtualCode) {
      virtualCode.update(newSnapshot);
      return virtualCode;
    }
  },
};
```

---

## 3. The Service Plugin (`YamlRuntimeServicePlugin`)

This is where the validation logic lives. We utilize the AST cached in the virtual code to map Zod errors back to source positions, AND we use the official YAML Language Service to validate against a standard JSON Schema.

### Implementation

```typescript
import type {
  LanguageServicePlugin,
  LanguageServicePluginInstance,
} from "@volar/language-service";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { z } from "zod";
// Note: Zod 4+ recommended. For Zod 3, install 'zod-to-json-schema'.
import { getLanguageService, TextDocument } from "yaml-language-server";
import { YamlRuntimeVirtualCode } from "./yamlRuntimeLanguagePlugin";
import type { Document } from "yaml";

// 1. Define Zod Schema
const ConfigSchema = z.object({
  version: z.literal("1.0"),
  users: z.array(
    z.object({
      name: z.string(),
      age: z.number().min(0),
    })
  ),
});

// 2. Convert to JSON Schema for YAML Language Service
// Note: Zod 4 supports native JSON Schema conversion via `z.toJSONSchema()`.
// For Zod 3, use the `zod-to-json-schema` package.
import { z } from "zod";

// Example for Zod 4 (native support)
const jsonSchema = z.toJSONSchema(ConfigSchema);

// Example for Zod 3 (using zod-to-json-schema)
// import { zodToJsonSchema } from 'zod-to-json-schema';
// const jsonSchema = zodToJsonSchema(ConfigSchema, "my-schema");

// 3. Initialize YAML Language Service
const yamlLs = getYamlLS({
  schemaRequestService: async (uri) => {
    if (uri === "internal://schema") {
      return JSON.stringify(jsonSchema);
    }
    return "";
  },
  workspaceContext: {
    resolveRelativePath: (relativePath, resource) => relativePath,
  },
});

// Configure it to use our schema
yamlLs.configure({
  validate: true,
  schemas: [
    {
      uri: "internal://schema",
      fileMatch: ["*.yaml", "*.yml"],
      schema: jsonSchema,
    },
  ],
});

export const yamlRuntimeServicePlugin: LanguageServicePlugin = {
  name: "yaml-zod-validation",
  create(context): LanguageServicePluginInstance {
    return {
      provide: {
        async provideDiagnostics(document: TextDocument) {
          const decoded = context.decodeEmbeddedDocumentUri(
            URI.parse(document.uri)
          );
          if (!decoded) return [];

          const [sourceUri, embeddedCodeId] = decoded;
          const sourceScript = context.language.scripts.get(sourceUri);
          const virtualCode =
            sourceScript?.generated?.embeddedCodes.get(embeddedCodeId);

          if (
            !(virtualCode instanceof YamlRuntimeVirtualCode) ||
            !virtualCode.ast
          ) {
            return [];
          }

          const diagnostics = [];
          const ast = virtualCode.ast;

          // ---------------------------------------------------------
          // Strategy A: Semantic Errors (from Zod Runtime Check)
          // ---------------------------------------------------------
          // Good for: Business logic (age > 0), transformations
          const data = ast.toJS();
          if (data) {
            const result = ConfigSchema.safeParse(data);
            if (!result.success) {
              for (const issue of result.error.issues) {
                const range = getRangeForPath(ast, issue.path);
                diagnostics.push({
                  severity: 1, // Error
                  source: "zod-logic",
                  code: issue.code,
                  message: issue.message,
                  range: {
                    start: document.positionAt(range.start),
                    end: document.positionAt(range.end),
                  },
                });
              }
            }
          }

          // ---------------------------------------------------------
          // Strategy B: Schema Validation (from YAML LS)
          // ---------------------------------------------------------
          // Good for: Structure, Types, Enum completion (if implemented)
          // We convert the Volar/VSCode document to the one YAML LS expects
          const yamlDoc = YamlTextDocument.create(
            document.uri,
            "yaml",
            document.version,
            document.getText()
          );

          const yamlDiagnostics = await yamlLs.doValidation(yamlDoc, true); // true = isKubernetes (optional)

          for (const d of yamlDiagnostics) {
            // Avoid duplicates if Zod already caught it?
            // Or just prefix the source to differentiate.
            d.source = "yaml-schema";
            diagnostics.push(d);
          }

          return diagnostics;
        },
      },
    };
  },
};

/**
 * Helper to traverse the YAML AST and find the exact range for a given path.
 */
function getRangeForPath(
  doc: Document,
  path: (string | number)[]
): { start: number; end: number } {
  let node: any = doc.contents;

  for (const key of path) {
    if (!node) break;

    if (node.items) {
      if (Array.isArray(node.items)) {
        if (node.get) {
          node = node.get(key, true);
        } else {
          const found = node.items.find(
            (p: any) => (p.key && p.key.value === key) || p === node.items[key]
          );
          node = found?.value || found;
        }
      }
    }
  }

  if (node && node.range) {
    return { start: node.range[0], end: node.range[1] };
  }

  return { start: 0, end: 0 };
}
```

---

## 4. User Experience & Usage

This approach provides a highly controlled, semantic validation experience.

### 1. Strict Validation

The developer sees exactly what you defined in Zod.

- **Scenario**: User sets `age: -5`.
- **Volar**: Runs Zod schema.
- **Zod**: Fails with "Number must be greater than 0".
- **Result**: Red squiggle under `-5` with the message "Number must be greater than 0".

### 2. Schema Validation (YAML Service)

The `yaml-language-server` catches structural issues using the JSON Schema derived from Zod.

- **Scenario**: User sets `version: 2.0` (schema allows only '1.0').
- **YAML LS**: Reports "Value is not accepted. Valid values: '1.0'".
- **Result**: Standard error message from the schema validator.

### 3. No "Magic" Completions

Unlike the TypeScript projection method, completions **do not** happen automatically here.

- **User types**: `role: `
- **Result**: Nothing happens (unless you manually implement `provideCompletionItems` in your Service Plugin using `yamlLs.doComplete()`).

---

## 5. Side-by-Side Comparison

| Feature               | TypeScript Projection (Guide 1)                      | Zod Runtime Validation (This Guide)     |
| :-------------------- | :--------------------------------------------------- | :-------------------------------------- |
| **Primary Mechanism** | Transforms YAML to TS Code                           | Parses YAML to JS Object                |
| **Validation Engine** | TypeScript Compiler (Static)                         | Zod (Runtime) + YAML LS                 |
| **Performance**       | Very High (TS Server handles heavy lifting)          | High (Depends on Zod schema complexity) |
| **Completions**       | Free (via TS Interface)                              | Manual (can use `yamlLs.doComplete`)    |
| **Hovers**            | Free (via JSDoc)                                     | Manual (can use `yamlLs.doHover`)       |
| **Refactoring**       | Supported (Rename Symbol works)                      | Manual implementation required          |
| **Best Use Case**     | Complex IDE features needed (completions, refactors) | Strict runtime validation rules needed  |
