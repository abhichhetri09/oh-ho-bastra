package user_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/handlers/category/user"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
)

type treeRepo struct {
	repository.CategoryRepository
	rows []db.GetCategoryTreeRow
	err  error
}

func (r treeRepo) GetCategoryTree(context.Context) ([]db.GetCategoryTreeRow, error) {
	return r.rows, r.err
}

func serve(repo repository.CategoryRepository) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/categories", user.ListCategories(repo))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/categories", nil))
	return w
}

func TestListCategories(t *testing.T) {
	rows := []db.GetCategoryTreeRow{
		{Name: "Clothing", Slug: "clothing", Depth: 0},
		{Name: "Shirts", Slug: "shirts", Depth: 1},
	}
	w := serve(treeRepo{rows: rows})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}

	var body struct {
		Success bool `json:"success"`
		Data    []struct {
			Slug  string `json:"slug"`
			Depth int    `json:"depth"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if !body.Success || len(body.Data) != 2 || body.Data[1].Slug != "shirts" || body.Data[1].Depth != 1 {
		t.Fatalf("unexpected body: %s", w.Body.String())
	}
}

func TestListCategoriesEmptyIsArray(t *testing.T) {
	w := serve(treeRepo{rows: []db.GetCategoryTreeRow{}})
	var body struct {
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if string(body.Data) != "[]" {
		t.Fatalf("data = %s, want []", body.Data)
	}
}

func TestListCategoriesDBError(t *testing.T) {
	w := serve(treeRepo{err: errors.New("boom")})
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", w.Code)
	}
}
