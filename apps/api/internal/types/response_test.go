package types

import "testing"

func TestNewPaginationMeta(t *testing.T) {
	tests := []struct {
		total, limit int64
		page         int
		want         PaginationMeta
	}{
		{0, 20, 1, PaginationMeta{Total: 0, TotalPages: 0, Page: 1, Limit: 20, Offset: 0}},
		{1, 20, 1, PaginationMeta{Total: 1, TotalPages: 1, Page: 1, Limit: 20, Offset: 0}},
		{20, 20, 1, PaginationMeta{Total: 20, TotalPages: 1, Page: 1, Limit: 20, Offset: 0}},
		{21, 20, 2, PaginationMeta{Total: 21, TotalPages: 2, Page: 2, Limit: 20, Offset: 20}},
	}
	for _, tt := range tests {
		if got := NewPaginationMeta(tt.total, tt.page, tt.limit); got != tt.want {
			t.Errorf("NewPaginationMeta(%d, %d, %d) = %+v, want %+v", tt.total, tt.page, tt.limit, got, tt.want)
		}
	}
}
