// Package cart serves the signed-in user's cart: one per user, created on
// first use. Prices are live (variant_prices); the cart never reserves
// stock, checkout does.
package cart

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
)

const (
	// MaxLineQuantity caps one line (types.*CartItemRequest bind max=10).
	MaxLineQuantity = 10
	// MaxCartLines caps the distinct variants in a cart, which keeps
	// GET /cart small enough to return whole.
	MaxCartLines = 50
)

// cartError is a refusal the handler turns into an error response.
type cartError struct {
	status  int
	code    string
	message string
}

func (e *cartError) Error() string { return e.message }

// availability is what the add and update rules need to know about a variant.
type availability struct {
	stock     int
	available bool
}

var errUnavailable = &cartError{http.StatusConflict, constants.VariantUnavailable,
	"This item is no longer available"}

// checkAdd decides whether `add` more of a variant fit, with `existing`
// already in the cart (0 for a new line) and `lines` lines in it.
func checkAdd(existing, add int, lines int64, v availability) *cartError {
	if !v.available {
		return errUnavailable
	}
	if existing == 0 && lines >= MaxCartLines {
		return &cartError{http.StatusConflict, constants.CartFull,
			fmt.Sprintf("Your bag can hold %d different items", MaxCartLines)}
	}
	next := existing + add
	if next > MaxLineQuantity {
		return &cartError{http.StatusConflict, constants.CartQuantityLimit,
			fmt.Sprintf("You can add up to %d of an item", MaxLineQuantity)}
	}
	if next > v.stock {
		return insufficient(v.stock, existing)
	}
	return nil
}

// checkUpdate decides whether a line can go from `current` to `next`.
// Lowering always works, so a line that went short or off sale can be
// fixed; raising needs the variant on sale with enough stock.
func checkUpdate(current, next int, v availability) *cartError {
	if next <= current {
		return nil
	}
	if !v.available {
		return errUnavailable
	}
	if next > v.stock {
		return insufficient(v.stock, 0)
	}
	return nil
}

func insufficient(stock, inCart int) *cartError {
	message := "This item is out of stock"
	switch {
	case stock > 0 && inCart > 0:
		message = fmt.Sprintf("Only %d left, and %d already in your bag", stock, inCart)
	case stock > 0:
		message = fmt.Sprintf("Only %d left", stock)
	}
	return &cartError{http.StatusConflict, constants.InsufficientStock, message}
}

// buildCart prices the lines and totals what can be checked out.
func buildCart(rows []db.GetCartLinesRow) types.Cart {
	cart := types.Cart{Items: make([]types.CartLine, 0, len(rows))}
	for _, row := range rows {
		maxQuantity := min(row.Stock, MaxLineQuantity)
		if !row.Available {
			maxQuantity = 0
		}
		cart.Items = append(cart.Items, types.CartLine{
			GetCartLinesRow: row,
			LineTotal:       int64(row.Price) * int64(row.Quantity),
			MaxQuantity:     maxQuantity,
		})
		if !row.Available || row.Quantity > row.Stock {
			cart.HasIssues = true
			continue
		}
		cart.ItemCount += int(row.Quantity)
		cart.Subtotal += int64(row.Price) * int64(row.Quantity)
	}
	return cart
}

// respond sends the user's whole cart; every cart endpoint answers with it
// so clients can replace their copy.
func respond(c *gin.Context, queries repository.CartRepository, userID pgtype.UUID, message string) {
	rows, err := queries.GetCartLines(c.Request.Context(), userID)
	if err != nil {
		httpx.Internal(c, "failed to fetch cart", err)
		return
	}
	c.JSON(http.StatusOK, types.APIResponse{
		Success: true,
		Message: message,
		Data:    buildCart(rows),
	})
}

// mutate runs fn in a transaction on the user's cart (created if needed),
// then responds with the cart. EnsureCart locks the cart row first, so one
// user's concurrent cart writes run one after another and every check sees
// the quantities the previous write left.
func mutate(
	c *gin.Context,
	pool *pgxpool.Pool,
	queries repository.CartRepository,
	message string,
	fn func(ctx context.Context, qtx repository.CartRepository, cartID pgtype.UUID) error,
) {
	ctx := c.Request.Context()
	userID, ok := httpx.UserID(c)
	if !ok {
		return
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		httpx.Internal(c, "failed to begin cart transaction", err)
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := queries.WithTx(tx)
	cartID, err := qtx.EnsureCart(ctx, userID)
	if err != nil {
		httpx.Internal(c, "failed to get cart", err)
		return
	}

	if err := fn(ctx, qtx, cartID); err != nil {
		var refusal *cartError
		if errors.As(err, &refusal) {
			httpx.Fail(c, refusal.status, refusal.code, refusal.message)
			return
		}
		httpx.Internal(c, "failed to update cart", err)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		httpx.Internal(c, "failed to commit cart", err)
		return
	}
	respond(c, queries, userID, message)
}
