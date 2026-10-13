package auth

import (
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	session "github.com/suprimkhatri77/cartspace/backend/internal/auth"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
)

func TestLogout(t *testing.T) {
	cfg := testConfig()

	t.Run("revokes the session and clears cookies", func(t *testing.T) {
		m := &mockRepo{t: t}
		r := do(t, Logout(m, cfg), http.MethodPost, nil, map[string]string{session.RefreshCookie: refreshToken(t, cfg)})
		if r.code != http.StatusOK || !r.sessionCleared() {
			t.Fatalf("got %d %v", r.code, r.cookies)
		}
		if len(m.revokeCalls) != 1 || uuid.UUID(m.revokeCalls[0].Bytes).String() != testFamilyID {
			t.Fatalf("revoke calls %v", m.revokeCalls)
		}
	})

	for name, cookie := range map[string]string{"no cookie": "", "invalid token": "garbage"} {
		t.Run(name+" still succeeds", func(t *testing.T) {
			m := &mockRepo{t: t}
			cookies := map[string]string{}
			if cookie != "" {
				cookies[session.RefreshCookie] = cookie
			}
			r := do(t, Logout(m, cfg), http.MethodPost, nil, cookies)
			if r.code != http.StatusOK || !r.sessionCleared() || len(m.revokeCalls) != 0 {
				t.Fatalf("got %d, revokes %d", r.code, len(m.revokeCalls))
			}
		})
	}

	t.Run("revoke failure still logs out", func(t *testing.T) {
		m := &mockRepo{t: t, revoke: func(pgtype.UUID) error { return errDB }}
		r := do(t, Logout(m, cfg), http.MethodPost, nil, map[string]string{session.RefreshCookie: refreshToken(t, cfg)})
		if r.code != http.StatusOK || !r.sessionCleared() {
			t.Fatalf("got %d", r.code)
		}
	})
}

func TestMe(t *testing.T) {
	withUser := func(h gin.HandlerFunc) gin.HandlerFunc {
		return func(c *gin.Context) { c.Set(constants.UserIDKey, testUserID); h(c) }
	}

	t.Run("returns the public user", func(t *testing.T) {
		user := fakeUser(t)
		m := &mockRepo{t: t, getUserByID: func(pgtype.UUID) (db.User, error) { return user, nil }}
		r := do(t, withUser(Me(m)), http.MethodGet, nil, nil)
		data, _ := r.body.Data.(map[string]any)
		if r.code != http.StatusOK || data["email"] != "ada@example.com" {
			t.Fatalf("got %d %+v", r.code, r.body)
		}
		if _, leaked := data["password_hash"]; leaked {
			t.Fatal("password hash leaked")
		}
	})

	t.Run("deleted user is 404", func(t *testing.T) {
		m := &mockRepo{t: t, getUserByID: func(pgtype.UUID) (db.User, error) { return db.User{}, pgx.ErrNoRows }}
		if r := do(t, withUser(Me(m)), http.MethodGet, nil, nil); r.code != http.StatusNotFound {
			t.Fatalf("got %d", r.code)
		}
	})
}
