package types

import (
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
)

type ReviewRequest struct {
	Rating int    `json:"rating" binding:"required,min=1,max=5"`
	Title  string `json:"title" binding:"required,not_blank,max=100"`
	Body   string `json:"body" binding:"required,not_blank,max=2000"`
}

// ReviewSummary describes a product's published reviews.
type ReviewSummary struct {
	Average float64 `json:"average"`
	Count   int64   `json:"count"`
	// Distribution counts reviews per star: index 0 is 1 star, 4 is 5.
	Distribution [5]int32 `json:"distribution"`
}

// PublicReview is a review as shoppers see it: the author is "Ada L.".
type PublicReview struct {
	ID        pgtype.UUID        `json:"id"`
	Rating    int16              `json:"rating"`
	Title     string             `json:"title"`
	Body      string             `json:"body"`
	Author    string             `json:"author"`
	CreatedAt pgtype.Timestamptz `json:"created_at"`
	UpdatedAt pgtype.Timestamptz `json:"updated_at"`
}

type ReviewList struct {
	Summary ReviewSummary  `json:"summary"`
	Reviews []PublicReview `json:"reviews"`
}

// MyReview is the signed-in user's standing on a product's reviews.
type MyReview struct {
	// CanReview: a paid order of theirs holds the product.
	CanReview bool       `json:"can_review"`
	Review    *db.Review `json:"review"`
}
