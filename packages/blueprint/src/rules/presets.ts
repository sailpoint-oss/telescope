// Core rules

import type { Preset, RuleConfigEntry } from "lens";
import type { Rule } from "lens";
// Component rules
import componentExampleNameCapital from "./components/example-name-capital";
import componentSchemaNameCapital from "./components/schema-name-capital";
import refCycle from "./core/ref-cycle";
import unresolvedRef from "./core/unresolved-ref";
// Document rules
import documentAscii from "./document/ascii";
// Operation rules
import operationBasicFields from "./operations/basic-fields";
import operationDescriptionHtml from "./operations/description-html";
import operationIdFormat from "./operations/id-format";
import operationIdUnique from "./operations/id-unique";
import operationPagination from "./operations/pagination";
import operationResponses from "./operations/responses";
import operationSecurityRequirements from "./operations/security-requirements";
import operationSummary from "./operations/summary";
import operationTags from "./operations/tags";
import operationUserLevels from "./operations/user-levels";
// Parameter rules
import parameterDefault from "./parameters/default";
import parameterDescription from "./parameters/description";
import parameterExample from "./parameters/example";
import parameterExampleKeys from "./parameters/example-keys";
import parameterFilters from "./parameters/filters";
import parameterFormats from "./parameters/formats";
import parameterIn from "./parameters/in";
import parameterRequired from "./parameters/required";
import parameterSorters from "./parameters/sorters";
import operationIdUniqueInPath from "./paths/id-unique-in-path";
// Path rules
import pathParamsMatch from "./paths/params-match";
import documentVersionRefIsolation from "./references/version-ref-isolation";
// Root rules
import rootInfo from "./root/info";
import rootSailpointApi from "./root/sailpoint-api";
import rootTags from "./root/tags";
// Schema rules
import schemaAllofMixedTypes from "./schemas/allof-mixed-types";
import schemaDefault from "./schemas/default";
import schemaDescription from "./schemas/description";
import schemaExample from "./schemas/example";
import schemaExampleKeys from "./schemas/example-keys";
import schemaFormats from "./schemas/formats";
import schemaRequired from "./schemas/required";
import schemaStructure from "./schemas/structure";

// Preset and RuleConfigEntry types are now imported from lens
export type { Preset, RuleConfigEntry } from "lens";

// Default preset - general OpenAPI best practices (no SailPoint-specific rules)
export const defaultPreset: Preset = {
  id: "@telescope-openapi/default",
  rules: {
    "path-params-match": ["error", {}],
    "operationid-unique": "error",
    "unresolved-ref": "error",
    "ref-cycle": "error",
    "operation-basic-fields": "error",
    "operation-description-html": "error",
    "operation-id-format": "error",
    "operation-summary": "error",
    "operation-tags": "error",
    "operation-security-requirements": "error",
    "operation-responses": "error",
    "operation-pagination": "error",
    // Note: operation-user-levels is excluded (SailPoint-specific)
    "operation-id-unique-in-path": "error",
    "parameter-in": "error",
    "parameter-required": "error",
    "parameter-description": "error",
    "parameter-default": "error",
    "parameter-example": "error",
    "parameter-example-keys": "error",
    "parameter-filters": "error",
    "parameter-formats": "error",
    "parameter-sorters": "error",
    "schema-allof-mixed-types": "error",
    "schema-default": "error",
    "schema-description": "error",
    "schema-example": "error",
    "schema-example-keys": "error",
    "schema-formats": "error",
    "schema-required": "error",
    "schema-structure": "error",
    "component-example-name-capital": "error",
    "component-schema-name-capital": "error",
    "root-info": "error",
    "root-tags": "error",
    "document-ascii": "error",
    "document-version-ref-isolation": "error",
  },
};

// SailPoint preset - extends default and adds SailPoint-specific rules
export const sailpointPreset: Preset = {
  id: "@telescope-openapi/sailpoint",
  extends: ["@telescope-openapi/default"],
  rules: {
    "root-sailpoint-api": "error",
    "operation-user-levels": "error",
  },
};

// Backward compatibility: recommended31 is now an alias for default
export const recommended31: Preset = {
  id: "@telescope-openapi/recommended-3.1",
  extends: ["@telescope-openapi/default"],
  rules: {
    // Include SailPoint rules for backward compatibility
    "root-sailpoint-api": "error",
    "operation-user-levels": "error",
  },
};

export const rules: Record<string, Rule> = {
  "path-params-match": pathParamsMatch,
  "operationid-unique": operationIdUnique,
  "unresolved-ref": unresolvedRef,
  "ref-cycle": refCycle,
  "operation-basic-fields": operationBasicFields,
  "operation-description-html": operationDescriptionHtml,
  "operation-id-format": operationIdFormat,
  "operation-summary": operationSummary,
  "operation-tags": operationTags,
  "operation-security-requirements": operationSecurityRequirements,
  "operation-responses": operationResponses,
  "operation-pagination": operationPagination,
  "operation-user-levels": operationUserLevels,
  "operation-id-unique-in-path": operationIdUniqueInPath,
  "parameter-in": parameterIn,
  "parameter-required": parameterRequired,
  "parameter-description": parameterDescription,
  "parameter-default": parameterDefault,
  "parameter-example": parameterExample,
  "parameter-example-keys": parameterExampleKeys,
  "parameter-filters": parameterFilters,
  "parameter-formats": parameterFormats,
  "parameter-sorters": parameterSorters,
  "schema-allof-mixed-types": schemaAllofMixedTypes,
  "schema-default": schemaDefault,
  "schema-description": schemaDescription,
  "schema-example": schemaExample,
  "schema-example-keys": schemaExampleKeys,
  "schema-formats": schemaFormats,
  "schema-required": schemaRequired,
  "schema-structure": schemaStructure,
  "component-example-name-capital": componentExampleNameCapital,
  "component-schema-name-capital": componentSchemaNameCapital,
  "root-info": rootInfo,
  "root-sailpoint-api": rootSailpointApi,
  "root-tags": rootTags,
  "document-ascii": documentAscii,
  "document-version-ref-isolation": documentVersionRefIsolation,
};

export {
  // Core rules
  refCycle,
  unresolvedRef,
  // Path rules
  pathParamsMatch,
  operationIdUniqueInPath,
  // Operation rules
  operationIdUnique,
  operationBasicFields,
  operationDescriptionHtml,
  operationIdFormat,
  operationSummary,
  operationTags,
  operationSecurityRequirements,
  operationResponses,
  operationPagination,
  operationUserLevels,
  // Parameter rules
  parameterIn,
  parameterRequired,
  parameterDescription,
  parameterDefault,
  parameterExample,
  parameterExampleKeys,
  parameterFilters,
  parameterFormats,
  parameterSorters,
  // Schema rules
  schemaAllofMixedTypes,
  schemaDefault,
  schemaDescription,
  schemaExample,
  schemaExampleKeys,
  schemaFormats,
  schemaRequired,
  schemaStructure,
  // Component rules
  componentExampleNameCapital,
  componentSchemaNameCapital,
  // Root rules
  rootInfo,
  rootSailpointApi,
  rootTags,
  // Document rules
  documentAscii,
  documentVersionRefIsolation,
};
