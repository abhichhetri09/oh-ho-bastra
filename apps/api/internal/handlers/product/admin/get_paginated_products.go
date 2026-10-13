package admin

import (
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/utils"
)

// maxAdminSearch bounds the q parameter.
const maxAdminSearch = 100

// GetPaginatedProducts lists every product (active or not) for the admin
// table, newest first: q searches names, status is active or inactive, and
// category narrows to a category and its subcategories.
func GetPaginatedProducts(queries repository.ProductRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		page, ok := httpx.ParsePage(c)
		if !ok {
			return
		}
		filters, ok := parseAdminFilters(c)
		if !ok {
			return
		}

		total, err := queries.CountAdminProducts(ctx, db.CountAdminProductsParams{
			NamePattern:  filters.NamePattern,
			Active:       filters.Active,
			CategorySlug: filters.CategorySlug,
		})
		if err != nil {
			httpx.Internal(c, "failed to count products", err)
			return
		}

		if !httpx.CheckPageInRange(c, page, total, pageLimit) {
			return
		}

		products := []db.AdminProductsListRow{}
		if total > 0 {
			filters.PageLimit = int32(pageLimit)
			filters.PageOffset = httpx.Offset(page, pageLimit)
			products, err = queries.AdminProductsList(ctx, filters)
			if err != nil {
				httpx.Internal(c, "failed to list products", err)
				return
			}
		}

		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Products fetched",
			Data:    products,
			Meta:    types.NewPaginationMeta(total, page, pageLimit),
		})
	}
}

func parseAdminFilters(c *gin.Context) (db.AdminProductsListParams, bool) {
	var f db.AdminProductsListParams

	q := strings.TrimSpace(c.Query("q"))
	if utf8.RuneCountInString(q) > maxAdminSearch {
		httpx.Fail(c, http.StatusBadRequest, constants.InvalidQueryParam, "q must be at most 100 characters")
		return f, false
	}
	if q != "" {
		f.NamePattern = pgtype.Text{String: utils.ContainsPattern(q), Valid: true}
	}

	switch c.Query("status") {
	case "":
	case "active":
		f.Active = pgtype.Bool{Bool: true, Valid: true}
	case "inactive":
		f.Active = pgtype.Bool{Bool: false, Valid: true}
	default:
		httpx.Fail(c, http.StatusBadRequest, constants.InvalidQueryParam, "status must be active or inactive")
		return f, false
	}

	if slug := c.Query("category"); slug != "" {
		f.CategorySlug = pgtype.Text{String: slug, Valid: true}
	}

	sort, ok := httpx.ParseSort(c, productSorts, "created")
	if !ok {
		return f, false
	}
	f.Sort, f.Dir = sort.Field, sort.Dir
	return f, true
}

// productSorts are the sortable fields and their natural direction.
var productSorts = map[string]string{
	"created": "desc", "updated": "desc", "name": "asc", "price": "asc", "stock": "asc",
}
