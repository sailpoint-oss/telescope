package rules

import (
	"fmt"
	"regexp"
	"strings"
	"unicode"

	"github.com/sailpoint-oss/telescope/server/openapi"
)

// ValidationResult describes the outcome of a single validator check.
type ValidationResult struct {
	Valid   bool
	Message string
}

// Validator checks a string value for a named field and returns a result.
type Validator func(value string, field string) *ValidationResult

func pass() *ValidationResult {
	return &ValidationResult{Valid: true}
}

func fail(msg string) *ValidationResult {
	return &ValidationResult{Valid: false, Message: msg}
}

// V provides composable validator constructors. Use V.Required(),
// V.MinLength(n), V.All(...), etc. to build field-level validation.
var V = struct {
	Required  func(msg ...string) Validator
	MinLength func(min int, msg ...string) Validator
	MaxLength func(max int, msg ...string) Validator
	Pattern   func(re *regexp.Regexp, msg ...string) Validator
	OneOf     func(allowed []string, msg ...string) Validator
	TitleCase func(msg ...string) Validator
	CamelCase func(msg ...string) Validator
	KebabCase func(msg ...string) Validator
	Custom    func(fn func(string) bool, msg string) Validator
	All       func(vs ...Validator) Validator
	Any       func(vs ...Validator) Validator
	Optional  func(v Validator) Validator
}{
	Required:  validatorRequired,
	MinLength: validatorMinLength,
	MaxLength: validatorMaxLength,
	Pattern:   validatorPattern,
	OneOf:     validatorOneOf,
	TitleCase: validatorTitleCase,
	CamelCase: validatorCamelCase,
	KebabCase: validatorKebabCase,
	Custom:    validatorCustom,
	All:       validatorAll,
	Any:       validatorAny,
	Optional:  validatorOptional,
}

func defaultMsg(custom []string, fallback string) string {
	if len(custom) > 0 && custom[0] != "" {
		return custom[0]
	}
	return fallback
}

func validatorRequired(msg ...string) Validator {
	return func(value string, field string) *ValidationResult {
		if value == "" {
			return fail(defaultMsg(msg, fmt.Sprintf("%s is required", field)))
		}
		return pass()
	}
}

func validatorMinLength(min int, msg ...string) Validator {
	return func(value string, field string) *ValidationResult {
		if value == "" {
			return pass()
		}
		if len(value) < min {
			return fail(defaultMsg(msg, fmt.Sprintf("%s should be at least %d characters", field, min)))
		}
		return pass()
	}
}

func validatorMaxLength(max int, msg ...string) Validator {
	return func(value string, field string) *ValidationResult {
		if value == "" {
			return pass()
		}
		if len(value) > max {
			return fail(defaultMsg(msg, fmt.Sprintf("%s should be at most %d characters", field, max)))
		}
		return pass()
	}
}

func validatorPattern(re *regexp.Regexp, msg ...string) Validator {
	return func(value string, field string) *ValidationResult {
		if value == "" {
			return pass()
		}
		if !re.MatchString(value) {
			return fail(defaultMsg(msg, fmt.Sprintf("%s must match pattern %s", field, re.String())))
		}
		return pass()
	}
}

func validatorOneOf(allowed []string, msg ...string) Validator {
	return func(value string, field string) *ValidationResult {
		if value == "" {
			return pass()
		}
		for _, a := range allowed {
			if value == a {
				return pass()
			}
		}
		return fail(defaultMsg(msg, fmt.Sprintf("%s must be one of: %s", field, strings.Join(allowed, ", "))))
	}
}

func validatorTitleCase(msg ...string) Validator {
	return func(value string, field string) *ValidationResult {
		if value == "" {
			return pass()
		}
		if !IsCapitalized(value) {
			return fail(defaultMsg(msg, fmt.Sprintf("%s should start with an uppercase letter", field)))
		}
		return pass()
	}
}

func validatorCamelCase(msg ...string) Validator {
	return func(value string, field string) *ValidationResult {
		if value == "" {
			return pass()
		}
		if !unicode.IsLower(rune(value[0])) {
			return fail(defaultMsg(msg, fmt.Sprintf("%s should be camelCase", field)))
		}
		for _, r := range value {
			if r == '-' || r == '_' {
				return fail(defaultMsg(msg, fmt.Sprintf("%s should be camelCase", field)))
			}
		}
		return pass()
	}
}

func validatorKebabCase(msg ...string) Validator {
	return func(value string, field string) *ValidationResult {
		if value == "" {
			return pass()
		}
		if !IsKebabCase(value) {
			return fail(defaultMsg(msg, fmt.Sprintf("%s should be kebab-case", field)))
		}
		return pass()
	}
}

func validatorCustom(fn func(string) bool, msg string) Validator {
	return func(value string, field string) *ValidationResult {
		if fn(value) {
			return pass()
		}
		return fail(msg)
	}
}

func validatorAll(vs ...Validator) Validator {
	return func(value string, field string) *ValidationResult {
		for _, v := range vs {
			if result := v(value, field); !result.Valid {
				return result
			}
		}
		return pass()
	}
}

func validatorAny(vs ...Validator) Validator {
	return func(value string, field string) *ValidationResult {
		var lastMsg string
		for _, v := range vs {
			result := v(value, field)
			if result.Valid {
				return pass()
			}
			lastMsg = result.Message
		}
		return fail(lastMsg)
	}
}

func validatorOptional(v Validator) Validator {
	return func(value string, field string) *ValidationResult {
		if value == "" {
			return pass()
		}
		return v(value, field)
	}
}

// FieldValidation pairs a field accessor with a validator for use with
// ValidateOperationFields.
type FieldValidation struct {
	Name     string
	Validate Validator
}

// Field creates a FieldValidation binding a struct field name to a validator.
func Field(name string, v Validator) FieldValidation {
	return FieldValidation{Name: name, Validate: v}
}

// ValidateOperationFields returns an Operation visitor that validates the
// specified fields on each operation.
func ValidateOperationFields(fields ...FieldValidation) func(string, string, *openapi.Operation, *Reporter) {
	return func(path string, method string, op *openapi.Operation, r *Reporter) {
		for _, f := range fields {
			value, loc := operationFieldValue(op, f.Name)
			result := f.Validate(value, f.Name)
			if !result.Valid {
				r.At(loc, "%s", result.Message)
			}
		}
	}
}

// ValidateSchemaFields returns a Schema visitor that validates the specified
// fields on each schema.
func ValidateSchemaFields(fields ...FieldValidation) func(string, *openapi.Schema, string, *Reporter) {
	return func(name string, schema *openapi.Schema, pointer string, r *Reporter) {
		for _, f := range fields {
			value, loc := schemaFieldValue(schema, f.Name)
			result := f.Validate(value, f.Name)
			if !result.Valid {
				r.At(loc, "%s", result.Message)
			}
		}
	}
}

func operationFieldValue(op *openapi.Operation, field string) (string, openapi.Loc) {
	switch field {
	case "OperationID", "operationId":
		return op.OperationID, op.OperationIDLoc
	case "Summary", "summary":
		return op.Summary, op.Loc
	case "Description", "description":
		return op.Description.Text, op.Loc
	default:
		return "", op.Loc
	}
}

func schemaFieldValue(schema *openapi.Schema, field string) (string, openapi.Loc) {
	switch field {
	case "Type", "type":
		return schema.Type, schema.TypeLoc
	case "Title", "title":
		return schema.Title, schema.Loc
	case "Description", "description":
		return schema.Description.Text, schema.Loc
	case "Format", "format":
		return schema.Format, schema.Loc
	default:
		return "", schema.Loc
	}
}
