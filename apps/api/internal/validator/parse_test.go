package validator

import (
	"bytes"
	"github.com/gin-gonic/gin/binding"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

type parseTestBody struct {
	Name  string  `json:"name" label:"Name" binding:"required,not_blank" msg_required:"Name is required"`
	Price float64 `json:"selling_price" binding:"required,gt=0"`
	Tags  []int   `json:"tags"`
}

func bind(t *testing.T, body string) (int, []byte) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	Init()
	r := gin.New()
	r.POST("/", func(c *gin.Context) {
		if _, ok := BindJSON[parseTestBody](c); ok {
			c.Status(http.StatusOK)
		}
	})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString(body)))
	return w.Code, w.Body.Bytes()
}

func TestBindJSON(t *testing.T) {
	tests := []struct {
		name     string
		body     string
		wantCode int
		contains []string
	}{
		{"valid", `{"name":"x","selling_price":1.5}`, http.StatusOK, nil},
		{"msg override", `{"selling_price":1}`, http.StatusBadRequest, []string{`"field":"name"`, `"Name is required"`, `"REQUIRED_FIELD"`}},
		{"whitespace-only is trimmed to empty, so required", `{"name":"   ","selling_price":1}`, http.StatusBadRequest, []string{`"REQUIRED_FIELD"`, `"Name is required"`}},
		{"humanized label", `{"name":"x","selling_price":-1}`, http.StatusBadRequest, []string{`"field":"selling_price"`, `"Selling price must be greater than 0"`}},
		{"type error", `{"name":"x","selling_price":"abc"}`, http.StatusBadRequest, []string{`"INVALID_TYPE"`, `"field":"selling_price"`, `"Selling price must be a number"`}},
		{"nested type error", `{"name":"x","selling_price":1,"tags":["a"]}`, http.StatusBadRequest, []string{`"INVALID_TYPE"`, `"field":"tags"`, `a whole number`}},
		{"malformed json", `{"name":`, http.StatusBadRequest, []string{`"INVALID_REQUEST"`}},
		{"empty body", ``, http.StatusBadRequest, []string{`"INVALID_REQUEST"`}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			code, body := bind(t, tt.body)
			if code != tt.wantCode {
				t.Fatalf("code = %d, want %d, body %s", code, tt.wantCode, body)
			}
			for _, want := range tt.contains {
				if !bytes.Contains(body, []byte(want)) {
					t.Errorf("body %s missing %s", body, want)
				}
			}
		})
	}
}

type trimTestBody struct {
	Email    string `json:"email" binding:"required,email"`
	Code     string `json:"code" binding:"required,min=2"`
	Password string `json:"password" trim:"-" binding:"required"`
}

func TestBindJSONTrimsBeforeValidating(t *testing.T) {
	gin.SetMode(gin.TestMode)
	Init()

	run := func(body string) (*trimTestBody, int) {
		var got *trimTestBody
		r := gin.New()
		r.POST("/", func(c *gin.Context) {
			if b, ok := BindJSON[trimTestBody](c); ok {
				got = b
				c.Status(http.StatusOK)
			}
		})
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString(body)))
		return got, w.Code
	}

	got, code := run(`{"email":"  ada@example.com ","code":" ab ","password":" pw "}`)
	if code != http.StatusOK {
		t.Fatalf("padded but valid input rejected: %d", code)
	}
	if got.Email != "ada@example.com" || got.Code != "ab" {
		t.Fatalf("not trimmed: %+v", got)
	}
	if got.Password != " pw " {
		t.Fatalf("trim:\"-\" field was modified: %q", got.Password)
	}

	if _, code := run(`{"email":"a@b.co","code":" a ","password":"x"}`); code != http.StatusBadRequest {
		t.Fatalf("min=2 must apply to the trimmed value, got %d", code)
	}
}

type nestedItem struct {
	Name string `json:"name" binding:"required,min=2"`
}

type nestedTestBody struct {
	Images    []string     `json:"images" binding:"required,min=1,dive,url"`
	PublicIDs []string     `json:"image_public_ids" label:"Image public IDs" binding:"required,samelen=Images,dive,required" msg_samelen:"Provide one public ID per image"`
	Items     []nestedItem `json:"items" binding:"unique=Name,dive"`
	Stock     *int         `json:"stock" binding:"required,min=0,max=10"`
	Price     int          `json:"price" binding:"required,gt=0"`
	Offer     *int         `json:"offer" binding:"omitempty,gt=0,ltfield=Price"`
}

func bindNested(t *testing.T, body string) (int, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	Init()
	r := gin.New()
	r.POST("/", func(c *gin.Context) {
		if _, ok := BindJSON[nestedTestBody](c); ok {
			c.Status(http.StatusOK)
		}
	})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString(body)))
	return w.Code, w.Body.String()
}

