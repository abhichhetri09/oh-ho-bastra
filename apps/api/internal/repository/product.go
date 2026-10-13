package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
)

type ProductRepository interface {
	CreateProduct(ctx context.Context, params db.CreateProductParams) (db.Product, error)
	ProductSlugExists(ctx context.Context, slug string) (bool, error)
	GetProductByID(ctx context.Context, id pgtype.UUID) (db.Product, error)
	UpdateProduct(ctx context.Context, params db.UpdateProductParams) (db.Product, error)
	DeleteProduct(ctx context.Context, id pgtype.UUID) (pgconn.CommandTag, error)
	CountAdminProducts(ctx context.Context, args db.CountAdminProductsParams) (int64, error)
	GetCategoryBySlug(ctx context.Context, slug string) (db.Category, error)

	// for /admin/products route
	AdminProductsList(ctx context.Context, args db.AdminProductsListParams) ([]db.AdminProductsListRow, error)

	// storefront listings: /products and /categories/:slug
	ListStorefrontProducts(ctx context.Context, arg db.ListStorefrontProductsParams) ([]db.StorefrontProduct, error)
	CountStorefrontProducts(ctx context.Context, arg db.CountStorefrontProductsParams) (int64, error)
	GetStorefrontFilterOptions(ctx context.Context, arg db.GetStorefrontFilterOptionsParams) ([]db.GetStorefrontFilterOptionsRow, error)
	GetStorefrontPriceRange(ctx context.Context, arg db.GetStorefrontPriceRangeParams) (db.GetStorefrontPriceRangeRow, error)

	// for /products/:slug
	GetProductWithDefaultVariantBySlug(ctx context.Context, slug string) (db.GetProductWithDefaultVariantBySlugRow, error)
	GetVariantsByProductSlug(ctx context.Context, slug string) ([]db.GetVariantsByProductSlugRow, error)
	GetRelatedProducts(ctx context.Context, slug string) ([]db.StorefrontProduct, error)
}
