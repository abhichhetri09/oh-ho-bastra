package cart

import (
	"net/http"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
)

func TestCheckAdd(t *testing.T) {
	onSale := func(stock int) availability { return availability{stock: stock, available: true} }
	tests := []struct {
		name     string
		existing int
		add      int
		lines    int64
		v        availability
		wantCode string
	}{
		{"new line within stock", 0, 2, 3, onSale(5), ""},
		{"tops up an existing line", 2, 3, 3, onSale(5), ""},
		{"counts what is already in the cart", 4, 2, 3, onSale(5), constants.InsufficientStock},
		{"out of stock", 0, 1, 0, onSale(0), constants.InsufficientStock},
		{"off sale", 0, 1, 0, availability{stock: 9}, constants.VariantUnavailable},
		{"per-line limit", 8, 3, 3, onSale(100), constants.CartQuantityLimit},
		{"exactly the per-line limit", 8, 2, 3, onSale(100), ""},
		{"full cart refuses a new line", 0, 1, MaxCartLines, onSale(5), constants.CartFull},
		{"full cart still tops up a line", 1, 1, MaxCartLines, onSale(5), ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := checkAdd(tt.existing, tt.add, tt.lines, tt.v)
			if code(got) != tt.wantCode {
				t.Fatalf("code = %q, want %q", code(got), tt.wantCode)
			}
			if got != nil && got.status != http.StatusConflict {
				t.Errorf("status = %d, want 409", got.status)
			}
		})
	}
}

func TestCheckUpdate(t *testing.T) {
	tests := []struct {
		name          string
		current, next int
		v             availability
		wantCode      string
	}{
		{"raise within stock", 1, 3, availability{stock: 3, available: true}, ""},
		{"raise past stock", 1, 4, availability{stock: 3, available: true}, constants.InsufficientStock},
		{"lowering a short line is allowed", 5, 2, availability{stock: 1, available: true}, ""},
		{"lowering an off-sale line is allowed", 3, 1, availability{stock: 9}, ""},
		{"raising an off-sale line is not", 1, 2, availability{stock: 9}, constants.VariantUnavailable},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := code(checkUpdate(tt.current, tt.next, tt.v)); got != tt.wantCode {
				t.Fatalf("code = %q, want %q", got, tt.wantCode)
			}
		})
	}
}

func TestInsufficientMessage(t *testing.T) {
	for _, tt := range []struct {
		stock, inCart int
		want          string
	}{
		{0, 0, "This item is out of stock"},
		{2, 0, "Only 2 left"},
		{2, 2, "Only 2 left, and 2 already in your bag"},
	} {
		if got := insufficient(tt.stock, tt.inCart).message; got != tt.want {
			t.Errorf("insufficient(%d, %d) = %q, want %q", tt.stock, tt.inCart, got, tt.want)
		}
	}
}

func TestBuildCart(t *testing.T) {
	cart := buildCart([]db.GetCartLinesRow{
		{Quantity: 2, Price: 1500, Stock: 30, Available: true, OfferPrice: pgtype.Int4{Int32: 1500, Valid: true}},
		{Quantity: 3, Price: 1000, Stock: 1, Available: true},  // above its stock
		{Quantity: 1, Price: 5000, Stock: 9, Available: false}, // off sale
	})

	if cart.ItemCount != 2 || cart.Subtotal != 3000 || !cart.HasIssues {
		t.Fatalf("count %d subtotal %d issues %v, want 2 3000 true", cart.ItemCount, cart.Subtotal, cart.HasIssues)
	}
	want := []struct {
		lineTotal   int64
		maxQuantity int32
	}{{3000, MaxLineQuantity}, {3000, 1}, {5000, 0}}
	for i, w := range want {
		if cart.Items[i].LineTotal != w.lineTotal || cart.Items[i].MaxQuantity != w.maxQuantity {
			t.Errorf("line %d: total %d max %d, want %d %d", i,
				cart.Items[i].LineTotal, cart.Items[i].MaxQuantity, w.lineTotal, w.maxQuantity)
		}
	}

	empty := buildCart(nil)
	if empty.Items == nil || empty.ItemCount != 0 || empty.HasIssues {
		t.Errorf("empty cart = %+v, want [] items and no issues", empty)
	}
}

func code(err *cartError) string {
	if err == nil {
		return ""
	}
	return err.code
}
