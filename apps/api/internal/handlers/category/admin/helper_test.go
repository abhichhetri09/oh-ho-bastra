package admin_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/validator"
)

type mockCategoryRepo struct {
	createCategoryFn func(ctx context.Context, params db.CreateCategoryParams) (db.Category, error)

	categorySlugExistsFn func(ctx context.Context, slug string) (bool, error)

	createSubCategoryFn func(ctx context.Context, params db.CreateSubCategoryParams) (db.Category, error)

	deleteCategoryFn func(ctx context.Context, id pgtype.UUID) (pgconn.CommandTag, error)

	getCategoriesCountFn func(ctx context.Context) (int64, error)

	getPaginatedCategoriesFn func(ctx context.Context, params db.GetPaginatedCategoriesParams) ([]db.Category, error)

	getCategoryByIDFn func(ctx context.Context, id pgtype.UUID) (db.Category, error)

	getCategoryBySlugFn func(ctx context.Context, slug string) (db.Category, error)

	updateCategoryFn func(ctx context.Context, params db.UpdateCategoryParams) (db.Category, error)

	getCategoryAncestorsFn func(ctx context.Context, id pgtype.UUID) ([]db.GetCategoryAncestorsRow, error)
}

func (m *mockCategoryRepo) GetCategoryTree(ctx context.Context) ([]db.GetCategoryTreeRow, error) {
	panic("GetCategoryTree is not used by the admin handlers")
}

func (m *mockCategoryRepo) GetCategoryAncestors(ctx context.Context, id pgtype.UUID) ([]db.GetCategoryAncestorsRow, error) {
	return m.getCategoryAncestorsFn(ctx, id)
}

func (m *mockCategoryRepo) CreateCategory(ctx context.Context, params db.CreateCategoryParams) (db.Category, error) {
	return m.createCategoryFn(ctx, params)
}

func (m *mockCategoryRepo) CategorySlugExists(ctx context.Context, slug string) (bool, error) {
	return m.categorySlugExistsFn(ctx, slug)
}

func (m *mockCategoryRepo) CreateSubCategory(ctx context.Context, params db.CreateSubCategoryParams) (db.Category, error) {
	return m.createSubCategoryFn(ctx, params)
}

func (m *mockCategoryRepo) DeleteCategory(ctx context.Context, id pgtype.UUID) (pgconn.CommandTag, error) {
	return m.deleteCategoryFn(ctx, id)
}

func (m *mockCategoryRepo) GetCategoriesCount(ctx context.Context) (int64, error) {
	return m.getCategoriesCountFn(ctx)
}

func (m *mockCategoryRepo) GetPaginatedCategories(ctx context.Context, params db.GetPaginatedCategoriesParams) ([]db.Category, error) {
	return m.getPaginatedCategoriesFn(ctx, params)
}

func (m *mockCategoryRepo) GetCategoryByID(ctx context.Context, id pgtype.UUID) (db.Category, error) {
	return m.getCategoryByIDFn(ctx, id)

}

func (m *mockCategoryRepo) GetCategoryBySlug(ctx context.Context, slug string) (db.Category, error) {
	return m.getCategoryBySlugFn(ctx, slug)
}

func (m *mockCategoryRepo) UpdateCategory(ctx context.Context, params db.UpdateCategoryParams) (db.Category, error) {
	return m.updateCategoryFn(ctx, params)
}

func FakeCategory() db.Category {
	uuid, _ := getRandomUUID()
	return db.Category{
		Name: "Mock category",
		Slug: "mock-category",
		ID:   uuid,
	}
}
func FakeSubCategory() db.Category {
	uuid, _ := getRandomUUID()

	parentID, _ := getRandomUUID()
	return db.Category{
		Name:     "Mock category",
		Slug:     "mock-category",
		ID:       uuid,
		ParentID: parentID,
	}
}

func getFakeCategories() []db.Category {
	categories := []db.Category{
		{Name: "category 1"},
		{Name: "category 2"},
		{Name: "category 3"},
		{Name: "category 4"},
		{Name: "category 5"},
		{Name: "category 6"},
		{Name: "category 7"},
		{Name: "category 8"},
		{Name: "category 9"},
		{Name: "category 10"},
		{Name: "category 11"},
		{Name: "category 12"},
		{Name: "category 13"},
		{Name: "category 14"},
		{Name: "category 15"},
		{Name: "category 16"},
		{Name: "category 17"},
		{Name: "category 18"},
		{Name: "category 19"},
		{Name: "category 20"},
	}

	return categories
}

func getRandomUUID() (pgtype.UUID, string) {
	u := uuid.New()

	var pgUUID pgtype.UUID
	_ = pgUUID.Scan(u.String())

	return pgUUID, u.String()
}

func setupRouter(register func(r *gin.Engine)) *gin.Engine {
	gin.SetMode(gin.TestMode)
	validator.Init()

	r := gin.New()

	register(r)

	return r
}

func makeRequest(t *testing.T, router *gin.Engine, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()

	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}

	req := httptest.NewRequest(method, path, bytes.NewBuffer(raw))

	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	return w

}
