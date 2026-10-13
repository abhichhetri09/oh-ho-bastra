package admin

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
)

func TestPeriods(t *testing.T) {
	// Late on 12 Oct in UTC+5:45 is still 12 Oct in UTC.
	now := time.Date(2026, 10, 12, 23, 30, 0, 0, time.FixedZone("NPT", 5*3600+45*60))
	current, previous := periods(now, 7)
	day := func(d int) time.Time { return time.Date(2026, 10, d, 0, 0, 0, 0, time.UTC) }
	if !current.from.Equal(day(6)) || !current.to.Equal(day(13)) {
		t.Errorf("current = %v → %v, want 6 Oct → 13 Oct", current.from, current.to)
	}
	if !previous.from.Equal(time.Date(2026, 9, 29, 0, 0, 0, 0, time.UTC)) || !previous.to.Equal(current.from) {
		t.Errorf("previous = %v → %v, want 29 Sep → 6 Oct", previous.from, previous.to)
	}
}

func TestStatusCounts(t *testing.T) {
	got := statusCounts([]db.AdminOrdersByStatusRow{{Status: "paid", Count: 3}})
	if len(got) != len(orderStatuses) || got["paid"] != 3 || got["refunded"] != 0 {
		t.Errorf("statusCounts = %v", got)
	}
}

func TestStatsRejectsUnknownRange(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/stats", GetStats(nil))
	for _, q := range []string{"?range=1y", "?range=", "?range=30"} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/stats"+q, nil))
		if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), constants.InvalidQueryParam) {
			t.Errorf("%s: %d %s", q, w.Code, w.Body.String())
		}
	}
}
