package admin

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/rlog"
)

// maxExportRows caps one CSV export; narrow the dates for more.
const maxExportRows = 10_000

var exportHeader = []string{
	"order", "status", "placed_at", "paid_at", "shipped_at", "customer", "email",
	"items", "subtotal", "shipping", "total", "currency", "tracking_number", "ship_city", "ship_country",
}

// ExportOrders is the orders list as CSV: the same filters and order as
// ListOrders, every matching order up to maxExportRows, amounts in major
// units. Cells that a spreadsheet would run as a formula are defused.
func ExportOrders(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		f, ok := orderFilters(c)
		if !ok {
			return
		}
		rows, err := queries.AdminExportOrders(c.Request.Context(), db.AdminExportOrdersParams{
			Status: f.status, Number: f.number, EmailPattern: f.email, UserID: f.customer,
			FromDate: f.fromDate, ToDate: f.toDate, Sort: f.sort.Field, Dir: f.sort.Dir,
			MaxRows: maxExportRows,
		})
		if err != nil {
			httpx.Internal(c, "failed to export orders", err)
			return
		}

		name := fmt.Sprintf("orders-%s.csv", time.Now().UTC().Format(time.DateOnly))
		c.Header("Content-Type", "text/csv; charset=utf-8")
		c.Header("Content-Disposition", `attachment; filename="`+name+`"`)
		c.Header("Cache-Control", "no-store")
		c.Status(http.StatusOK)

		w := csv.NewWriter(c.Writer)
		_ = w.Write(exportHeader)
		for _, r := range rows {
			_ = w.Write(exportRecord(r))
		}
		w.Flush()
		if err := w.Error(); err != nil {
			// The status is sent; the client gets a cut-off file.
			rlog.Error(c, "export orders: write", err)
		}
	}
}

func exportRecord(r db.AdminExportOrdersRow) []string {
	return []string{
		"OHB-" + strconv.FormatInt(r.Number, 10),
		r.Status,
		timestamp(r.CreatedAt),
		timestamp(r.PaidAt),
		timestamp(r.ShippedAt),
		safeCell(r.CustomerName),
		safeCell(r.Email),
		strconv.Itoa(int(r.ItemCount)),
		money(int64(r.Subtotal)),
		money(int64(r.Shipping)),
		money(int64(r.Total)),
		r.Currency,
		safeCell(r.TrackingNumber.String),
		safeCell(r.ShipCity),
		r.ShipCountry,
	}
}

func timestamp(t pgtype.Timestamptz) string {
	if !t.Valid {
		return ""
	}
	return t.Time.UTC().Format(time.RFC3339)
}

// money is cents as "1234.50".
func money(cents int64) string {
	return fmt.Sprintf("%d.%02d", cents/100, cents%100)
}

// safeCell keeps a spreadsheet from running text as a formula (CSV
// injection): a cell starting with = + - @, a tab or a carriage return gets
// a leading apostrophe, which spreadsheets show as text.
func safeCell(s string) string {
	if s == "" {
		return s
	}
	switch s[0] {
	case '=', '+', '-', '@', '\t', '\r':
		return "'" + s
	}
	return s
}
