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
	inventoryPageSize  int64 = 25
	maxInventorySearch int   = 100
	emailsPageSize     int64 = 25
)

// Counts are the admin's to-dos, for the nav badges and the order tabs.
type Counts struct {
	OrdersByStatus map[string]int64 `json:"orders_by_status"`
	db.AdminAttentionRow
}

// GetCounts is what's waiting: orders by status, paid orders short of
// stock, failed emails and sold-out variants.
func GetCounts(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		var (
			counts   Counts
			byStatus []db.AdminOrdersByStatusRow
		)
		g, ctx := errgroup.WithContext(c.Request.Context())
		g.Go(func() (err error) { byStatus, err = queries.AdminOrdersByStatus(ctx); return })
		g.Go(func() (err error) { counts.AdminAttentionRow, err = queries.AdminAttention(ctx); return })
		if err := g.Wait(); err != nil {
			httpx.Internal(c, "failed to count", err)
			return
		}
		counts.OrdersByStatus = statusCounts(byStatus)
		c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: "Counts fetched", Data: counts})
	}
}

// InventoryPage is a page of variants with the count at each stock level
// (for the search, category and hidden filters, whatever the level filter).
type InventoryPage struct {
	Rows   []db.AdminInventoryRow     `json:"rows"`
	Counts db.AdminInventoryCountsRow `json:"counts"`
}

var stockLevels = map[string]bool{"out": true, "low": true, "in": true}

// ListInventory is every variant on sale (hidden ones with hidden=true),
// lowest stock first, filtered by a piece of the product name or SKU, a
// category with its subcategories and a stock level.
func ListInventory(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		page, ok := httpx.ParsePage(c)
		if !ok {
			return
		}
		q := strings.TrimSpace(c.Query("q"))
		if utf8.RuneCountInString(q) > maxInventorySearch {
			httpx.Fail(c, http.StatusBadRequest, constants.InvalidQueryParam, "q must be at most 100 characters")
			return
		}
		var pattern, category, stock pgtype.Text
		if q != "" {
			pattern = pgtype.Text{String: utils.ContainsPattern(q), Valid: true}
		}
		if slug := c.Query("category"); slug != "" {
			category = pgtype.Text{String: slug, Valid: true}
		}
		if s := c.Query("stock"); s != "" {
			if !stockLevels[s] {
				httpx.Fail(c, http.StatusBadRequest, constants.InvalidQueryParam, "stock must be out, low or in")
				return
			}
			stock = pgtype.Text{String: s, Valid: true}
		}
		var hidden bool
		switch c.Query("hidden") {
		case "", "false":
		case "true":
			hidden = true
		default:
			httpx.Fail(c, http.StatusBadRequest, constants.InvalidQueryParam, "hidden must be true or false")
			return
		}

		counts, err := queries.AdminInventoryCounts(ctx, db.AdminInventoryCountsParams{
			Pattern: pattern, CategorySlug: category, IncludeHidden: hidden, LowThreshold: LowStockThreshold,
		})
		if err != nil {
			httpx.Internal(c, "failed to count inventory", err)
			return
		}
		total := counts.OutOfStock + counts.Low + counts.InStock
		switch stock.String {
		case "out":
			total = counts.OutOfStock
		case "low":
			total = counts.Low
		case "in":
			total = counts.InStock
		}
		if !httpx.CheckPageInRange(c, page, total, inventoryPageSize) {
			return
		}
		inventory := InventoryPage{Rows: []db.AdminInventoryRow{}, Counts: counts}
		if total > 0 {
			inventory.Rows, err = queries.AdminInventory(ctx, db.AdminInventoryParams{
				Pattern: pattern, CategorySlug: category, IncludeHidden: hidden, Stock: stock,
				LowThreshold: LowStockThreshold,
				PageLimit:    int32(inventoryPageSize), PageOffset: httpx.Offset(page, inventoryPageSize),
			})
			if err != nil {
				httpx.Internal(c, "failed to list inventory", err)
				return
			}
		}
		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Inventory fetched",
			Data:    inventory,
			Meta:    types.NewPaginationMeta(total, page, inventoryPageSize),
		})
	}
}

// EmailsPage is a page of the outbox with the count of each status.
type EmailsPage struct {
	Rows   []db.AdminListEmailsRow `json:"rows"`
	Counts map[string]int64        `json:"counts"`
}

var emailStatuses = []string{"pending", "sent", "failed"}

// ListEmails is the email outbox, newest first, by status.
func ListEmails(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		page, ok := httpx.ParsePage(c)
		if !ok {
			return
		}
		var status pgtype.Text
		if s := c.Query("status"); s != "" {
			if s != "pending" && s != "sent" && s != "failed" {
				httpx.Fail(c, http.StatusBadRequest, constants.InvalidQueryParam, "status must be pending, sent or failed")
				return
			}
			status = pgtype.Text{String: s, Valid: true}
		}

		rows, err := queries.AdminEmailCounts(ctx)
		if err != nil {
			httpx.Internal(c, "failed to count emails", err)
			return
		}
		emails := EmailsPage{Rows: []db.AdminListEmailsRow{}, Counts: make(map[string]int64, len(emailStatuses))}
		for _, s := range emailStatuses {
			emails.Counts[s] = 0
		}
		var total int64
		for _, r := range rows {
			emails.Counts[r.Status] = r.Count
			if !status.Valid || r.Status == status.String {
				total += r.Count
			}
		}
		if !httpx.CheckPageInRange(c, page, total, emailsPageSize) {
			return
		}
		if total > 0 {
			emails.Rows, err = queries.AdminListEmails(ctx, db.AdminListEmailsParams{
				Status:    status,
				PageLimit: int32(emailsPageSize), PageOffset: httpx.Offset(page, emailsPageSize),
			})
			if err != nil {
				httpx.Internal(c, "failed to list emails", err)
				return
			}
		}
		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Emails fetched",
			Data:    emails,
			Meta:    types.NewPaginationMeta(total, page, emailsPageSize),
		})
	}
}

// RetryEmail sends a failed email back to the queue for a fresh set of
// attempts; the sender picks it up within its next tick.
func RetryEmail(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		id, ok := httpx.PathUUID(c, "emailID", constants.InvalidEmailID, "email ID")
		if !ok {
			return
		}
		n, err := queries.AdminRequeueEmail(ctx, id)
		if err != nil {
			httpx.Internal(c, "failed to requeue email", err, "email_id", utils.UUIDToString(id))
			return
		}
		email, err := queries.AdminGetEmail(ctx, id)
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(c, http.StatusNotFound, constants.EmailNotFound, "Email not found")
			return
		}
		if err != nil {
			httpx.Internal(c, "failed to get email", err, "email_id", utils.UUIDToString(id))
			return
		}
		if n == 0 {
			httpx.Fail(c, http.StatusConflict, constants.EmailNotFailed, "Only a failed email can be sent again")
			return
		}
		c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: "Email queued again", Data: email})
	}
}
