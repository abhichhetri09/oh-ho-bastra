package auth

import (
	"net/http"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	session "github.com/suprimkhatri77/cartspace/backend/internal/auth"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
)

func TestRefresh(t *testing.T) {
	cfg := testConfig()
	user := fakeUser(t)
	getUser := func(pgtype.UUID) (db.User, error) { return user, nil }

	call := func(t *testing.T, m *mockRepo, token string) result {
		cookies := map[string]string{}
		if token != "" {
			cookies[session.RefreshCookie] = token
		}
		return do(t, Refresh(m, cfg), http.MethodPost, nil, cookies)
	}

	t.Run("current token rotates with compare-and-swap", func(t *testing.T) {
		tok := refreshToken(t, cfg)
		m := &mockRepo{t: t, getUserByID: getUser,
			getSession: func(pgtype.UUID) (db.Session, error) { return activeSession(tok), nil },
			rotate:     func(p db.RotateSessionTokenParams) (db.Session, error) { return db.Session{}, nil },
		}
		r := call(t, m, tok)
		if r.code != http.StatusOK || !r.sessionSet() {
			t.Fatalf("got %d %+v", r.code, r.body)
		}
		p := m.rotateCalls[0]
		if p.ExpectedTokenHash != session.HashRefreshToken(tok) {
			t.Fatal("CAS must expect the presented token's hash")
		}
		if p.NewTokenHash != session.HashRefreshToken(r.cookies[session.RefreshCookie].Value) {
			t.Fatal("stored hash must match the new refresh cookie")
		}
	})

	t.Run("rotation never extends past the max session age", func(t *testing.T) {
		tok := refreshToken(t, cfg)
		sess := activeSession(tok)
		sess.CreatedAt = pgtype.Timestamptz{Time: time.Now().Add(-89 * 24 * time.Hour), Valid: true}
		m := &mockRepo{t: t, getUserByID: getUser,
			getSession: func(pgtype.UUID) (db.Session, error) { return sess, nil },
			rotate:     func(db.RotateSessionTokenParams) (db.Session, error) { return db.Session{}, nil },
		}
		r := call(t, m, tok)
		limit := sess.CreatedAt.Time.Add(cfg.MaxSessionAge)
		if got := m.rotateCalls[0].ExpiresAt.Time; !got.Equal(limit) {
			t.Fatalf("expires_at %v, want capped %v", got, limit)
		}
		if ma := r.cookies[session.RefreshCookie].MaxAge; ma > int(25*time.Hour/time.Second) {
			t.Fatalf("refresh cookie max-age %d not capped", ma)
		}
	})

	t.Run("previous token inside grace window gets an access token only", func(t *testing.T) {
		tok := refreshToken(t, cfg)
		m := &mockRepo{t: t, getUserByID: getUser,
			getSession: func(pgtype.UUID) (db.Session, error) { return rotatedSession(tok, 5*time.Second), nil },
		}
		r := call(t, m, tok)
		if r.code != http.StatusOK || r.cookies[session.AccessCookie] == nil {
			t.Fatalf("got %d %v", r.code, r.cookies)
		}
		if _, ok := r.cookies[session.RefreshCookie]; ok {
			t.Fatal("grace must not touch the refresh cookie")
		}
		if len(m.rotateCalls) != 0 || len(m.revokeCalls) != 0 {
			t.Fatal("grace must not rotate or revoke")
		}
	})

	t.Run("previous token after grace window revokes the session", func(t *testing.T) {
		tok := refreshToken(t, cfg)
		m := &mockRepo{t: t, getUserByID: getUser,
			getSession: func(pgtype.UUID) (db.Session, error) { return rotatedSession(tok, time.Minute), nil },
		}
		r := call(t, m, tok)
		if r.code != http.StatusUnauthorized || !r.sessionCleared() || len(m.revokeCalls) != 1 {
			t.Fatalf("got %d, revokes %d, cookies %v", r.code, len(m.revokeCalls), r.cookies)
		}
	})

	t.Run("lost compare-and-swap falls back to grace", func(t *testing.T) {
		tok := refreshToken(t, cfg)
		loads := 0
		m := &mockRepo{t: t, getUserByID: getUser,
			getSession: func(pgtype.UUID) (db.Session, error) {
				loads++
				if loads == 1 {
					return activeSession(tok), nil // looked current...
				}
				return rotatedSession(tok, 0), nil // ...but a concurrent request rotated it
			},
			rotate: func(db.RotateSessionTokenParams) (db.Session, error) { return db.Session{}, pgx.ErrNoRows },
		}
		r := call(t, m, tok)
		if r.code != http.StatusOK || r.cookies[session.AccessCookie] == nil || len(m.revokeCalls) != 0 {
			t.Fatalf("got %d, revokes %d", r.code, len(m.revokeCalls))
		}
		if _, ok := r.cookies[session.RefreshCookie]; ok {
			t.Fatal("loser must not overwrite the winner's refresh cookie")
		}
	})

	t.Run("lost compare-and-swap outside grace is 401 without revoking", func(t *testing.T) {
		tok := refreshToken(t, cfg)
		loads := 0
		m := &mockRepo{t: t, getUserByID: getUser,
			getSession: func(pgtype.UUID) (db.Session, error) {
				loads++
				if loads == 1 {
					return activeSession(tok), nil
				}
				return activeSession("rotated-by-someone-twice"), nil
			},
			rotate: func(db.RotateSessionTokenParams) (db.Session, error) { return db.Session{}, pgx.ErrNoRows },
		}
		r := call(t, m, tok)
		if r.code != http.StatusUnauthorized || len(m.revokeCalls) != 0 {
			t.Fatalf("got %d, revokes %d", r.code, len(m.revokeCalls))
		}
	})

	t.Run("expired or revoked session is 401 and clears cookies", func(t *testing.T) {
		m := &mockRepo{t: t, getSession: func(pgtype.UUID) (db.Session, error) { return db.Session{}, pgx.ErrNoRows }}
		r := call(t, m, refreshToken(t, cfg))
		if r.code != http.StatusUnauthorized || !r.sessionCleared() {
			t.Fatalf("got %d %v", r.code, r.cookies)
		}
	})

	t.Run("db outage is 500 and keeps cookies", func(t *testing.T) {
		m := &mockRepo{t: t, getSession: func(pgtype.UUID) (db.Session, error) { return db.Session{}, errDB }}
		r := call(t, m, refreshToken(t, cfg))
		if r.code != http.StatusInternalServerError || len(r.cookies) != 0 {
			t.Fatalf("got %d %v", r.code, r.cookies)
		}
	})

	t.Run("token whose user does not own the session is 401", func(t *testing.T) {
		tok := refreshToken(t, cfg)
		sess := activeSession(tok)
		sess.UserID = uid("33333333-3333-3333-3333-333333333333")
		m := &mockRepo{t: t, getSession: func(pgtype.UUID) (db.Session, error) { return sess, nil }}
		if r := call(t, m, tok); r.code != http.StatusUnauthorized {
			t.Fatalf("got %d", r.code)
		}
	})

	t.Run("missing cookie is 401", func(t *testing.T) {
		r := call(t, &mockRepo{t: t}, "")
		if r.code != http.StatusUnauthorized || r.body.Code != constants.MissingRefreshToken {
			t.Fatalf("got %d %+v", r.code, r.body)
		}
	})

	t.Run("access token in the refresh cookie is 401", func(t *testing.T) {
		access, _ := session.NewAccessToken(cfg, user)
		if r := call(t, &mockRepo{t: t}, access); r.code != http.StatusUnauthorized {
			t.Fatalf("got %d", r.code)
		}
	})
}
