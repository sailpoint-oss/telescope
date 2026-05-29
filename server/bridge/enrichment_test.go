package bridge

import (
	"strings"
	"testing"

	"github.com/sailpoint-oss/barrelman"
)

func TestEnrichStructuralMessages_ResponseObject(t *testing.T) {
	diags := []barrelman.Diagnostic{{
		Code:    "oas3-schema",
		Message: "Properties 'allOf' are not valid",
		Data: map[string]string{
			"issueCode": "meta.additional-property",
			"pointer":   "/paths/~1users/get/responses/200/allOf",
		},
	}}
	enriched := enrichStructuralMessages(diags)
	if !strings.HasPrefix(enriched[0].Message, "Response Object:") {
		t.Fatalf("expected Response Object prefix, got %q", enriched[0].Message)
	}
}

func TestEnrichStructuralMessages_PathItemVsOperation(t *testing.T) {
	cases := []struct {
		pointer string
		want    string
	}{
		{"/paths/~1users/get/parameters/0", "Parameter Object"},
		{"/paths/~1users/get/requestBody", "Request Body Object"},
		{"/paths/~1users/get/responses/200/content", "Response Object"},
		{"/paths/~1users/get", "Operation"},
		{"/paths/~1users", "Path Item"},
		{"/components/schemas/Pet/allOf", "Schema Object"},
	}
	for _, tc := range cases {
		t.Run(tc.pointer, func(t *testing.T) {
			diags := []barrelman.Diagnostic{{
				Code:    "oas3-schema",
				Message: "Something is not valid",
				Data:    map[string]string{"pointer": tc.pointer},
			}}
			enriched := enrichStructuralMessages(diags)
			if !strings.HasPrefix(enriched[0].Message, tc.want+":") {
				t.Fatalf("pointer %q: expected prefix %q, got %q", tc.pointer, tc.want, enriched[0].Message)
			}
		})
	}
}

func TestEnrichStructuralMessages_UnknownPointerPassthrough(t *testing.T) {
	diags := []barrelman.Diagnostic{{
		Code:    "oas3-schema",
		Message: "Something is not valid",
		Data:    map[string]string{"pointer": "/servers/0/variables"},
	}}
	enriched := enrichStructuralMessages(diags)
	if enriched[0].Message != "Something is not valid" {
		t.Fatalf("unknown pointer should pass through unchanged: %q", enriched[0].Message)
	}
}

func TestEnrichStructuralMessages_NonSchemaCodeUntouched(t *testing.T) {
	diags := []barrelman.Diagnostic{{
		Code:    "custom-rule",
		Message: "Parameter must include a description",
		Data:    map[string]string{"pointer": "/paths/~1users/get/parameters/0"},
	}}
	enriched := enrichStructuralMessages(diags)
	if enriched[0].Message != "Parameter must include a description" {
		t.Fatalf("non-oas3-schema diagnostic should not be rewritten: %q", enriched[0].Message)
	}
}

func TestEnrichStructuralMessages_AvoidsDoublePrefix(t *testing.T) {
	diags := []barrelman.Diagnostic{{
		Code:    "oas3-schema",
		Message: "Response Object: already prefixed",
		Data:    map[string]string{"pointer": "/paths/~1users/get/responses/200/headers"},
	}}
	enriched := enrichStructuralMessages(diags)
	if enriched[0].Message != "Response Object: already prefixed" {
		t.Fatalf("should not double-prefix; got %q", enriched[0].Message)
	}
}