func TestBindJSONFieldPathsAndCodes(t *testing.T) {
	const valid = `"images":["https://x.io/a.png"],"image_public_ids":["a"],"stock":0,"price":100`

	tests := []struct {
		name     string
		body     string
		contains []string
	}{
		{"valid, zero stock allowed", `{` + valid + `}`, nil},
		{"dive item path", `{"images":["https://x.io/a.png","nope"],"image_public_ids":["a","b"],"stock":1,"price":1}`,
			[]string{`"field":"images.1"`, `"INVALID_URL"`, `"Images must be a valid URL"`}},
		{"nested struct path", `{` + valid + `,"items":[{"name":"ok"},{"name":"x"}]}`,
			[]string{`"field":"items.1.name"`, `"TOO_SHORT"`, `"Name must be at least 2 characters"`}},
		{"dive required uses json name", `{"images":["https://x.io/a.png"],"image_public_ids":[""],"stock":1,"price":1}`,
			[]string{`"field":"image_public_ids.0"`, `"REQUIRED_FIELD"`, `"Image public IDs is required"`}},
		{"samelen", `{"images":["https://x.io/a.png","https://x.io/b.png"],"image_public_ids":["a"],"stock":1,"price":1}`,
			[]string{`"field":"image_public_ids"`, `"LENGTH_MISMATCH"`, `"Provide one public ID per image"`}},
		{"unique", `{` + valid + `,"items":[{"name":"ab"},{"name":"ab"}]}`,
			[]string{`"field":"items"`, `"DUPLICATE_ITEM"`}},
		{"numeric max is a range, not characters", `{"images":["https://x.io/a.png"],"image_public_ids":["a"],"stock":11,"price":1}`,
			[]string{`"field":"stock"`, `"OUT_OF_RANGE"`, `"Stock must be at most 10"`}},
		{"missing pointer int is required", `{"images":["https://x.io/a.png"],"image_public_ids":["a"],"price":1}`,
			[]string{`"field":"stock"`, `"REQUIRED_FIELD"`}},
		{"ltfield", `{` + valid + `,"offer":100}`,
			[]string{`"field":"offer"`, `"OUT_OF_RANGE"`, `"Offer must be less than Price"`}},
		{"offer below price ok", `{` + valid + `,"offer":99}`, nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			code, body := bindNested(t, tt.body)
			if tt.contains == nil {
				if code != http.StatusOK {
					t.Fatalf("want 200, got %d %s", code, body)
				}
				return
			}
			if code != http.StatusBadRequest {
				t.Fatalf("want 400, got %d %s", code, body)
			}
			for _, want := range tt.contains {
				if !strings.Contains(body, want) {
					t.Errorf("body %s missing %s", body, want)
				}
			}
		})
	}
}

func TestToSnake(t *testing.T) {
	for in, want := range map[string]string{
		"ImagePublicIDs": "image_public_ids",
		"SellingPrice":   "selling_price",
		"ID":             "id",
		"Name":           "name",
		"URLValue":       "url_value",
		"ImageIDsName":   "image_ids_name",
		"URLs":           "urls",
	} {
		if got := toSnake(in); got != want {
			t.Errorf("toSnake(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestUUIDAcceptsEitherCase(t *testing.T) {
	Init()
	type body struct {
		ID string `binding:"uuid"`
	}
	for id, want := range map[string]bool{
		"7c9e6679-7425-40de-944b-e07fc1f90ae7":          true,
		"7C9E6679-7425-40DE-944B-E07FC1F90AE7":          true,
		"7c9e6679742540de944be07fc1f90ae7":              false,
		"{7c9e6679-7425-40de-944b-e07fc1f90ae7}":        false,
		"urn:uuid:7c9e6679-7425-40de-944b-e07fc1f90ae7": false,
		"not-a-uuid": false,
	} {
		err := binding.Validator.ValidateStruct(body{ID: id})
		if (err == nil) != want {
			t.Errorf("uuid %q: err = %v, want valid %v", id, err, want)
		}
	}
}

func TestPersonNameAcceptsRealNames(t *testing.T) {
	Init()
	type body struct {
		Name string `binding:"personname"`
	}
	for name, want := range map[string]bool{
		"Ada Lovelace":     true,
		"José Álvarez":     true,
		"O'Brien":          true,
		"O’Brien":          true,
		"Mary-Jane Watson": true,
		"J. R. Tolkien":    true,
		"Zoë":              true,
		"Nguyễn Văn An":    true,
		"सुप्रिम खत्री":    true, // Devanagari: letters plus combining marks
		"李小龙":              true,
		"-Ann":             false, // must start with a letter
		"'quote":           false,
		"Ann2":             false,
		"Ann_Lee":          false,
		"Ann\tLee":         false,
		"Ann\nLee":         false,
		"<script>":         false,
	} {
		err := binding.Validator.ValidateStruct(body{Name: name})
		if (err == nil) != want {
			t.Errorf("personname %q: err = %v, want valid %v", name, err, want)
		}
	}
}
