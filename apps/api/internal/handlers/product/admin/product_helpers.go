package admin

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/utils"
)

const pageLimit int64 = 20

// productSlug slugifies name, adding a random suffix when another product
// has the slug. A product keeps its current slug when the name still
// slugifies to it. On failure it writes a 500 and returns false.
func productSlug(c *gin.Context, queries repository.ProductRepository, name, current string) (string, bool) {
	slug := utils.Slugify(name)
	if current != "" && utils.SlugMatches(current, slug) {
		return current, true
	}

	exists, err := queries.ProductSlugExists(c.Request.Context(), slug)
	if err != nil {
		httpx.Internal(c, "failed to check product slug", err)
		return "", false
	}
	if !exists {
		return slug, true
	}

	slug, err = utils.SlugWithSuffix(slug)
	if err != nil {
		httpx.Internal(c, "failed to generate product slug", err)
		return "", false
	}
	return slug, true
}

// productColumns maps a validated request onto the product columns.
type productColumns struct {
	categoryID  pgtype.UUID
	description pgtype.Text
	features    []string
}

func toProductColumns(req *types.CreateProduct) productColumns {
	// the binding's uuid rule already validated the format
	categoryID, _ := utils.ConvertToUUID(req.CategoryID)

	features := req.Features
	if features == nil {
		features = []string{} // the column is NOT NULL
	}

	return productColumns{
		categoryID:  categoryID,
		description: pgtype.Text{String: req.Description, Valid: true},
		features:    features,
	}
}

// writeProductError maps a create/update failure to a response.
func writeProductError(c *gin.Context, err error, msg string) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23503" && pgErr.ConstraintName == "products_category_id_fkey" {
		httpx.Fail(c, http.StatusNotFound, constants.CategoryNotFound, "Category not found")
		return
	}
	httpx.Internal(c, msg, err)
}
