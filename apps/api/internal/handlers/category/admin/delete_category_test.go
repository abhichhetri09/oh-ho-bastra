package admin_test

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	adminCategory "github.com/suprimkhatri77/cartspace/backend/internal/handlers/category/admin"
)

func TestDeleteCategory_Success(t *testing.T) {
	repo := &mockCategoryRepo{
		deleteCategoryFn: func(_ context.Context, _ pgtype.UUID) (pgconn.CommandTag, error) {
			return pgconn.NewCommandTag("DELETE 1"), nil
		},
	}

	router := setupRouter(func(r *gin.Engine) {
		r.DELETE("/api/category/:id", adminCategory.DeleteCategory(repo))
	})

	_, categoryID := getRandomUUID()
	w := makeRequest(t, router, "DELETE", fmt.Sprintf("/api/category/%s", categoryID), nil)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestDeleteCategory_InvalidUUID(t *testing.T) {
	repo := &mockCategoryRepo{}

	router := setupRouter(func(r *gin.Engine) {
		r.DELETE("/api/category/:id", adminCategory.DeleteCategory(repo))
	})

	w := makeRequest(t, router, "DELETE", "/api/category/invalid_uuid", nil)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestDeleteCategory_DBError(t *testing.T) {
	repo := &mockCategoryRepo{
		deleteCategoryFn: func(_ context.Context, _ pgtype.UUID) (pgconn.CommandTag, error) {
			return pgconn.CommandTag{}, fmt.Errorf("Failed to delete category")
		},
	}

	router := setupRouter(func(r *gin.Engine) {
		r.DELETE("/api/category/:id", adminCategory.DeleteCategory(repo))
	})

	_, categoryID := getRandomUUID()
	w := makeRequest(t, router, "DELETE", fmt.Sprintf("/api/category/%s", categoryID), nil)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected 500, got %d", w.Code)
	}
}

func TestDeleteCategory_NoRowsAffected(t *testing.T) {
	repo := &mockCategoryRepo{
		deleteCategoryFn: func(_ context.Context, _ pgtype.UUID) (pgconn.CommandTag, error) {
			return pgconn.NewCommandTag("DELETE 0"), nil
		},
	}

	router := setupRouter(func(r *gin.Engine) {
		r.DELETE("/api/category/:id", adminCategory.DeleteCategory(repo))
	})

	_, categoryID := getRandomUUID()
	w := makeRequest(t, router, "DELETE", fmt.Sprintf("/api/category/%s", categoryID), nil)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}
