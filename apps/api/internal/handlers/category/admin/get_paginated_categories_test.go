package admin_test

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	adminCategory "github.com/suprimkhatri77/cartspace/backend/internal/handlers/category/admin"
)

func TestGetPaginatedCategories_Success(t *testing.T) {
	repo := &mockCategoryRepo{
		getPaginatedCategoriesFn: func(_ context.Context, _ db.GetPaginatedCategoriesParams) ([]db.Category, error) {
			return getFakeCategories(), nil
		},

		getCategoriesCountFn: func(_ context.Context) (int64, error) {
			return 20, nil
		},
	}

	router := setupRouter(func(r *gin.Engine) {
		r.GET("/api/category", adminCategory.GetPaginatedCategories(repo))
	})

	w := makeRequest(t, router, "GET", "/api/category?page=1", nil)

	if w.Code != http.StatusOK {

		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestGetPaginatedCategories_InvalidQueryParameterType(t *testing.T) {
	repo := &mockCategoryRepo{}

	router := setupRouter(func(r *gin.Engine) {
		r.GET("/api/category", adminCategory.GetPaginatedCategories(repo))
	})

	w := makeRequest(t, router, "GET", "/api/category?page=invalid_query_parameter_type", nil)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestGetPaginatedCategories_TotalCountZero(t *testing.T) {
	repo := &mockCategoryRepo{
		getCategoriesCountFn: func(_ context.Context) (int64, error) {
			return 0, nil
		},
	}

	router := setupRouter(func(r *gin.Engine) {
		r.GET("/api/category", adminCategory.GetPaginatedCategories(repo))
	})

	w := makeRequest(t, router, "GET", "/api/category?page=1", nil)

	if w.Code != http.StatusOK {

		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestGetPaginatedCategories_DBErrorForTotalCount(t *testing.T) {
	repo := &mockCategoryRepo{
		getCategoriesCountFn: func(_ context.Context) (int64, error) {
			return 0, fmt.Errorf("failed to process request")
		},
	}

	router := setupRouter(func(r *gin.Engine) {
		r.GET("/api/category", adminCategory.GetPaginatedCategories(repo))
	})

	w := makeRequest(t, router, "GET", "/api/category?page=1", nil)

	if w.Code != http.StatusInternalServerError {

		t.Errorf("expected 500, got %d", w.Code)
	}

}
func TestGetPaginatedCategories_DBError(t *testing.T) {
	repo := &mockCategoryRepo{
		getCategoriesCountFn: func(_ context.Context) (int64, error) {
			return 20, nil
		},
		getPaginatedCategoriesFn: func(_ context.Context, _ db.GetPaginatedCategoriesParams) ([]db.Category, error) {
			return []db.Category{}, fmt.Errorf("failed to process request")
		},
	}

	router := setupRouter(func(r *gin.Engine) {
		r.GET("/api/category", adminCategory.GetPaginatedCategories(repo))
	})

	w := makeRequest(t, router, "GET", "/api/category?page=1", nil)

	if w.Code != http.StatusInternalServerError {

		t.Errorf("expected 500, got %d", w.Code)
	}

}
