package types

import db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"

// CreateProduct is also the update body (update replaces every field).
// Features may be omitted or empty.
type CreateProduct struct {
	Name           string   `json:"name" binding:"required,min=2,max=50"`
	Images         []string `json:"images" binding:"required,min=1,max=5,dive,url"`
	ImagePublicIDs []string `json:"image_public_ids" label:"Image public IDs" binding:"required,min=1,max=5,samelen=Images,dive,required" msg_samelen:"Provide one public ID per image"`
	Description    string   `json:"description" binding:"required,max=5000"`
	Features       []string `json:"features" binding:"max=7,dive,required,max=100"`
	CategoryID     string   `json:"category_id" label:"Category" binding:"required,uuid"`
	IsActive       *bool    `json:"is_active" binding:"required"`
	IsFeatured     *bool    `json:"is_featured" binding:"required"`
}

type UpdateProduct CreateProduct

// ProductListing is a page of storefront products with the filter options
// and price range of everything in scope (unfiltered by price and options).
type ProductListing struct {
	Products      []db.StorefrontProduct             `json:"products"`
	FilterOptions []db.GetStorefrontFilterOptionsRow `json:"filter_options"`
	PriceRange    db.GetStorefrontPriceRangeRow      `json:"price_range"`
}

// handlers/product/user/get_product.go response sructure
type GetProductDetailResponse struct {
	ProductDetail   db.GetProductWithDefaultVariantBySlugRow `json:"product_detail"`
	Variants        []db.GetVariantsByProductSlugRow         `json:"variants"`
	RelatedProducts []db.StorefrontProduct                   `json:"related_products"`
}
