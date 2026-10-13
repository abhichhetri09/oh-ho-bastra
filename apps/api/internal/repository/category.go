package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	dbgen "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
)

type CategoryRepository interface {
	CreateCategory(ctx context.Context, params dbgen.CreateCategoryParams) (dbgen.Category, error)
	UpdateCategory(ctx context.Context, params dbgen.UpdateCategoryParams) (dbgen.Category, error)
	DeleteCategory(ctx context.Context, id pgtype.UUID) (pgconn.CommandTag, error)

	CreateSubCategory(ctx context.Context, params dbgen.CreateSubCategoryParams) (dbgen.Category, error)

	GetCategoryBySlug(ctx context.Context, slug string) (dbgen.Category, error)

	CategorySlugExists(ctx context.Context, slug string) (bool, error)

	GetCategoryByID(ctx context.Context, id pgtype.UUID) (dbgen.Category, error)
	GetCategoryAncestors(ctx context.Context, id pgtype.UUID) ([]dbgen.GetCategoryAncestorsRow, error)

	GetPaginatedCategories(ctx context.Context, params dbgen.GetPaginatedCategoriesParams) ([]dbgen.Category, error)

	GetCategoriesCount(ctx context.Context) (int64, error)

	GetCategoryTree(ctx context.Context) ([]dbgen.GetCategoryTreeRow, error)
}
