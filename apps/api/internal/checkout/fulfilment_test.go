package checkout

import "testing"

func TestCanApply(t *testing.T) {
	statuses := []string{"pending", "paid", "shipped", "delivered", "cancelled", "refunded"}
	allowed := map[Action][]string{
		Ship:    {"paid"},
		Deliver: {"shipped"},
		Cancel:  {"pending"},
		Refund:  {"paid", "shipped", "delivered"},
	}
	for action, ok := range allowed {
		for _, status := range statuses {
			want := false
			for _, s := range ok {
				want = want || s == status
			}
			if got := CanApply(action, status); got != want {
				t.Errorf("CanApply(%s, %s) = %v, want %v", action, status, got, want)
			}
		}
	}
	if CanApply("archive", "paid") {
		t.Error("an unknown action applies to nothing")
	}
}

func TestTransitionMessage(t *testing.T) {
	if got := errTransition(Cancel, "shipped").Message; got != "This order is shipped, so it can't be cancelled" {
		t.Errorf("message = %q", got)
	}
}
