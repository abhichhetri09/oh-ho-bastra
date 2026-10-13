package cart

import (
	"context"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/utils"
	"github.com/suprimkhatri77/cartspace/backend/internal/validator"
)

var errItemNotFound = &cartError{http.StatusNotFound, constants.CartItemNotFound,
	"This item is not in your bag"}

// GetCart returns the user's cart (empty without one).
func GetCart(queries repository.CartRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := httpx.UserID(c)
		if !ok {
			return
		}
		respond(c, queries, userID, "Cart fetched")
	}
}

// AddItem adds a quantity of a variant, on top of any already in the cart.
func AddItem(queries repository.CartRepository, pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		req, ok := validator.BindJSON[types.AddCartItemRequest](c)
		if !ok {
			return
		}
		// binding:"uuid" already validated the format
		variantID, err := utils.ConvertToUUID(req.VariantID)
		if err != nil {
			httpx.Fail(c, http.StatusBadRequest, constants.InvalidVariantID, "Invalid variant ID")
			return
		}

		mutate(c, pool, queries, "Added to your bag", func(ctx context.Context, qtx repository.CartRepository, cartID pgtype.UUID) error {
			v, err := variantAvailability(ctx, qtx, variantID)
			if err != nil {
				return err
			}
			existing, err := qtx.GetCartItemQuantity(ctx, db.GetCartItemQuantityParams{CartID: cartID, VariantID: variantID})
			if err != nil && !errors.Is(err, pgx.ErrNoRows) {
				return err
			}
			lines, err := qtx.CountCartItems(ctx, cartID)
			if err != nil {
				return err
			}
			if refusal := checkAdd(int(existing), req.Quantity, lines, v); refusal != nil {
				return refusal
			}
			return qtx.SetCartItemQuantity(ctx, db.SetCartItemQuantityParams{
				CartID:    cartID,
				VariantID: variantID,
				Quantity:  existing + int32(req.Quantity),
			})
		})
	}
}

// UpdateItem sets a line's quantity.
func UpdateItem(queries repository.CartRepository, pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		variantID, ok := httpx.PathUUID(c, "variantID", constants.InvalidVariantID, "variant ID")
		if !ok {
			return
		}
		req, ok := validator.BindJSON[types.UpdateCartItemRequest](c)
		if !ok {
			return
		}

		mutate(c, pool, queries, "Bag updated", func(ctx context.Context, qtx repository.CartRepository, cartID pgtype.UUID) error {
			current, err := qtx.GetCartItemQuantity(ctx, db.GetCartItemQuantityParams{CartID: cartID, VariantID: variantID})
			if errors.Is(err, pgx.ErrNoRows) {
				return errItemNotFound
			}
			if err != nil {
				return err
			}
			v, err := variantAvailability(ctx, qtx, variantID)
			if err != nil {
				return err
			}
			if refusal := checkUpdate(int(current), req.Quantity, v); refusal != nil {
				return refusal
			}
			return qtx.SetCartItemQuantity(ctx, db.SetCartItemQuantityParams{
				CartID:    cartID,
				VariantID: variantID,
				Quantity:  int32(req.Quantity),
			})
		})
	}
}

// RemoveItem deletes a line.
func RemoveItem(queries repository.CartRepository, pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		variantID, ok := httpx.PathUUID(c, "variantID", constants.InvalidVariantID, "variant ID")
		if !ok {
			return
		}

		mutate(c, pool, queries, "Removed from your bag", func(ctx context.Context, qtx repository.CartRepository, cartID pgtype.UUID) error {
			rows, err := qtx.DeleteCartItem(ctx, db.DeleteCartItemParams{CartID: cartID, VariantID: variantID})
			if err != nil {
				return err
			}
			if rows == 0 {
				return errItemNotFound
			}
			return nil
		})
	}
}

// ClearCart empties the cart. Clearing an empty cart succeeds.
func ClearCart(queries repository.CartRepository, pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		mutate(c, pool, queries, "Bag cleared", func(ctx context.Context, qtx repository.CartRepository, cartID pgtype.UUID) error {
			return qtx.ClearCart(ctx, cartID)
		})
	}
}

// variantAvailability is a variant's stock and sale state; a variant that
// doesn't exist is a 404.
func variantAvailability(ctx context.Context, qtx repository.CartRepository, variantID pgtype.UUID) (availability, error) {
	row, err := qtx.GetVariantAvailability(ctx, variantID)
	if errors.Is(err, pgx.ErrNoRows) {
		return availability{}, &cartError{http.StatusNotFound, constants.VariantNotFound, "Product variant not found"}
	}
	if err != nil {
		return availability{}, err
	}
	return availability{stock: int(row.Stock), available: row.Available}, nil
}
