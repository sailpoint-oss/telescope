I want to examine the current Volar server configuration

We should have a couple of languages and services defined, with different scopes, and I think we have strayed a bit from that, and have some extra complexity.

First we should have an OpenAPI service

This service should do a few things

First it should use our custom OpenAPI Zod Schemas in the blueprint package, and when our service identitifies what kind of Schema each file is, we should use existing well maintained languages services for JSON and YAML to apply those Schemas and surface errors or discrepancies.
That part of the flow should be detailed conceptually here in the @better-language-service-utilization.md

Next our OpenAPI service will build all of the complete OpenAPI documents, starting by discovering ALL OpenAPI root specification documents, and then following the $ref's from that document, on down to resolve every $ref in every document used, until a complete specification is resolved. Then the rules should be run everywhere the rules apply, this is done via the engine in lens today I believe. These rules have access to all of the context that make up their document, sometimes that is only the file fragment if a schema file for example was made in a vaccum, but not actually used anywhere, or that context may include all of the root level information from a different document that defines the API root info, for things like servers, security, or root level extension information like the sailpoint API version.

Those rules (and generic rules loaded in via the users config file) then run their checks, and surface errors or diag events back up to the LSP server and to the client, this whole flow should allow for extremely thorough OpenAPI linting with the OpenAPI service,

Next we have another service, this second service is the `Additional Validation` service, and it used to do a number of simpler, but still very powerful checks. This service is actually very similar to the OpenAPI service, just without all the graph building and traversing. It has schemas both built in for linting the telescope configurtion file via its hardcoded path, which should always be done both when the file is open, and in a workspacediagnostics context. Next it has custom user registered schemas that are used to lint LSP style on the files that the user registered pattern points to, and then finally there is a set of generic user defined and user registered rules, these rules are completely arbitrary JSON/YAML style rules and are built similar to OpenAPI rules but without all the context, these are made to allow for TS validations to be run on the files that matter to people via whatever cutom logic they want.

It really should just be those two services today, please review our current LSP layout and determine where we have strayed from that design style, and plan out a step by step implementation guide for how we can return to that level of accuracy
