package httpx

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
)

func serve(t *testing.T, path, target string, h gin.HandlerFunc) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET(path, h)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, target, nil))
	return w
}

func TestPathUUID(t *testing.T) {
	h := func(c *gin.Context) {
		if _, ok := PathUUID(c, "id", constants.InvalidProductID, "product ID"); ok {
			c.Status(http.StatusNoContent)
		}
	}

	if w := serve(t, "/p/:id", "/p/0b5c6a3e-6a8f-4f0e-9a51-2f7f4c1c8d10", h); w.Code != http.StatusNoContent {
		t.Fatalf("valid id: %d %s", w.Code, w.Body)
	}
	w := serve(t, "/p/:id", "/p/nope", h)
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), `"code":"INVALID_PRODUCT_ID"`) ||
		!strings.Contains(w.Body.String(), `"Invalid product ID"`) {
		t.Fatalf("invalid id: %d %s", w.Code, w.Body)
	}
}

func TestParsePage(t *testing.T) {
	h := func(c *gin.Context) {
		if page, ok := ParsePage(c); ok {
			c.String(http.StatusOK, "%d", page)
		}
	}

	for target, want := range map[string]string{"/": "1", "/?page=3": "3"} {
		if w := serve(t, "/", target, h); w.Code != http.StatusOK || w.Body.String() != want {
			t.Errorf("%s: %d %s, want %s", target, w.Code, w.Body, want)
		}
	}
	for _, target := range []string{"/?page=0", "/?page=-1", "/?page=x", "/?page=1.5", "/?page=100001", "/?page=99999999999999999999"} {
		w := serve(t, "/", target, h)
		if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), constants.InvalidPageParam) {
			t.Errorf("%s: %d %s, want 400 %s", target, w.Code, w.Body, constants.InvalidPageParam)
		}
	}
}

func TestCheckPageInRange(t *testing.T) {
	tests := []struct {
		page         int
		total, limit int64
		ok           bool
	}{
		{1, 0, 20, true}, // an empty result still has page 1
		{2, 0, 20, false},
		{1, 20, 20, true},
		{2, 20, 20, false},
		{2, 21, 20, true},
		{3, 41, 20, true},
		{4, 41, 20, false},
	}
	for _, tt := range tests {
		h := func(c *gin.Context) {
			if CheckPageInRange(c, tt.page, tt.total, tt.limit) {
				c.Status(http.StatusNoContent)
			}
		}
		w := serve(t, "/", "/", h)
		if got := w.Code == http.StatusNoContent; got != tt.ok {
			t.Errorf("page %d of total %d/limit %d: ok = %v, want %v", tt.page, tt.total, tt.limit, got, tt.ok)
		}
	}
}

func TestOffset(t *testing.T) {
	if got := Offset(1, 20); got != 0 {
		t.Errorf("Offset(1) = %d", got)
	}
	if got := Offset(MaxPage, 40); got != int32((MaxPage-1)*40) {
		t.Errorf("Offset(MaxPage) = %d", got)
	}
}

func TestUserIDMissingIsServerError(t *testing.T) {
	w := serve(t, "/", "/", func(c *gin.Context) {
		if _, ok := UserID(c); ok {
			c.Status(http.StatusNoContent)
		}
	})
	if w.Code != http.StatusInternalServerError || strings.Contains(w.Body.String(), "uuid") {
		t.Fatalf("got %d %s, want a generic 500", w.Code, w.Body)
	}
}

func TestParseSort(t *testing.T) {
	gin.SetMode(gin.TestMode)
	fields := map[string]string{"created": "desc", "name": "asc"}
	for _, tt := range []struct {
		query string
		want  Sort
		ok    bool
	}{
		{"", Sort{"created", "desc"}, true},
		{"?sort=name", Sort{"name", "asc"}, true},
		{"?sort=name&dir=desc", Sort{"name", "desc"}, true},
		{"?sort=price", Sort{}, false},
		{"?sort=name&dir=up", Sort{}, false},
	} {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/"+tt.query, nil)
		got, ok := ParseSort(c, fields, "created")
		if ok != tt.ok || got != tt.want {
			t.Errorf("%q: got %+v %v, want %+v %v", tt.query, got, ok, tt.want, tt.ok)
		}
		if !ok && w.Code != http.StatusBadRequest {
			t.Errorf("%q: status %d, want 400", tt.query, w.Code)
		}
	}
}
