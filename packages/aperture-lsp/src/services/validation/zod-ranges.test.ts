import { describe, expect, test } from "bun:test";
import { zodErrorsToDiagnostics } from "../shared/zod-to-diag";
import * as yaml from "yaml";
import { z } from "zod";

describe("Zod Diagnostic Range Mapping", () => {
    test("should map missing property error to parent object", () => {
        const text = `name: "Test"
settings:
  debug: true`;
        const lineCounter = new yaml.LineCounter();
        const doc = yaml.parseDocument(text, { lineCounter });

        const schema = z.object({
            name: z.string(),
            settings: z.object({
                debug: z.boolean(),
                timeout: z.number() // Missing
            })
        });

        const result = schema.safeParse(doc.toJS());

        if (!result.success) {
            const diagnostics = zodErrorsToDiagnostics(result.error, doc, lineCounter);

            expect(diagnostics.length).toBe(1);

            const range = diagnostics[0].range;
            // "settings" is on line 1
            expect(range.start.line).toBe(1);
            expect(range.start.character).toBe(0);
            expect(range.end.line).toBe(1);
            expect(range.end.character).toBe(8);
        } else {
            throw new Error("Validation should have failed");
        }
    });

    test("should map invalid type error to specific value", () => {
        const text = `name: "Test"
version: 123`;
        const lineCounter = new yaml.LineCounter();
        const doc = yaml.parseDocument(text, { lineCounter });

        const schema = z.object({
            name: z.string(),
            version: z.string()
        });

        const result = schema.safeParse(doc.toJS());

        if (!result.success) {
            const diagnostics = zodErrorsToDiagnostics(result.error, doc, lineCounter);
            expect(diagnostics.length).toBe(1);

            const range = diagnostics[0].range;
            // version: 123 is on line 1
            expect(range.start.line).toBe(1);
            expect(range.start.character).toBe(9); 
            expect(range.end.line).toBe(1);
            expect(range.end.character).toBe(12); 
        } else {
            throw new Error("Validation should have failed");
        }
    });
});
