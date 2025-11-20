import {
	getValueAtPointer,
	joinPointer,
	splitPointer,
} from "shared/pointer-utils";
import { identifyDocumentType } from "shared/document-type-utils";
import type { ParsedDocument } from "../types.js";
import type { RefGraph, Resolver } from "./graph-types";
import type {
	CallbackRef,
	ComponentRef,
	ExampleRef,
	HeaderRef,
	JsonPointer,
	LinkRef,
	MediaTypeRef,
	OperationRef,
	ParameterRef,
	PathItemRef,
	ProjectIndex,
	ReferenceRef,
	RequestBodyRef,
	ResponseRef,
	SchemaRef,
	ScopeContext,
	SecurityRequirementRef,
} from "./types";

export interface BuildIndexOptions {
	docs: Map<string, ParsedDocument>;
	graph: RefGraph;
	resolver: Resolver;
}

const HTTP_METHODS = [
	"get",
	"put",
	"post",
	"delete",
	"patch",
	"options",
	"head",
	"trace",
] as const;

const COMPONENT_SECTIONS = [
	"schemas",
	"responses",
	"parameters",
	"headers",
	"examples",
	"requestBodies",
	"securitySchemes",
	"links",
	"callbacks",
] as const;

export function buildIndex(options: BuildIndexOptions): ProjectIndex {
	const pathsByString = new Map<string, PathItemRef[]>();
	const pathItemsToPaths = new Map<string, string[]>();
	const operationsByOwner = new Map<string, OperationRef[]>();
	const components: Record<
		string,
		Map<string, ComponentRef>
	> = Object.fromEntries(
		COMPONENT_SECTIONS.map((section) => [
			section,
			new Map<string, ComponentRef>(),
		]),
	) as Record<string, Map<string, ComponentRef>>;
	const schemas = new Map<string, SchemaRef>(); // All schemas (components, fragments, inline)
	const parameters = new Map<string, ParameterRef>(); // All parameters (components, path-level, operation-level, fragments)
	const responses = new Map<string, ResponseRef>(); // All responses (components, operation-level, fragments)
	const requestBodies = new Map<string, RequestBodyRef>(); // All request bodies (components, operation-level, fragments)
	const headers = new Map<string, HeaderRef>(); // All headers (components, response-level, fragments)
	const mediaTypes = new Map<string, MediaTypeRef>(); // All media types (requestBody.content, response.content)
	const securityRequirements = new Map<string, SecurityRequirementRef>(); // All security requirements (root, operation-level)
	const examples = new Map<string, ExampleRef>(); // All examples (components, inline under media types, parameters, headers)
	const links = new Map<string, LinkRef>(); // All links (components, response-level)
	const callbacks = new Map<string, CallbackRef>(); // All callbacks (components, operation-level)
	const references = new Map<string, ReferenceRef>(); // All $ref nodes throughout the document
	const documents = new Map<string, Record<string, unknown>>();
	const pathItemsByPointer = new Map<string, PathItemRef>();
	const operationsByPointer = new Map<string, OperationRef>();

	for (const [uri, doc] of options.docs) {
		const root = doc.ast as Record<string, unknown> | undefined;
		if (!root || typeof root !== "object") continue;
		documents.set(uri, root);

		// Collect all $ref nodes throughout the document
		function collectReferences(node: unknown, segments: string[]): void {
			if (!node || typeof node !== "object") return;

			const nodeObj = node as Record<string, unknown>;

			// Check if this node has a $ref property
			if (typeof nodeObj["$ref"] === "string") {
				const originPointer = joinPointer(segments);
				const refPointer = joinPointer([...segments, "$ref"]);
				const refKey = nodeKey(uri, refPointer);
				references.set(refKey, {
					uri,
					pointer: originPointer,
					refPointer,
					ref: nodeObj.$ref as string,
					node: nodeObj,
				});
				// Don't traverse into $ref nodes - they reference external/internal content
				return;
			}

			// Continue traversing
			if (Array.isArray(node)) {
				node.forEach((item, index) => {
					collectReferences(item, [...segments, String(index)]);
				});
			} else {
				for (const [key, value] of Object.entries(nodeObj)) {
					collectReferences(value, [...segments, key]);
				}
			}
		}

		collectReferences(root, []);

		// Collect root-level security requirements
		const rootSecurity = root.security;
		if (Array.isArray(rootSecurity)) {
			for (let i = 0; i < rootSecurity.length; i++) {
				const securityReq = rootSecurity[i];
				if (!securityReq || typeof securityReq !== "object") continue;
				const securityPointer = joinPointer(["security", String(i)]);
				const securityKey = nodeKey(uri, securityPointer);
				securityRequirements.set(securityKey, {
					uri,
					pointer: securityPointer,
					node: securityReq,
					level: "root",
				});
			}
		}

		const paths = root.paths as Record<string, unknown> | undefined;
		if (paths && typeof paths === "object") {
			for (const [pathString, pathItemValue] of Object.entries(paths)) {
				if (!pathItemValue || typeof pathItemValue !== "object") continue;
				const pointer = joinPointer(["paths", pathString]);

				// Build operations under the owning PathItem. If the PathItem is a $ref,
				// dereference it and iterate the target's operations, but track both
				// reference location and definition location.
				let effectivePathItem: Record<string, unknown> | undefined =
					pathItemValue as Record<string, unknown>;
				let definitionUri = uri;
				let definitionPointer = pointer;
				const maybeRef = (effectivePathItem as Record<string, unknown>).$ref;

				if (typeof maybeRef === "string") {
					try {
						// Origin pointer at the path item node is sufficient for resolution
						const originNode = { uri, pointer };
						const target = options.resolver.deref<Record<string, unknown>>(
							originNode,
							maybeRef,
						);
						if (target && typeof target === "object") {
							// Get the origin of the resolved target to find where it's defined
							const targetOrigin = options.resolver.originOf(target);
							if (targetOrigin) {
								definitionUri = targetOrigin.uri;
								definitionPointer = targetOrigin.pointer;
							}
							effectivePathItem = target;
						}
					} catch {
						// Unresolved refs will be reported by rules; continue with no ops here
						effectivePathItem = undefined;
					}
				}

				const pathItem: PathItemRef = {
					uri, // Reference URI (or definition if not referenced)
					pointer, // Reference pointer (or definition if not referenced)
					definitionUri,
					definitionPointer,
					referenceUri:
						maybeRef && typeof maybeRef === "string" ? uri : undefined,
					referencePointer:
						maybeRef && typeof maybeRef === "string" ? pointer : undefined,
					node: pathItemValue as any,
				};
				pushMap(pathsByString, pathString, pathItem);
				pathItemsByPointer.set(nodeKey(uri, pointer), pathItem);
				pushMap(pathItemsToPaths, nodeKey(uri, pointer), pathString);

				// Collect path-level parameters
				const pathParams = effectivePathItem?.parameters;
				if (Array.isArray(pathParams)) {
					for (let i = 0; i < pathParams.length; i++) {
						const param = pathParams[i];
						if (!param || typeof param !== "object") continue;

						// Handle $ref parameters
						let effectiveParam: Record<string, unknown> | undefined =
							param as Record<string, unknown>;
						const paramRef = (param as Record<string, unknown>).$ref;
						if (typeof paramRef === "string") {
							try {
								const target = options.resolver.deref<Record<string, unknown>>(
									{ uri, pointer },
									paramRef,
								);
								if (target && typeof target === "object") {
									effectiveParam = target;
								}
							} catch {
								effectiveParam = undefined;
							}
						}

						if (effectiveParam) {
							const paramPointer = joinPointer([
								"paths",
								pathString,
								"parameters",
								String(i),
							]);
							const paramKey = nodeKey(uri, paramPointer);
							parameters.set(paramKey, {
								uri,
								pointer: paramPointer,
								node: effectiveParam,
								name:
									typeof effectiveParam.name === "string"
										? effectiveParam.name
										: undefined,
								in:
									typeof effectiveParam.in === "string"
										? effectiveParam.in
										: undefined,
							});
						}
					}
				}

				const operations: OperationRef[] = [];
				if (effectivePathItem && typeof effectivePathItem === "object") {
					for (const method of HTTP_METHODS) {
						const operationValue =
							effectivePathItem[method as keyof typeof effectivePathItem];
						if (!operationValue || typeof operationValue !== "object") continue;
						const opPointer = joinPointer(["paths", pathString, method]);

						// Determine definition location for operation
						// If PathItem was $ref'd, operations are defined in the referenced file
						const opDefinitionUri = definitionUri;
						const opDefinitionPointer =
							definitionPointer === pointer
								? joinPointer([...splitPointer(definitionPointer), method])
								: joinPointer([definitionPointer, method]);

						const operation: OperationRef = {
							uri, // Reference URI (where PathItem $ref is)
							pointer: opPointer, // Reference pointer
							definitionUri: opDefinitionUri,
							definitionPointer: opDefinitionPointer,
							referenceUri:
								maybeRef && typeof maybeRef === "string" ? uri : undefined,
							referencePointer:
								maybeRef && typeof maybeRef === "string"
									? opPointer
									: undefined,
							method,
							node: operationValue as any,
						};
						operations.push(operation);
						operationsByPointer.set(nodeKey(uri, opPointer), operation);

						// Collect operation-level parameters
						const opParams = (operationValue as Record<string, unknown>)[
							"parameters"
						];
						if (Array.isArray(opParams)) {
							for (let i = 0; i < opParams.length; i++) {
								const param = opParams[i];
								if (!param || typeof param !== "object") continue;

								// Handle $ref parameters
								let effectiveParam: Record<string, unknown> | undefined =
									param as Record<string, unknown>;
								const paramRef = (param as Record<string, unknown>)["$ref"];
								if (typeof paramRef === "string") {
									try {
										const target = options.resolver.deref<
											Record<string, unknown>
										>({ uri, pointer: opPointer }, paramRef);
										if (target && typeof target === "object") {
											effectiveParam = target;
										}
									} catch {
										effectiveParam = undefined;
									}
								}

								if (effectiveParam) {
									const paramPointer = joinPointer([
										"paths",
										pathString,
										method,
										"parameters",
										String(i),
									]);
									const paramKey = nodeKey(uri, paramPointer);
									parameters.set(paramKey, {
										uri,
										pointer: paramPointer,
										node: effectiveParam,
										name:
											typeof effectiveParam.name === "string"
												? effectiveParam.name
												: undefined,
										in:
											typeof effectiveParam.in === "string"
												? effectiveParam.in
												: undefined,
									});

									// Collect examples from parameter.examples
									const paramExamples = effectiveParam.examples;
									if (
										paramExamples &&
										typeof paramExamples === "object" &&
										!Array.isArray(paramExamples)
									) {
										for (const [exampleName, exampleValue] of Object.entries(
											paramExamples,
										)) {
											if (!exampleValue || typeof exampleValue !== "object")
												continue;
											const examplePointer = joinPointer([
												"paths",
												pathString,
												method,
												"parameters",
												String(i),
												"examples",
												exampleName,
											]);
											const exampleKey = nodeKey(uri, examplePointer);
											examples.set(exampleKey, {
												uri,
												pointer: examplePointer,
												node: exampleValue,
												name: exampleName,
											});
										}
									}
								}
							}
						}

						// Collect operation-level requestBody
						const opRequestBody = (operationValue as Record<string, unknown>)
							.requestBody;
						if (opRequestBody && typeof opRequestBody === "object") {
							// Handle $ref requestBody
							let effectiveRequestBody: Record<string, unknown> | undefined =
								opRequestBody as Record<string, unknown>;
							const requestBodyRef = (opRequestBody as Record<string, unknown>)
								.$ref;
							if (typeof requestBodyRef === "string") {
								try {
									const target = options.resolver.deref<
										Record<string, unknown>
									>({ uri, pointer: opPointer }, requestBodyRef);
									if (target && typeof target === "object") {
										effectiveRequestBody = target;
									}
								} catch {
									effectiveRequestBody = undefined;
								}
							}

							if (effectiveRequestBody) {
								const requestBodyPointer = joinPointer([
									"paths",
									pathString,
									method,
									"requestBody",
								]);
								const requestBodyKey = nodeKey(uri, requestBodyPointer);
								requestBodies.set(requestBodyKey, {
									uri,
									pointer: requestBodyPointer,
									node: effectiveRequestBody,
								});

								// Collect media types from requestBody.content
								const content = effectiveRequestBody.content;
								if (
									content &&
									typeof content === "object" &&
									!Array.isArray(content)
								) {
									for (const [mediaType, mediaTypeValue] of Object.entries(
										content,
									)) {
										if (!mediaTypeValue || typeof mediaTypeValue !== "object")
											continue;
										const mediaTypePointer = joinPointer([
											"paths",
											pathString,
											method,
											"requestBody",
											"content",
											mediaType,
										]);
										const mediaTypeKey = nodeKey(uri, mediaTypePointer);
										mediaTypes.set(mediaTypeKey, {
											uri,
											pointer: mediaTypePointer,
											node: mediaTypeValue,
											mediaType,
										});

										// Collect schema under requestBody.content.*.schema
										const rbSchema = (mediaTypeValue as Record<string, unknown>)
											.schema as Record<string, unknown> | undefined;
										if (rbSchema && typeof rbSchema === "object") {
											const schemaPointer = joinPointer([
												"paths",
												pathString,
												method,
												"requestBody",
												"content",
												mediaType,
												"schema",
											]);
											const schemaKey = nodeKey(uri, schemaPointer);
											schemas.set(schemaKey, {
												uri,
												pointer: schemaPointer,
												node: rbSchema,
											});
										}
									}
								}
							}
						}

						// Collect operation-level responses
						const opResponses = (operationValue as Record<string, unknown>)
							.responses;
						if (
							opResponses &&
							typeof opResponses === "object" &&
							!Array.isArray(opResponses)
						) {
							for (const [statusCode, responseValue] of Object.entries(
								opResponses,
							)) {
								if (!responseValue || typeof responseValue !== "object")
									continue;

								// Handle $ref responses
								let effectiveResponse: Record<string, unknown> | undefined =
									responseValue as Record<string, unknown>;
								const responseRef = (responseValue as Record<string, unknown>)
									.$ref;
								if (typeof responseRef === "string") {
									try {
										const target = options.resolver.deref<
											Record<string, unknown>
										>({ uri, pointer: opPointer }, responseRef);
										if (target && typeof target === "object") {
											effectiveResponse = target;
										}
									} catch {
										effectiveResponse = undefined;
									}
								}

								if (effectiveResponse) {
									const responsePointer = joinPointer([
										"paths",
										pathString,
										method,
										"responses",
										statusCode,
									]);
									const responseKey = nodeKey(uri, responsePointer);
									responses.set(responseKey, {
										uri,
										pointer: responsePointer,
										node: effectiveResponse,
										statusCode,
									});

									// Collect headers from response.headers
									const responseHeaders = effectiveResponse.headers;
									if (
										responseHeaders &&
										typeof responseHeaders === "object" &&
										!Array.isArray(responseHeaders)
									) {
										for (const [headerName, headerValue] of Object.entries(
											responseHeaders,
										)) {
											if (!headerValue || typeof headerValue !== "object")
												continue;

											// Handle $ref headers
											let effectiveHeader: Record<string, unknown> | undefined =
												headerValue as Record<string, unknown>;
											const headerRef = (headerValue as Record<string, unknown>)
												.$ref;
											if (typeof headerRef === "string") {
												try {
													const target = options.resolver.deref<
														Record<string, unknown>
													>({ uri, pointer: responsePointer }, headerRef);
													if (target && typeof target === "object") {
														effectiveHeader = target;
													}
												} catch {
													effectiveHeader = undefined;
												}
											}

											if (effectiveHeader) {
												const headerPointer = joinPointer([
													"paths",
													pathString,
													method,
													"responses",
													statusCode,
													"headers",
													headerName,
												]);
												const headerKey = nodeKey(uri, headerPointer);
												headers.set(headerKey, {
													uri,
													pointer: headerPointer,
													node: effectiveHeader,
													name: headerName,
												});

												// Collect examples from header.examples
												const headerExamples = effectiveHeader.examples;
												if (
													headerExamples &&
													typeof headerExamples === "object" &&
													!Array.isArray(headerExamples)
												) {
													for (const [
														exampleName,
														exampleValue,
													] of Object.entries(headerExamples)) {
														if (
															!exampleValue ||
															typeof exampleValue !== "object"
														)
															continue;
														const examplePointer = joinPointer([
															"paths",
															pathString,
															method,
															"responses",
															statusCode,
															"headers",
															headerName,
															"examples",
															exampleName,
														]);
														const exampleKey = nodeKey(uri, examplePointer);
														examples.set(exampleKey, {
															uri,
															pointer: examplePointer,
															node: exampleValue,
															name: exampleName,
														});
													}
												}
											}
										}
									}

									// Collect media types from response.content
									const responseContent = effectiveResponse.content;
									if (
										responseContent &&
										typeof responseContent === "object" &&
										!Array.isArray(responseContent)
									) {
										for (const [mediaType, mediaTypeValue] of Object.entries(
											responseContent,
										)) {
											if (!mediaTypeValue || typeof mediaTypeValue !== "object")
												continue;
											const mediaTypePointer = joinPointer([
												"paths",
												pathString,
												method,
												"responses",
												statusCode,
												"content",
												mediaType,
											]);
											const mediaTypeKey = nodeKey(uri, mediaTypePointer);
											mediaTypes.set(mediaTypeKey, {
												uri,
												pointer: mediaTypePointer,
												node: mediaTypeValue,
												mediaType,
											});

											// Collect schema under response.content.*.schema
											const respSchema = (
												mediaTypeValue as Record<string, unknown>
											).schema as Record<string, unknown> | undefined;
											if (respSchema && typeof respSchema === "object") {
												const schemaPointer = joinPointer([
													"paths",
													pathString,
													method,
													"responses",
													statusCode,
													"content",
													mediaType,
													"schema",
												]);
												const schemaKey = nodeKey(uri, schemaPointer);
												schemas.set(schemaKey, {
													uri,
													pointer: schemaPointer,
													node: respSchema,
												});
											}

											// Collect examples from mediaType.examples
											const mediaTypeExamples = (
												mediaTypeValue as Record<string, unknown>
											).examples;
											if (
												mediaTypeExamples &&
												typeof mediaTypeExamples === "object" &&
												!Array.isArray(mediaTypeExamples)
											) {
												for (const [
													exampleName,
													exampleValue,
												] of Object.entries(mediaTypeExamples)) {
													if (!exampleValue || typeof exampleValue !== "object")
														continue;
													const examplePointer = joinPointer([
														"paths",
														pathString,
														method,
														"responses",
														statusCode,
														"content",
														mediaType,
														"examples",
														exampleName,
													]);
													const exampleKey = nodeKey(uri, examplePointer);
													examples.set(exampleKey, {
														uri,
														pointer: examplePointer,
														node: exampleValue,
														name: exampleName,
													});
												}
											}
										}
									}

									// Collect links from response.links
									const responseLinks = effectiveResponse.links;
									if (
										responseLinks &&
										typeof responseLinks === "object" &&
										!Array.isArray(responseLinks)
									) {
										for (const [linkName, linkValue] of Object.entries(
											responseLinks,
										)) {
											if (!linkValue || typeof linkValue !== "object") continue;
											const linkPointer = joinPointer([
												"paths",
												pathString,
												method,
												"responses",
												statusCode,
												"links",
												linkName,
											]);
											const linkKey = nodeKey(uri, linkPointer);
											links.set(linkKey, {
												uri,
												pointer: linkPointer,
												node: linkValue,
												name: linkName,
											});
										}
									}
								}
							}
						}

						// Collect operation-level security
						const opSecurity = (operationValue as Record<string, unknown>)
							.security;
						if (Array.isArray(opSecurity)) {
							for (let i = 0; i < opSecurity.length; i++) {
								const securityReq = opSecurity[i];
								if (!securityReq || typeof securityReq !== "object") continue;
								const securityPointer = joinPointer([
									"paths",
									pathString,
									method,
									"security",
									String(i),
								]);
								const securityKey = nodeKey(uri, securityPointer);
								securityRequirements.set(securityKey, {
									uri,
									pointer: securityPointer,
									node: securityReq,
									level: "operation",
								});
							}
						}

						// Collect callbacks from operation.callbacks
						const opCallbacks = (operationValue as Record<string, unknown>)
							.callbacks;
						if (
							opCallbacks &&
							typeof opCallbacks === "object" &&
							!Array.isArray(opCallbacks)
						) {
							for (const [callbackName, callbackValue] of Object.entries(
								opCallbacks,
							)) {
								if (!callbackValue || typeof callbackValue !== "object")
									continue;
								const callbackPointer = joinPointer([
									"paths",
									pathString,
									method,
									"callbacks",
									callbackName,
								]);
								const callbackKey = nodeKey(uri, callbackPointer);
								callbacks.set(callbackKey, {
									uri,
									pointer: callbackPointer,
									node: callbackValue,
									name: callbackName,
								});
							}
						}
					}
				}
				operationsByOwner.set(nodeKey(uri, pointer), operations);
			}
		}

		const componentRoot = root.components as
			| Record<string, unknown>
			| undefined;
		if (componentRoot && typeof componentRoot === "object") {
			for (const section of COMPONENT_SECTIONS) {
				const entries = componentRoot[section] as
					| Record<string, unknown>
					| undefined;
				if (!entries || typeof entries !== "object") continue;
				const bucket = components[section];
				for (const [name, value] of Object.entries(entries)) {
					if (!value || typeof value !== "object") continue;
					const pointer = joinPointer(["components", section, name]);
					bucket?.set(name, {
						uri,
						pointer,
						node: value,
					});

					// Also index schema components as schemas
					if (section === "schemas") {
						const schemaKey = nodeKey(uri, pointer);
						schemas.set(schemaKey, {
							uri,
							pointer,
							node: value,
						});
					}

					// Also index parameter components as parameters
					if (section === "parameters") {
						const paramKey = nodeKey(uri, pointer);
						const paramNode = value as Record<string, unknown>;
						parameters.set(paramKey, {
							uri,
							pointer,
							node: value,
							name:
								typeof paramNode.name === "string" ? paramNode.name : undefined,
							in: typeof paramNode.in === "string" ? paramNode.in : undefined,
						});
					}

					// Also index response components as responses
					if (section === "responses") {
						const responseKey = nodeKey(uri, pointer);
						responses.set(responseKey, {
							uri,
							pointer,
							node: value,
							statusCode: name, // Component name is typically the status code or description
						});

						// Also collect headers and media types from response components
						const responseNode = value as Record<string, unknown>;
						const responseHeaders = responseNode.headers;
						if (
							responseHeaders &&
							typeof responseHeaders === "object" &&
							!Array.isArray(responseHeaders)
						) {
							for (const [headerName, headerValue] of Object.entries(
								responseHeaders,
							)) {
								if (!headerValue || typeof headerValue !== "object") continue;
								const headerPointer = joinPointer([
									"components",
									"responses",
									name,
									"headers",
									headerName,
								]);
								const headerKey = nodeKey(uri, headerPointer);
								headers.set(headerKey, {
									uri,
									pointer: headerPointer,
									node: headerValue,
									name: headerName,
								});
							}
						}

						const responseContent = responseNode.content;
						if (
							responseContent &&
							typeof responseContent === "object" &&
							!Array.isArray(responseContent)
						) {
							for (const [mediaType, mediaTypeValue] of Object.entries(
								responseContent,
							)) {
								if (!mediaTypeValue || typeof mediaTypeValue !== "object")
									continue;
								const mediaTypePointer = joinPointer([
									"components",
									"responses",
									name,
									"content",
									mediaType,
								]);
								const mediaTypeKey = nodeKey(uri, mediaTypePointer);
								mediaTypes.set(mediaTypeKey, {
									uri,
									pointer: mediaTypePointer,
									node: mediaTypeValue,
									mediaType,
								});

								// Collect schema under components.responses.*.content.*.schema
								const compRespSchema = (
									mediaTypeValue as Record<string, unknown>
								).schema as Record<string, unknown> | undefined;
								if (compRespSchema && typeof compRespSchema === "object") {
									const schemaPointer = joinPointer([
										"components",
										"responses",
										name,
										"content",
										mediaType,
										"schema",
									]);
									const schemaKey = nodeKey(uri, schemaPointer);
									schemas.set(schemaKey, {
										uri,
										pointer: schemaPointer,
										node: compRespSchema,
									});
								}

								// Collect examples from mediaType.examples
								const mediaTypeExamples = (
									mediaTypeValue as Record<string, unknown>
								).examples;
								if (
									mediaTypeExamples &&
									typeof mediaTypeExamples === "object" &&
									!Array.isArray(mediaTypeExamples)
								) {
									for (const [exampleName, exampleValue] of Object.entries(
										mediaTypeExamples,
									)) {
										if (!exampleValue || typeof exampleValue !== "object")
											continue;
										const examplePointer = joinPointer([
											"components",
											"responses",
											name,
											"content",
											mediaType,
											"examples",
											exampleName,
										]);
										const exampleKey = nodeKey(uri, examplePointer);
										examples.set(exampleKey, {
											uri,
											pointer: examplePointer,
											node: exampleValue,
											name: exampleName,
										});
									}
								}
							}
						}

						// Collect links from response components
						const responseLinks = responseNode.links;
						if (
							responseLinks &&
							typeof responseLinks === "object" &&
							!Array.isArray(responseLinks)
						) {
							for (const [linkName, linkValue] of Object.entries(
								responseLinks,
							)) {
								if (!linkValue || typeof linkValue !== "object") continue;
								const linkPointer = joinPointer([
									"components",
									"responses",
									name,
									"links",
									linkName,
								]);
								const linkKey = nodeKey(uri, linkPointer);
								links.set(linkKey, {
									uri,
									pointer: linkPointer,
									node: linkValue,
									name: linkName,
								});
							}
						}
					}

					// Also index requestBody components as requestBodies
					if (section === "requestBodies") {
						const requestBodyKey = nodeKey(uri, pointer);
						requestBodies.set(requestBodyKey, {
							uri,
							pointer,
							node: value,
						});

						// Also collect media types from requestBody.content
						const requestBodyNode = value as Record<string, unknown>;
						const content = requestBodyNode["content"];
						if (
							content &&
							typeof content === "object" &&
							!Array.isArray(content)
						) {
							for (const [mediaType, mediaTypeValue] of Object.entries(
								content,
							)) {
								if (!mediaTypeValue || typeof mediaTypeValue !== "object")
									continue;
								const mediaTypePointer = joinPointer([
									"components",
									"requestBodies",
									name,
									"content",
									mediaType,
								]);
								const mediaTypeKey = nodeKey(uri, mediaTypePointer);
								mediaTypes.set(mediaTypeKey, {
									uri,
									pointer: mediaTypePointer,
									node: mediaTypeValue,
									mediaType,
								});

								// Collect schema under components.requestBodies.*.content.*.schema
								const compRbSchema = (
									mediaTypeValue as Record<string, unknown>
								)["schema"] as Record<string, unknown> | undefined;
								if (compRbSchema && typeof compRbSchema === "object") {
									const schemaPointer = joinPointer([
										"components",
										"requestBodies",
										name,
										"content",
										mediaType,
										"schema",
									]);
									const schemaKey = nodeKey(uri, schemaPointer);
									schemas.set(schemaKey, {
										uri,
										pointer: schemaPointer,
										node: compRbSchema,
									});
								}

								// Collect examples from mediaType.examples
								const mediaTypeExamples = (
									mediaTypeValue as Record<string, unknown>
								)["examples"];
								if (
									mediaTypeExamples &&
									typeof mediaTypeExamples === "object" &&
									!Array.isArray(mediaTypeExamples)
								) {
									for (const [exampleName, exampleValue] of Object.entries(
										mediaTypeExamples,
									)) {
										if (!exampleValue || typeof exampleValue !== "object")
											continue;
										const examplePointer = joinPointer([
											"components",
											"requestBodies",
											name,
											"content",
											mediaType,
											"examples",
											exampleName,
										]);
										const exampleKey = nodeKey(uri, examplePointer);
										examples.set(exampleKey, {
											uri,
											pointer: examplePointer,
											node: exampleValue,
											name: exampleName,
										});
									}
								}
							}
						}
					}

					// Also index header components as headers
					if (section === "headers") {
						const headerKey = nodeKey(uri, pointer);
						headers.set(headerKey, {
							uri,
							pointer,
							node: value,
							name,
						});

						// Collect examples from header.examples
						const headerNode = value as Record<string, unknown>;
						const headerExamples = headerNode["examples"];
						if (
							headerExamples &&
							typeof headerExamples === "object" &&
							!Array.isArray(headerExamples)
						) {
							for (const [exampleName, exampleValue] of Object.entries(
								headerExamples,
							)) {
								if (!exampleValue || typeof exampleValue !== "object") continue;
								const examplePointer = joinPointer([
									"components",
									"headers",
									name,
									"examples",
									exampleName,
								]);
								const exampleKey = nodeKey(uri, examplePointer);
								examples.set(exampleKey, {
									uri,
									pointer: examplePointer,
									node: exampleValue,
									name: exampleName,
								});
							}
						}
					}

					// Also index example components as examples
					if (section === "examples") {
						const exampleKey = nodeKey(uri, pointer);
						examples.set(exampleKey, {
							uri,
							pointer,
							node: value,
							name,
						});
					}

					// Also index link components as links
					if (section === "links") {
						const linkKey = nodeKey(uri, pointer);
						links.set(linkKey, {
							uri,
							pointer,
							node: value,
							name,
						});
					}

					// Also index callback components as callbacks
					if (section === "callbacks") {
						const callbackKey = nodeKey(uri, pointer);
						callbacks.set(callbackKey, {
							uri,
							pointer,
							node: value,
							name,
						});
					}
				}
			}
		}

		// Handle standalone schema fragments (not wrapped in components)
		// If the document root looks like a schema object (has type, properties, etc.)
		// but is NOT a full OpenAPI document, treat it as a standalone schema
		const isRootOpenAPIDoc =
			typeof root["openapi"] === "string" ||
			root["info"] !== undefined ||
			root["paths"] !== undefined ||
			root["components"] !== undefined ||
			root["webhooks"] !== undefined;

		if (!isRootOpenAPIDoc) {
			const docType = identifyDocumentType(root);

			// Check if root looks like a schema object
			const looksLikeSchema =
				typeof root["type"] === "string" &&
				root["properties"] !== undefined &&
				typeof root["properties"] === "object";

			if (looksLikeSchema || docType === "schema") {
				// Index as a standalone schema fragment
				const schemaKey = nodeKey(uri, "#");
				schemas.set(schemaKey, {
					uri,
					pointer: "#",
					node: root,
				});
			}

			// Check if root looks like a parameter object
			if (docType === "parameter") {
				const paramKey = nodeKey(uri, "#");
				parameters.set(paramKey, {
					uri,
					pointer: "#",
					node: root,
					name: typeof root["name"] === "string" ? root["name"] : undefined,
					in: typeof root["in"] === "string" ? root["in"] : undefined,
				});
			}

			// Check if root looks like a response object
			if (docType === "response") {
				const responseKey = nodeKey(uri, "#");
				responses.set(responseKey, {
					uri,
					pointer: "#",
					node: root,
					statusCode:
						typeof root["statusCode"] === "string"
							? root["statusCode"]
							: undefined,
				});
			}

			// Check if root looks like a requestBody object (has content field)
			if (
				root["content"] !== undefined &&
				typeof root["content"] === "object" &&
				!("openapi" in root) &&
				!("info" in root) &&
				!("paths" in root) &&
				!("components" in root) &&
				!("webhooks" in root) &&
				!("name" in root) &&
				!("in" in root)
			) {
				const requestBodyKey = nodeKey(uri, "#");
				requestBodies.set(requestBodyKey, {
					uri,
					pointer: "#",
					node: root,
				});
			}

			// Check if root looks like an example object
			if (docType === "example") {
				const exampleKey = nodeKey(uri, "#");
				examples.set(exampleKey, {
					uri,
					pointer: "#",
					node: root,
				});
			}

			// Check if root looks like a PathItem fragment (has HTTP methods)
			if (docType === "path-item") {
				// Index the PathItem itself (using a placeholder path string for fragment documents)
				const pathItemPointer = "#";
				const pathItem: PathItemRef = {
					uri,
					pointer: pathItemPointer,
					definitionUri: uri, // Fragment is always defined in its own file
					definitionPointer: pathItemPointer,
					// No referenceUri/referencePointer for fragments
					node: root as any,
				};
				// Use a special key for fragment path items
				const fragmentPathKey = `__fragment__${uri}`;
				pushMap(pathsByString, fragmentPathKey, pathItem);
				pathItemsByPointer.set(nodeKey(uri, pathItemPointer), pathItem);
				pushMap(
					pathItemsToPaths,
					nodeKey(uri, pathItemPointer),
					fragmentPathKey,
				);

				// Process operations within the PathItem fragment
				const operations: OperationRef[] = [];
				for (const method of HTTP_METHODS) {
					const operationValue = root[method as keyof typeof root];
					if (!operationValue || typeof operationValue !== "object") continue;
					const opPointer = joinPointer([method]);
					const operation: OperationRef = {
						uri,
						pointer: opPointer,
						definitionUri: uri, // Fragment operations are always defined in fragment file
						definitionPointer: opPointer,
						// No referenceUri/referencePointer for fragments
						method,
						node: operationValue as any,
					};
					operations.push(operation);
					operationsByPointer.set(nodeKey(uri, opPointer), operation);

					// Index operations under the PathItem owner
					const ownerKey = `${uri}#${pathItemPointer}`;
					pushMap(operationsByOwner, ownerKey, operation);

					// Collect operation-level parameters
					const opParams = (operationValue as Record<string, unknown>)[
						"parameters"
					];
					if (Array.isArray(opParams)) {
						for (let i = 0; i < opParams.length; i++) {
							const param = opParams[i];
							if (!param || typeof param !== "object") continue;

							// Handle $ref parameters
							let effectiveParam: Record<string, unknown> | undefined =
								param as Record<string, unknown>;
							const paramRef = (param as Record<string, unknown>)["$ref"];
							if (typeof paramRef === "string") {
								try {
									const target = options.resolver.deref<
										Record<string, unknown>
									>({ uri, pointer: opPointer }, paramRef);
									if (target && typeof target === "object") {
										effectiveParam = target;
									}
								} catch {
									effectiveParam = undefined;
								}
							}

							if (effectiveParam) {
								const paramPointer = joinPointer([
									method,
									"parameters",
									String(i),
								]);
								const paramKey = nodeKey(uri, paramPointer);
								parameters.set(paramKey, {
									uri,
									pointer: paramPointer,
									node: effectiveParam,
									name:
										typeof effectiveParam.name === "string"
											? effectiveParam.name
											: undefined,
									in:
										typeof effectiveParam.in === "string"
											? effectiveParam.in
											: undefined,
								});
							}
						}
					}

					// Collect operation-level request body
					const opRequestBody = (operationValue as Record<string, unknown>)[
						"requestBody"
					];
					if (opRequestBody && typeof opRequestBody === "object") {
						let effectiveRequestBody: Record<string, unknown> | undefined =
							opRequestBody as Record<string, unknown>;
						const rbRef = (opRequestBody as Record<string, unknown>)["$ref"];
						if (typeof rbRef === "string") {
							try {
								const target = options.resolver.deref<Record<string, unknown>>(
									{ uri, pointer: opPointer },
									rbRef,
								);
								if (target && typeof target === "object") {
									effectiveRequestBody = target;
								}
							} catch {
								effectiveRequestBody = undefined;
							}
						}

						if (effectiveRequestBody) {
							const rbPointer = joinPointer([method, "requestBody"]);
							const rbKey = nodeKey(uri, rbPointer);
							requestBodies.set(rbKey, {
								uri,
								pointer: rbPointer,
								node: effectiveRequestBody,
							});

							// Collect schemas under requestBody.content.*.schema
							const rbContent = effectiveRequestBody["content"] as
								| Record<string, unknown>
								| undefined;
							if (rbContent && typeof rbContent === "object") {
								for (const [mediaType, mediaTypeValue] of Object.entries(
									rbContent,
								)) {
									if (!mediaTypeValue || typeof mediaTypeValue !== "object")
										continue;
									const mediaTypePointer = joinPointer([
										method,
										"requestBody",
										"content",
										mediaType,
									]);
									const mediaTypeKey = nodeKey(uri, mediaTypePointer);
									mediaTypes.set(mediaTypeKey, {
										uri,
										pointer: mediaTypePointer,
										node: mediaTypeValue,
										mediaType,
									});

									const rbSchema = (mediaTypeValue as Record<string, unknown>)[
										"schema"
									] as Record<string, unknown> | undefined;
									if (rbSchema && typeof rbSchema === "object") {
										const schemaPointer = joinPointer([
											method,
											"requestBody",
											"content",
											mediaType,
											"schema",
										]);
										const schemaKey = nodeKey(uri, schemaPointer);
										schemas.set(schemaKey, {
											uri,
											pointer: schemaPointer,
											node: rbSchema,
										});
									}
								}
							}
						}
					}

					// Collect operation-level responses
					const opResponses = (operationValue as Record<string, unknown>)[
						"responses"
					];
					if (
						opResponses &&
						typeof opResponses === "object" &&
						!Array.isArray(opResponses)
					) {
						for (const [statusCode, responseValue] of Object.entries(
							opResponses,
						)) {
							if (!responseValue || typeof responseValue !== "object") continue;

							// Handle $ref responses
							let effectiveResponse: Record<string, unknown> | undefined =
								responseValue as Record<string, unknown>;
							const responseRef = (responseValue as Record<string, unknown>)[
								"$ref"
							];
							if (typeof responseRef === "string") {
								try {
									const target = options.resolver.deref<
										Record<string, unknown>
									>({ uri, pointer: opPointer }, responseRef);
									if (target && typeof target === "object") {
										effectiveResponse = target;
									}
								} catch {
									effectiveResponse = undefined;
								}
							}

							if (effectiveResponse) {
								const responsePointer = joinPointer([
									method,
									"responses",
									statusCode,
								]);
								const responseKey = nodeKey(uri, responsePointer);
								responses.set(responseKey, {
									uri,
									pointer: responsePointer,
									node: effectiveResponse,
									statusCode,
								});

								// Collect schemas under response.content.*.schema
								const responseContent = effectiveResponse["content"] as
									| Record<string, unknown>
									| undefined;
								if (responseContent && typeof responseContent === "object") {
									for (const [mediaType, mediaTypeValue] of Object.entries(
										responseContent,
									)) {
										if (!mediaTypeValue || typeof mediaTypeValue !== "object")
											continue;
										const mediaTypePointer = joinPointer([
											method,
											"responses",
											statusCode,
											"content",
											mediaType,
										]);
										const mediaTypeKey = nodeKey(uri, mediaTypePointer);
										mediaTypes.set(mediaTypeKey, {
											uri,
											pointer: mediaTypePointer,
											node: mediaTypeValue,
											mediaType,
										});

										const responseSchema = (
											mediaTypeValue as Record<string, unknown>
										)["schema"] as Record<string, unknown> | undefined;
										if (responseSchema && typeof responseSchema === "object") {
											const schemaPointer = joinPointer([
												method,
												"responses",
												statusCode,
												"content",
												mediaType,
												"schema",
											]);
											const schemaKey = nodeKey(uri, schemaPointer);
											schemas.set(schemaKey, {
												uri,
												pointer: schemaPointer,
												node: responseSchema,
											});
										}
									}
								}
							}
						}
					}

					// Collect operation-level security requirements
					const opSecurity = (operationValue as Record<string, unknown>)[
						"security"
					];
					if (Array.isArray(opSecurity)) {
						for (let i = 0; i < opSecurity.length; i++) {
							const securityReq = opSecurity[i];
							if (!securityReq || typeof securityReq !== "object") continue;
							const securityPointer = joinPointer([
								method,
								"security",
								String(i),
							]);
							const securityKey = nodeKey(uri, securityPointer);
							securityRequirements.set(securityKey, {
								uri,
								pointer: securityPointer,
								node: securityReq,
								level: "operation",
							});
						}
					}
				}

				// Collect path-level parameters for PathItem fragment
				const pathParams = root["parameters"];
				if (Array.isArray(pathParams)) {
					for (let i = 0; i < pathParams.length; i++) {
						const param = pathParams[i];
						if (!param || typeof param !== "object") continue;

						// Handle $ref parameters
						let effectiveParam: Record<string, unknown> | undefined =
							param as Record<string, unknown>;
						const paramRef = (param as Record<string, unknown>)["$ref"];
						if (typeof paramRef === "string") {
							try {
								const target = options.resolver.deref<Record<string, unknown>>(
									{ uri, pointer: pathItemPointer },
									paramRef,
								);
								if (target && typeof target === "object") {
									effectiveParam = target;
								}
							} catch {
								effectiveParam = undefined;
							}
						}

						if (effectiveParam) {
							const paramPointer = joinPointer(["parameters", String(i)]);
							const paramKey = nodeKey(uri, paramPointer);
							parameters.set(paramKey, {
								uri,
								pointer: paramPointer,
								node: effectiveParam,
								name:
									typeof effectiveParam.name === "string"
										? effectiveParam.name
										: undefined,
								in:
									typeof effectiveParam.in === "string"
										? effectiveParam.in
										: undefined,
							});
						}
					}
				}
			}
		}
	}

	const version = determineProjectVersion(options.docs);

	const index: ProjectIndex = {
		version,
		pathsByString,
		pathItemsToPaths,
		operationsByOwner,
		components,
		schemas,
		parameters,
		responses,
		requestBodies,
		headers,
		mediaTypes,
		securityRequirements,
		examples,
		links,
		callbacks,
		references,
		documents,
		scopeProvider: createScopeProvider(
			documents,
			pathItemsByPointer,
			operationsByPointer,
		),
	};

	return index;
}

