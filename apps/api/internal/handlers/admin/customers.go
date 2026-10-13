package admin

import (
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/sync/errgroup"

	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/utils"
)

const (
	customersPageSize  int64 = 20
	maxCustomersSearch int   = 100
)

// customerSorts are the sortable fields and their natural direction.
var customerSorts = map[string]string{"joined": "desc", "orders": "desc", "spend": "desc"}

// ListCustomers is every customer account, newest first unless sorted
// otherwise, searched by a piece of the name or email, with their order
// count, spend and last order.
func ListCustomers(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		page, ok := httpx.ParsePage(c)
		if !ok {
			return
		}
		q := strings.TrimSpace(c.Query("q"))
		if utf8.RuneCountInString(q) > maxCustomersSearch {
			httpx.Fail(c, http.StatusBadRequest, constants.InvalidQueryParam, "q must be at most 100 characters")
			return
		}
		var pattern pgtype.Text
		if q != "" {
			pattern = pgtype.Text{String: utils.ContainsPattern(q), Valid: true}
		}
		sort, ok := httpx.ParseSort(c, customerSorts, "joined")
		if !ok {
			return
		}

		total, err := queries.CountAdminCustomers(ctx, pattern)
		if err != nil {
			httpx.Internal(c, "failed to count customers", err)
			return
		}
		if !httpx.CheckPageInRange(c, page, total, customersPageSize) {
			return
		}
		customers := []db.AdminListCustomersRow{}
		if total > 0 {
			customers, err = queries.AdminListCustomers(ctx, db.AdminListCustomersParams{
				Pattern: pattern, Sort: sort.Field, Dir: sort.Dir,
				PageLimit: int32(customersPageSize), PageOffset: httpx.Offset(page, customersPageSize),
			})
			if err != nil {
				httpx.Internal(c, "failed to list customers", err)
				return
			}
		}
		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Customers fetched",
			Data:    customers,
			Meta:    types.NewPaginationMeta(total, page, customersPageSize),
		})
	}
}

// CustomerDetail is a customer with their totals, saved addresses and
// latest reviews. Their orders come from the orders list (?customer=).
type CustomerDetail struct {
	db.AdminGetCustomerRow
	AverageOrderValue int64                        `json:"average_order_value"`
	Addresses         []db.Address                 `json:"addresses"`
	Reviews           []db.AdminCustomerReviewsRow `json:"reviews"`
}

// GetCustomer is one customer account; admins aren't customers (404).
func GetCustomer(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := httpx.PathUUID(c, "userID", constants.InvalidUserID, "user ID")
		if !ok {
			return
		}
		var detail CustomerDetail
		g, ctx := errgroup.WithContext(c.Request.Context())
		g.Go(func() (err error) { detail.AdminGetCustomerRow, err = queries.AdminGetCustomer(ctx, id); return })
		g.Go(func() (err error) { detail.Addresses, err = queries.ListAddresses(ctx, id); return })
		g.Go(func() (err error) { detail.Reviews, err = queries.AdminCustomerReviews(ctx, id); return })
		err := g.Wait()
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(c, http.StatusNotFound, constants.CustomerNotFound, "Customer not found")
			return
		}
		if err != nil {
			httpx.Internal(c, "failed to get customer", err, "user_id", utils.UUIDToString(id))
			return
		}
		if detail.Addresses == nil {
			detail.Addresses = []db.Address{}
		}
		if detail.Reviews == nil {
			detail.Reviews = []db.AdminCustomerReviewsRow{}
		}
		if detail.PaidOrders > 0 {
			detail.AverageOrderValue = detail.Spend / detail.PaidOrders
		}
		c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: "Customer fetched", Data: detail})
	}
}
