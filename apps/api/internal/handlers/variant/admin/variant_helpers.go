package admin

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
)

// Unique constraints on product_variants (migrations/000006).
const (
	uniqueCombination    = "uq_variant_combination"
	uniqueDefaultVariant = "unique_default_product_variant"
)

// variantIDs parses the :productID and :variantID path parameters.
func variantIDs(c *gin.Context) (productID, variantID pgtype.UUID, ok bool) {
	if productID, ok = httpx.PathUUID(c, "productID", constants.InvalidProductID, "product ID"); !ok {
		return
	}
	variantID, ok = httpx.PathUUID(c, "variantID", constants.InvalidVariantID, "variant ID")
	return
}

// toOfferPrice maps an optional offer price in cents to a nullable column.
func toOfferPrice(cents *int) pgtype.Int4 {
	if cents == nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: int32(*cents), Valid: true}
}

// toOfferExpiry maps an offer's optional end to a nullable column. Without
// an offer there is nothing to expire, so the end is dropped.
func toOfferExpiry(offer *int, ends *time.Time) pgtype.Timestamptz {
	if offer == nil || ends == nil {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: *ends, Valid: true}
}

// writeVariantError maps a variant insert/update failure to a response.
func writeVariantError(c *gin.Context, err error, msg string) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		switch pgErr.ConstraintName {
		case uniqueCombination:
			httpx.Fail(c, http.StatusConflict, constants.VariantAlreadyExists, "Variant with this combination already exists")
			return
		case uniqueDefaultVariant:
			httpx.Fail(c, http.StatusConflict, constants.DefaultVariantExists, "This product already has a default variant")
			return
		}
	}
	httpx.Internal(c, msg, err)
}
