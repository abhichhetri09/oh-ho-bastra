package repository

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
)

type CartRepository interface {
	WithTx(tx pgx.Tx) CartRepository
	EnsureCart(ctx context.Context, userID pgtype.UUID) (pgtype.UUID, error)
	GetCartLines(ctx context.Context, userID pgtype.UUID) ([]db.GetCartLinesRow, error)
	GetCartItemQuantity(ctx context.Context, params db.GetCartItemQuantityParams) (int32, error)
	CountCartItems(ctx context.Context, cartID pgtype.UUID) (int64, error)
	GetVariantAvailability(ctx context.Context, variantID pgtype.UUID) (db.GetVariantAvailabilityRow, error)
	SetCartItemQuantity(ctx context.Context, params db.SetCartItemQuantityParams) error
	DeleteCartItem(ctx context.Context, params db.DeleteCartItemParams) (int64, error)
	ClearCart(ctx context.Context, cartID pgtype.UUID) error
}

type cartRepository struct {
	queries *db.Queries
}

func NewCartRepository(queries *db.Queries) CartRepository {
	return &cartRepository{queries: queries}
}

func (c *cartRepository) WithTx(tx pgx.Tx) CartRepository {
	return &cartRepository{queries: c.queries.WithTx(tx)}
}

func (c *cartRepository) EnsureCart(ctx context.Context, userID pgtype.UUID) (pgtype.UUID, error) {
	return c.queries.EnsureCart(ctx, userID)
}

func (c *cartRepository) GetCartLines(ctx context.Context, userID pgtype.UUID) ([]db.GetCartLinesRow, error) {
	return c.queries.GetCartLines(ctx, userID)
}

func (c *cartRepository) GetCartItemQuantity(ctx context.Context, params db.GetCartItemQuantityParams) (int32, error) {
	return c.queries.GetCartItemQuantity(ctx, params)
}

func (c *cartRepository) CountCartItems(ctx context.Context, cartID pgtype.UUID) (int64, error) {
	return c.queries.CountCartItems(ctx, cartID)
}

func (c *cartRepository) GetVariantAvailability(ctx context.Context, variantID pgtype.UUID) (db.GetVariantAvailabilityRow, error) {
	return c.queries.GetVariantAvailability(ctx, variantID)
}

func (c *cartRepository) SetCartItemQuantity(ctx context.Context, params db.SetCartItemQuantityParams) error {
	return c.queries.SetCartItemQuantity(ctx, params)
}

func (c *cartRepository) DeleteCartItem(ctx context.Context, params db.DeleteCartItemParams) (int64, error) {
	return c.queries.DeleteCartItem(ctx, params)
}

func (c *cartRepository) ClearCart(ctx context.Context, cartID pgtype.UUID) error {
	return c.queries.ClearCart(ctx, cartID)
}
