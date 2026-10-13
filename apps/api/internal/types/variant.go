package types

import "time"

type VariantProperty struct {
	Name  string `json:"name" binding:"required,min=2,max=20"`
	Value string `json:"value" binding:"required,min=1,max=20"`
	Type  string `json:"type" binding:"required,oneof=text color"`
}

// Prices are integer cents; max 100000000 is 1,000,000.00.
type CreateProductVariant struct {
	Images         []string          `json:"images" binding:"required,min=1,max=5,dive,url"`
	ImagePublicIDs []string          `json:"image_public_ids" label:"Image public IDs" binding:"required,min=1,max=5,samelen=Images,dive,required" msg_samelen:"Provide one public ID per image"`
	Stock          *int              `json:"stock" binding:"required,min=0,max=10000"`
	SellingPrice   int               `json:"selling_price" binding:"required,gt=0,max=100000000"`
	OfferPrice     *int              `json:"offer_price" binding:"omitempty,gt=0,ltfield=SellingPrice"`
	OfferExpiresAt *time.Time        `json:"offer_expires_at" binding:"omitempty"`
	IsDefault      *bool             `json:"is_default" binding:"required"`
	IsActive       *bool             `json:"is_active" binding:"required"`
	Properties     []VariantProperty `json:"properties" binding:"max=10,unique=Name,dive"`
}

// UpdateProductVariant has no stock: that is UpdateStock's own write.
type UpdateProductVariant struct {
	Images         []string   `json:"images" binding:"required,min=1,max=5,dive,url"`
	ImagePublicIDs []string   `json:"image_public_ids" label:"Image public IDs" binding:"required,min=1,max=5,samelen=Images,dive,required" msg_samelen:"Provide one public ID per image"`
	SellingPrice   int        `json:"selling_price" binding:"required,gt=0,max=100000000"`
	OfferPrice     *int       `json:"offer_price" binding:"omitempty,gt=0,ltfield=SellingPrice"`
	OfferExpiresAt *time.Time `json:"offer_expires_at" binding:"omitempty"`
	IsDefault      *bool      `json:"is_default" binding:"required"`
	IsActive       *bool      `json:"is_active" binding:"required"`
}

type UpdateStock struct {
	// A pointer so 0 passes "required".
	Stock *int `json:"stock" binding:"required,min=0,max=10000"`
}
