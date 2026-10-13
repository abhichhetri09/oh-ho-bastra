package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	session "github.com/suprimkhatri77/cartspace/backend/internal/auth"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/utils"
)

func TestCurrentSessionID(t *testing.T) {
	cfg := testConfig()
	family, _ := utils.ConvertToUUID(testFamilyID)
	user := db.User{ID: family, Email: "ada@example.org", Role: "customer"}
	refresh, err := session.SignRefresh(cfg, user, family, time.Now().Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}

	ctxWith := func(cookie string) *gin.Context {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodPost, "/", nil)
		if cookie != "" {
			c.Request.AddCookie(&http.Cookie{Name: session.RefreshCookie, Value: cookie})
		}
		return c
	}

	if got := currentSessionID(ctxWith(refresh), cfg); got != family {
		t.Errorf("with a refresh cookie: got %v, want its family %v", got, family)
	}
	// No cookie or a forged one: an id no session has (NULL), so every
	// session is signed out.
	for name, cookie := range map[string]string{"none": "", "forged": refresh + "x"} {
		if got := currentSessionID(ctxWith(cookie), cfg); got.Valid {
			t.Errorf("%s: got %v, want an invalid id", name, got)
		}
	}
}
