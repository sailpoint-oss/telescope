function decodePointerToken(token) {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

export function splitPointer(pointer) {
  if (!pointer || pointer === "/") return [];
  const normalized = pointer.startsWith("/") ? pointer.slice(1) : pointer;
  if (!normalized) return [];
  return normalized.split("/").map(decodePointerToken);
}

export function joinPointer(parts) {
  if (!Array.isArray(parts) || parts.length === 0) return "";
  const encoded = parts.map((part) =>
    String(part).replace(/~/g, "~0").replace(/\//g, "~1"),
  );
  return `/${encoded.join("/")}`;
}

export function getValueAtPointer(root, pointer) {
  if (!pointer) return root;
  const parts = splitPointer(pointer);
  let current = root;
  for (const part of parts) {
    if (current == null) return undefined;
    if (Array.isArray(current)) {
      const idx = Number(part);
      if (!Number.isInteger(idx) || idx < 0 || idx >= current.length) {
        return undefined;
      }
      current = current[idx];
      continue;
    }
    if (typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

export function defineRule(definition) {
  return definition;
}

export function defineGenericRule(definition) {
  return definition;
}

/**
 * Define a Zod schema for additional validation.
 * The schema must be a Zod type with a `.parse()` method.
 *
 * Usage:
 *   import { z } from "zod";
 *   import { defineSchema } from "@sailpoint-oss/telescope";
 *
 *   export default defineSchema(
 *     z.object({
 *       name: z.string(),
 *       version: z.string(),
 *     })
 *   );
 *
 * The sidecar will validate documents against this schema and convert
 * Zod errors into LSP diagnostics.
 */
export function defineSchema(schema) {
  if (schema && typeof schema.parse === "function") {
    return schema;
  }
  throw new Error(
    "defineSchema() expects a Zod schema with a .parse() method",
  );
}
