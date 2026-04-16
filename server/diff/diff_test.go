package diff

import (
	"strings"
	"testing"
)

func v1() []byte {
	return []byte(`openapi: "3.0.3"
info:
  title: T
  version: "1.0"
paths:
  /a:
    get:
      summary: ok
      responses:
        "200":
          description: ok
`)
}

func v2Breaking() []byte {
	return []byte(`openapi: "3.0.3"
info:
  title: T
  version: "1.0"
paths: {}
`)
}

func TestCompare_identical(t *testing.T) {
	b := v1()
	res, err := Compare(b, b, CompareOpts{})
	if err != nil {
		t.Fatal(err)
	}
	if res.TotalChanges() != 0 || res.TotalBreakingChanges() != 0 {
		t.Fatalf("expected no changes, got total=%d breaking=%d", res.TotalChanges(), res.TotalBreakingChanges())
	}
}

func TestCompare_detectsChange(t *testing.T) {
	res, err := Compare(v1(), v2Breaking(), CompareOpts{})
	if err != nil {
		t.Fatal(err)
	}
	if res.TotalChanges() == 0 {
		t.Fatal("expected some changes")
	}
}

func TestCompare_rejectsEmpty(t *testing.T) {
	_, err := Compare([]byte{}, v1(), CompareOpts{})
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestFormatJSON_shape(t *testing.T) {
	res, err := Compare(v1(), v2Breaking(), CompareOpts{})
	if err != nil {
		t.Fatal(err)
	}
	var buf strings.Builder
	if err := FormatJSON(res, &buf); err != nil {
		t.Fatal(err)
	}
	s := buf.String()
	if !strings.Contains(s, `"totalChanges"`) || !strings.Contains(s, `"totalBreakingChanges"`) {
		t.Fatalf("unexpected json: %s", s)
	}
}
