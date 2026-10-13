// Package admin serves admin-wide endpoints: the dashboard and uploads.
package admin

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/cloudinary"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"golang.org/x/sync/errgroup"
)

// LowStockThreshold: active variants at or below it are flagged.
const LowStockThreshold = 5

// statsRanges are the dashboard's periods, in days ending today (UTC).
var statsRanges = map[string]int{"7d": 7, "30d": 30, "90d": 90}

const defaultStatsRange = "30d"

// Totals are one period's sales and sign-ups.
type Totals struct {
	Revenue           int64 `json:"revenue"`
	Orders            int64 `json:"orders"`
	AverageOrderValue int64 `json:"average_order_value"`
	NewCustomers      int64 `json:"new_customers"`
}

type Stats struct {
	Range string `json:"range"`
	// Current is the range; Previous the same number of days before it.
	Current        Totals                     `json:"current"`
	Previous       Totals                     `json:"previous"`
	Customers      int64                      `json:"customers"`
	Series         []db.AdminSalesByDayRow    `json:"series"`
	OrdersByStatus map[string]int64           `json:"orders_by_status"`
	TopProducts    []db.AdminTopProductsRow   `json:"top_products"`
	NeedsAttention db.AdminAttentionRow       `json:"needs_attention"`
	LowStock       []db.AdminLowStockRow      `json:"low_stock"`
	RecentOrders   []db.AdminRecentOrdersRow  `json:"recent_orders"`
	RecentReviews  []db.AdminRecentReviewsRow `json:"recent_reviews"`
}

// period is [from, to): the days whole days ending with today (UTC).
type period struct{ from, to time.Time }

func periods(now time.Time, days int) (current, previous period) {
	to := now.UTC().Truncate(24*time.Hour).AddDate(0, 0, 1)
	from := to.AddDate(0, 0, -days)
	return period{from, to}, period{from.AddDate(0, 0, -days), from}
}

func (p period) bounds() (pgtype.Timestamptz, pgtype.Timestamptz) {
	return pgtype.Timestamptz{Time: p.from, Valid: true}, pgtype.Timestamptz{Time: p.to, Valid: true}
}

func totals(ctx context.Context, queries *db.Queries, p period) (Totals, error) {
	from, to := p.bounds()
	sales, err := queries.AdminPeriodTotals(ctx, db.AdminPeriodTotalsParams{FromTime: from, ToTime: to})
	if err != nil {
		return Totals{}, err
	}
	customers, err := queries.AdminNewCustomers(ctx, db.AdminNewCustomersParams{FromTime: from, ToTime: to})
	if err != nil {
		return Totals{}, err
	}
	t := Totals{Revenue: sales.Revenue, Orders: sales.Orders, NewCustomers: customers}
	if t.Orders > 0 {
		t.AverageOrderValue = t.Revenue / t.Orders
	}
	return t, nil
}

// GetStats is the dashboard for ?range= (7d, 30d or 90d; 30d by default):
// sales and sign-ups against the period before, sales by day, best sellers,
// orders by status, what needs attention, and the latest orders and reviews.
// Sales are paid, shipped or delivered orders, dated by payment.
func GetStats(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		rng := c.DefaultQuery("range", defaultStatsRange)
		days, ok := statsRanges[rng]
		if !ok {
			httpx.Fail(c, http.StatusBadRequest, constants.InvalidQueryParam, "range must be 7d, 30d or 90d")
			return
		}
		current, previous := periods(time.Now(), days)
		from, to := current.bounds()

		stats := Stats{Range: rng}
		var byStatus []db.AdminOrdersByStatusRow
		g, ctx := errgroup.WithContext(c.Request.Context())
		g.Go(func() (err error) { stats.Current, err = totals(ctx, queries, current); return })
		g.Go(func() (err error) { stats.Previous, err = totals(ctx, queries, previous); return })
		g.Go(func() (err error) { stats.Customers, err = queries.AdminCustomerCount(ctx); return })
		g.Go(func() (err error) { stats.Series, err = queries.AdminSalesByDay(ctx, int32(days)); return })
		g.Go(func() (err error) { byStatus, err = queries.AdminOrdersByStatus(ctx); return })
		g.Go(func() (err error) {
			stats.TopProducts, err = queries.AdminTopProducts(ctx, db.AdminTopProductsParams{FromTime: from, ToTime: to})
			return
		})
		g.Go(func() (err error) { stats.NeedsAttention, err = queries.AdminAttention(ctx); return })
		g.Go(func() (err error) { stats.LowStock, err = queries.AdminLowStock(ctx, LowStockThreshold); return })
		g.Go(func() (err error) { stats.RecentOrders, err = queries.AdminRecentOrders(ctx); return })
		g.Go(func() (err error) { stats.RecentReviews, err = queries.AdminRecentReviews(ctx); return })
		if err := g.Wait(); err != nil {
			httpx.Internal(c, "failed to load dashboard", err)
			return
		}
		stats.OrdersByStatus = statusCounts(byStatus)
		c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: "Stats fetched", Data: stats})
	}
}

// statusCounts has every order status, 0 when there are none.
func statusCounts(rows []db.AdminOrdersByStatusRow) map[string]int64 {
	counts := make(map[string]int64, len(orderStatuses))
	for s := range orderStatuses {
		counts[s] = 0
	}
	for _, r := range rows {
		counts[r.Status] = r.Count
	}
	return counts
}

// SignUpload returns a signature for one direct browser upload to
// Cloudinary (valid for an hour), so image bytes never pass through us.
func SignUpload(cld *cloudinary.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		sig, err := cld.SignUpload(cloudinary.ProductFolder, time.Now().Unix())
		if err != nil {
			httpx.Internal(c, "failed to sign upload", err)
			return
		}
		c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: "Upload signed", Data: sig})
	}
}
