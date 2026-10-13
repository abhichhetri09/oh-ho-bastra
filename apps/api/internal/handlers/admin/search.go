package admin

import (
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/sync/errgroup"

	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/utils"
)

// searchLimit is how many of each kind the command palette shows.
const searchLimit = 5

// SearchResults are the command palette's matches of each kind.
type SearchResults struct {
	Orders    []db.AdminListOrdersRow     `json:"orders"`
	Products  []db.AdminSearchProductsRow `json:"products"`
	Customers []db.AdminListCustomersRow  `json:"customers"`
}

// Search finds orders (by number, or a piece of the email), products (by
// name or SKU, hidden ones too) and customers (by name or email), up to 5
// of each, for the command palette.
func Search(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		q := strings.TrimSpace(c.Query("q"))
		if q == "" || utf8.RuneCountInString(q) > maxOrdersSearch {
			httpx.Fail(c, http.StatusBadRequest, constants.InvalidQueryParam, "q must be 1 to 100 characters")
			return
		}
		pattern := utils.ContainsPattern(q)
		var number pgtype.Int8
		var email pgtype.Text
		if n, isNumber := orderNumber(q); isNumber {
			number = pgtype.Int8{Int64: n, Valid: true}
		} else {
			email = pgtype.Text{String: pattern, Valid: true}
		}

		results := SearchResults{}
		g, ctx := errgroup.WithContext(c.Request.Context())
		g.Go(func() (err error) {
			results.Orders, err = queries.AdminListOrders(ctx, db.AdminListOrdersParams{
				Number: number, EmailPattern: email, PageLimit: searchLimit,
			})
			return
		})
		g.Go(func() (err error) { results.Products, err = queries.AdminSearchProducts(ctx, pattern); return })
		g.Go(func() (err error) {
			results.Customers, err = queries.AdminListCustomers(ctx, db.AdminListCustomersParams{
				Pattern: pgtype.Text{String: pattern, Valid: true}, PageLimit: searchLimit,
			})
			return
		})
		if err := g.Wait(); err != nil {
			httpx.Internal(c, "failed to search", err)
			return
		}
		if results.Orders == nil {
			results.Orders = []db.AdminListOrdersRow{}
		}
		if results.Products == nil {
			results.Products = []db.AdminSearchProductsRow{}
		}
		if results.Customers == nil {
			results.Customers = []db.AdminListCustomersRow{}
		}
		c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: "Search done", Data: results})
	}
}
