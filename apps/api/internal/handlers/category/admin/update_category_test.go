package admin_test

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	adminCategory "github.com/suprimkhatri77/cartspace/backend/internal/handlers/category/admin"
)

func TestUpdateCategory_Success(t *testing.T) {
	repo := &mockCategoryRepo{
		updateCategoryFn: func(_ context.Context, _ db.UpdateCategoryParams) (db.Category, error) {
			return FakeCategory(), nil
		},

		getCategoryByIDFn: func(_ context.Context, _ pgtype.UUID) (db.Category, error) {
			return FakeCategory(), nil
		},
		categorySlugExistsFn: func(_ context.Context, _ string) (bool, error) {
			return false, nil
		},
	}

	router := setupRouter(func(r *gin.Engine) {
		r.PUT("/api/category/:id", adminCategory.UpdateCategory(repo))
	})

	_, str := getRandomUUID()
	w := makeRequest(t, router, "PUT", fmt.Sprintf("/api/category/%s", str), map[string]string{
		"name": "edit fake category",
	})

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestUpdateCategory_WithParentID(t *testing.T) {
	repo := &mockCategoryRepo{
		updateCategoryFn: func(_ context.Context, _ db.UpdateCategoryParams) (db.Category, error) {
			return FakeCategory(), nil
		},
		getCategoryByIDFn: func(_ context.Context, _ pgtype.UUID) (db.Category, error) {
			return FakeCategory(), nil
		},
		categorySlugExistsFn: func(_ context.Context, _ string) (bool, error) {
			return false, nil
		},
		getCategoryAncestorsFn: func(_ context.Context, id pgtype.UUID) ([]db.GetCategoryAncestorsRow, error) {
			return []db.GetCategoryAncestorsRow{{ID: id}}, nil
		},
	}

	router := setupRouter(func(r *gin.Engine) {
		r.PUT("/api/category/:id", adminCategory.UpdateCategory(repo))
	})

	_, categoryID := getRandomUUID()
	_, parentID := getRandomUUID()
	w := makeRequest(t, router, "PUT", fmt.Sprintf("/api/category/%s", categoryID), map[string]string{
		"name":      "fake category",
		"parent_id": parentID,
	})

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestUpdateCategory_OmittedParentMakesRoot(t *testing.T) {
	var got db.UpdateCategoryParams
	repo := &mockCategoryRepo{
		getCategoryByIDFn: func(_ context.Context, _ pgtype.UUID) (db.Category, error) {
			return FakeSubCategory(), nil
		},
		categorySlugExistsFn: func(_ context.Context, _ string) (bool, error) {
			return false, nil
		},
		updateCategoryFn: func(_ context.Context, p db.UpdateCategoryParams) (db.Category, error) {
			got = p
			return db.Category{ID: p.ID}, nil
		},
	}

	router := setupRouter(func(r *gin.Engine) {
		r.PUT("/api/category/:id", adminCategory.UpdateCategory(repo))
	})

	_, categoryID := getRandomUUID()
	w := makeRequest(t, router, "PUT", "/api/category/"+categoryID, map[string]string{"name": "fake category"})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d %s", w.Code, w.Body)
	}
	if got.ParentID.Valid {
		t.Errorf("expected the category to become a root, got parent %v", got.ParentID)
	}
}

func TestUpdateCategory_InvalidRequestBody(t *testing.T) {
	repo := &mockCategoryRepo{}

	router := setupRouter(func(r *gin.Engine) {
		r.PUT("/api/category/:id", adminCategory.UpdateCategory(repo))

	})

	_, categoryID := getRandomUUID()
	w := makeRequest(t, router, "PUT", fmt.Sprintf("/api/category/%s", categoryID), map[string]string{
		"name": "",
	})

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestUpdateCategory_UUIDConversionError(t *testing.T) {
	repo := &mockCategoryRepo{}

	router := setupRouter(func(r *gin.Engine) {
		r.PUT("/api/category/:id", adminCategory.UpdateCategory(repo))
	})

	w := makeRequest(t, router, "PUT", "/api/category/invalid_uuid", map[string]string{
		"name": "fake category",
	})

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestUpdateCategory_CategoryNotFound(t *testing.T) {
	repo := &mockCategoryRepo{

		getCategoryByIDFn: func(_ context.Context, _ pgtype.UUID) (db.Category, error) {
			return db.Category{}, pgx.ErrNoRows
		},
	}

	router := setupRouter(func(r *gin.Engine) {
		r.PUT("/api/category/:id", adminCategory.UpdateCategory(repo))
	})

	_, categoryID := getRandomUUID()
	w := makeRequest(t, router, "PUT", fmt.Sprintf("/api/category/%s", categoryID), map[string]string{
		"name": "new category name",
	})

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestUpdateCategory_DBError(t *testing.T) {
	repo := &mockCategoryRepo{
		updateCategoryFn: func(_ context.Context, _ db.UpdateCategoryParams) (db.Category, error) {
			return db.Category{}, fmt.Errorf("Failed to update category")
		},
		getCategoryByIDFn: func(_ context.Context, _ pgtype.UUID) (db.Category, error) {
			return FakeCategory(), nil
		},

		categorySlugExistsFn: func(ctx context.Context, slug string) (bool, error) {
			return false, nil
		},
	}

	router := setupRouter(func(r *gin.Engine) {
		r.PUT("/api/category/:id", adminCategory.UpdateCategory(repo))
	})

	_, categoryID := getRandomUUID()
	w := makeRequest(t, router, "PUT", fmt.Sprintf("/api/category/%s", categoryID), map[string]string{
		"name": "new category name",
	})

	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected 500, got %d", w.Code)
	}
}

func TestUpdateCategory_SelfReferencingParentID(t *testing.T) {
	catUUID, categoryID := getRandomUUID()
	repo := &mockCategoryRepo{

		getCategoryByIDFn: func(_ context.Context, _ pgtype.UUID) (db.Category, error) {
			return db.Category{ID: catUUID}, nil
		},

		categorySlugExistsFn: func(ctx context.Context, slug string) (bool, error) {
			return false, nil
		},
	}

	router := setupRouter(func(r *gin.Engine) {
		r.PUT("/api/category/:id", adminCategory.UpdateCategory(repo))
	})

	w := makeRequest(t, router, "PUT", fmt.Sprintf("/api/category/%s", categoryID), map[string]string{
		"name":      "new category name",
		"parent_id": categoryID,
	})

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}

}

// cycleRepo models the chain root <- mid <- leaf and updates root.
func cycleRepo(root, mid, leaf pgtype.UUID) *mockCategoryRepo {
	return &mockCategoryRepo{
		getCategoryByIDFn: func(_ context.Context, id pgtype.UUID) (db.Category, error) {
			return db.Category{ID: id, Name: "new category name", Slug: "new-category-name"}, nil
		},
		getCategoryAncestorsFn: func(_ context.Context, id pgtype.UUID) ([]db.GetCategoryAncestorsRow, error) {
			switch id {
			case leaf:
				return []db.GetCategoryAncestorsRow{{ID: root}, {ID: mid}, {ID: leaf, ParentID: mid}}, nil
			case mid:
				return []db.GetCategoryAncestorsRow{{ID: root}, {ID: mid, ParentID: root}}, nil
			}
			return nil, nil
		},
		updateCategoryFn: func(_ context.Context, p db.UpdateCategoryParams) (db.Category, error) {
			return db.Category{ID: p.ID, ParentID: p.ParentID}, nil
		},
	}
}

func TestUpdateCategory_CyclicReference(t *testing.T) {
	root, rootID := getRandomUUID()
	mid, midID := getRandomUUID()
	leaf, leafID := getRandomUUID()
	repo := cycleRepo(root, mid, leaf)

	router := setupRouter(func(r *gin.Engine) {
		r.PUT("/api/category/:id", adminCategory.UpdateCategory(repo))
	})

	for name, parent := range map[string]string{"direct child (A->B->A)": midID, "deep descendant": leafID} {
		t.Run(name, func(t *testing.T) {
			w := makeRequest(t, router, "PUT", "/api/category/"+rootID, map[string]string{
				"name":      "new category name",
				"parent_id": parent,
			})
			if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "CYCLIC_CATEGORY_REFERENCE") {
				t.Errorf("expected 400 CYCLIC_CATEGORY_REFERENCE, got %d %s", w.Code, w.Body)
			}
		})
	}
}

func TestUpdateCategory_ParentNotFound(t *testing.T) {
	root, rootID := getRandomUUID()
	mid, _ := getRandomUUID()
	leaf, _ := getRandomUUID()
	repo := cycleRepo(root, mid, leaf)

	router := setupRouter(func(r *gin.Engine) {
		r.PUT("/api/category/:id", adminCategory.UpdateCategory(repo))
	})

	_, unknown := getRandomUUID()
	w := makeRequest(t, router, "PUT", "/api/category/"+rootID, map[string]string{
		"name":      "new category name",
		"parent_id": unknown,
	})
	if w.Code != http.StatusNotFound || !strings.Contains(w.Body.String(), "CATEGORY_NOT_FOUND") {
		t.Errorf("expected 404 CATEGORY_NOT_FOUND, got %d %s", w.Code, w.Body)
	}
}

func TestUpdateCategory_DuplicateName(t *testing.T) {
	repo := &mockCategoryRepo{
		getCategoryByIDFn: func(_ context.Context, _ pgtype.UUID) (db.Category, error) {
			return FakeCategory(), nil
		},
		categorySlugExistsFn: func(_ context.Context, _ string) (bool, error) {
			return false, nil
		},
		updateCategoryFn: func(_ context.Context, _ db.UpdateCategoryParams) (db.Category, error) {
			return db.Category{}, &pgconn.PgError{Code: "23505"}
		},
	}

	router := setupRouter(func(r *gin.Engine) {
		r.PUT("/api/category/:id", adminCategory.UpdateCategory(repo))
	})

	_, categoryID := getRandomUUID()
	w := makeRequest(t, router, "PUT", "/api/category/"+categoryID, map[string]string{"name": "taken name"})
	if w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "CATEGORY_ALREADY_EXISTS") {
		t.Errorf("expected 409 CATEGORY_ALREADY_EXISTS, got %d %s", w.Code, w.Body)
	}
}

func TestUpdateCategory_InvalidIDCheckedBeforeBody(t *testing.T) {
	router := setupRouter(func(r *gin.Engine) {
		r.PUT("/api/category/:id", adminCategory.UpdateCategory(&mockCategoryRepo{}))
	})

	w := makeRequest(t, router, "PUT", "/api/category/not-a-uuid", map[string]string{"name": ""})
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "INVALID_CATEGORY_ID") {
		t.Errorf("expected 400 INVALID_CATEGORY_ID, got %d %s", w.Code, w.Body)
	}
}
