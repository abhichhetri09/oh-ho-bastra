package admin

import (
	"net/http"

	"github.com/gin-gonic/gin"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/validator"
)

func CreateProduct(queries repository.ProductRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		req, ok := validator.BindJSON[types.CreateProduct](c)
		if !ok {
			return
		}

		slug, ok := productSlug(c, queries, req.Name, "")
		if !ok {
			return
		}

		cols := toProductColumns(req)
		product, err := queries.CreateProduct(c.Request.Context(), db.CreateProductParams{
			Name:           req.Name,
			Slug:           slug,
			CategoryID:     cols.categoryID,
			Description:    cols.description,
			Features:       cols.features,
			Images:         req.Images,
			ImagePublicIds: req.ImagePublicIDs,
			IsActive:       *req.IsActive,
			IsFeatured:     *req.IsFeatured,
		})
		if err != nil {
			writeProductError(c, err, "failed to create product")
			return
		}

		c.JSON(http.StatusCreated, types.APIResponse{
			Success: true,
			Message: "Product created",
			Data:    product,
		})
	}
}