function determineProjectVersion(docs: Map<string, ParsedDocument>): string {
	for (const doc of docs.values()) {
		if (doc.version !== "unknown") return doc.version;
	}
	return "unknown";
}

function createScopeProvider(
	documents: Map<string, Record<string, unknown>>,
	pathItems: Map<string, PathItemRef>,
	operations: Map<string, OperationRef>,
) {
	return (uri: string, pointer: JsonPointer): ScopeContext | null => {
		const document = documents.get(uri);
		if (!document) return null;
		const segments = splitPointer(pointer);
		const ancestors: Array<{ kind: string; pointer: JsonPointer }> = [];
		let pathContext: ScopeContext["path"];
		let operationContext: ScopeContext["operation"];
		let parameterContext: ScopeContext["parameter"];
		let securityContext: ScopeContext["security"];
		let componentContext: ScopeContext["component"];

		for (let i = 0; i < segments.length; i++) {
			const kind = segments[i]!;
			const ancestorPointer = joinPointer(segments.slice(0, i + 1));
			ancestors.push({ kind, pointer: ancestorPointer });

			if (kind === "paths" && i + 1 < segments.length) {
				const pathName = segments[i + 1]!;
				const pointer = joinPointer(["paths", pathName]);
				pathContext = { name: pathName, pointer };
			}

			if (pathContext && !operationContext && i + 1 < segments.length) {
				const candidate = segments[i + 1]!;
				if (HTTP_METHODS.includes(candidate as any)) {
					const pointer = joinPointer(["paths", pathContext.name, candidate]);
					operationContext = {
						method: candidate,
						pointer,
					} as ScopeContext["operation"];
				}
			}

			if (kind === "parameters" && i + 1 < segments.length) {
				const paramIndex = segments[i + 1]!;
				const pointer = joinPointer(segments.slice(0, i + 2));
				const param = getValueAtPointer(document, pointer) as
					| Record<string, unknown>
					| undefined;
				if (param && typeof param === "object") {
					parameterContext = {
						pointer,
						name: typeof param.name === "string" ? param.name : undefined,
						in: typeof param.in === "string" ? param.in : undefined,
					};
				}
			}

			if (kind === "security") {
				const pointer = joinPointer(segments.slice(0, i + 1));
				const level = operationContext ? "operation" : "root";
				const requirement = getValueAtPointer(document, pointer);
				const scheme =
					Array.isArray(requirement) && requirement.length
						? Object.keys((requirement[0] as Record<string, unknown>) ?? {})[0]
						: undefined;
				securityContext = { level, pointer, scheme };
			}

			if (segments[0] === "components" && segments.length >= 3) {
				const section = segments[1];
				const name = segments[2];
				if (typeof section === "string" && typeof name === "string") {
					const pointer = joinPointer(["components", section, name]);
					componentContext = { type: section, name, pointer };
				}
			}
		}

		return {
			documentUri: uri,
			pointer,
			ancestors,
			path: pathContext,
			operation: operationContext,
			parameter: parameterContext,
			security: securityContext,
			component: componentContext,
		};
	};
}

function pushMap<K, V>(map: Map<K, V[]>, key: K, value: V) {
	const list = map.get(key);
	if (list) list.push(value);
	else map.set(key, [value]);
}

function nodeKey(uri: string, pointer: JsonPointer): string {
	return `${uri}#${pointer}`;
}
