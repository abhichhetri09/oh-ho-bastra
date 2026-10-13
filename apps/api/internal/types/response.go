package types

type AppError struct {
	Code    string `json:"code"`
	Field   string `json:"field,omitempty"`
	Message string `json:"message"`
}

type APIResponse struct {
	Success bool       `json:"success"`
	Message string     `json:"message,omitempty"`
	Code    string     `json:"code,omitempty"`
	Errors  []AppError `json:"errors,omitempty"`
	Data    any        `json:"data,omitempty"`
	Meta    any        `json:"meta,omitempty"`
}

type PaginationMeta struct {
	Total      int64 `json:"total"`
	TotalPages int64 `json:"total_pages"`
	Page       int   `json:"page"`
	Limit      int64 `json:"limit"`
	Offset     int64 `json:"offset"`
}

// NewPaginationMeta builds the meta block for a page of `limit` items.
func NewPaginationMeta(total int64, page int, limit int64) PaginationMeta {
	return PaginationMeta{
		Total:      total,
		TotalPages: (total + limit - 1) / limit,
		Page:       page,
		Limit:      limit,
		Offset:     int64(page-1) * limit,
	}
}
