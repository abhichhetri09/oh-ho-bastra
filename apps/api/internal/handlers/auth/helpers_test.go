package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/crypto/bcrypt"

	session "github.com/suprimkhatri77/cartspace/backend/internal/auth"
	"github.com/suprimkhatri77/cartspace/backend/internal/config"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/validator"
)

const (
	testUserID   = "11111111-1111-1111-1111-111111111111"
	testFamilyID = "22222222-2222-2222-2222-222222222222"
	testPassword = "secret123"
)

var errDB = errors.New("db down")

// mockRepo implements repository.AuthRepository. Nil funcs fail the test if called.
type mockRepo struct {
	t *testing.T

	createUser     func(db.CreateUserParams) (db.User, error)
	getUserByEmail func(string) (db.User, error)
	getUserByID    func(pgtype.UUID) (db.User, error)
	createSession  func(db.CreateSessionParams) (db.Session, error)
	getSession     func(pgtype.UUID) (db.Session, error)
	rotate         func(db.RotateSessionTokenParams) (db.Session, error)
	revoke         func(pgtype.UUID) error

	rotateCalls []db.RotateSessionTokenParams
	revokeCalls []pgtype.UUID
	created     []db.CreateUserParams
}

func (m *mockRepo) fail(name string) { m.t.Helper(); m.t.Fatalf("unexpected call to %s", name) }

func (m *mockRepo) CreateUser(_ context.Context, p db.CreateUserParams) (db.User, error) {
	m.created = append(m.created, p)
	if m.createUser == nil {
		m.fail("CreateUser")
	}
	return m.createUser(p)
}
func (m *mockRepo) GetUserByEmail(_ context.Context, e string) (db.User, error) {
	if m.getUserByEmail == nil {
		m.fail("GetUserByEmail")
	}
	return m.getUserByEmail(e)
}
func (m *mockRepo) GetUserByID(_ context.Context, id pgtype.UUID) (db.User, error) {
	if m.getUserByID == nil {
		m.fail("GetUserByID")
	}
	return m.getUserByID(id)
}
func (m *mockRepo) CreateSession(_ context.Context, p db.CreateSessionParams) (db.Session, error) {
	if m.createSession == nil {
		m.fail("CreateSession")
	}
	return m.createSession(p)
}
func (m *mockRepo) GetActiveSessionByID(_ context.Context, id pgtype.UUID) (db.Session, error) {
	if m.getSession == nil {
		m.fail("GetActiveSessionByID")
	}
	return m.getSession(id)
}
func (m *mockRepo) RotateSessionToken(_ context.Context, p db.RotateSessionTokenParams) (db.Session, error) {
	m.rotateCalls = append(m.rotateCalls, p)
	if m.rotate == nil {
		m.fail("RotateSessionToken")
	}
	return m.rotate(p)
}
func (m *mockRepo) RevokeSession(_ context.Context, id pgtype.UUID) error {
	m.revokeCalls = append(m.revokeCalls, id)
	if m.revoke == nil {
		return nil
	}
	return m.revoke(id)
}
func (m *mockRepo) RevokeAllUserSessions(context.Context, pgtype.UUID) error {
	m.fail("RevokeAllUserSessions")
	return nil
}

func testConfig() *config.Config {
	return &config.Config{
		JWTAccessSecret:    strings.Repeat("a", 32),
		JWTRefreshSecret:   strings.Repeat("r", 32),
		AccessTokenTTL:     15 * time.Minute,
		RefreshTokenTTL:    30 * 24 * time.Hour,
		RefreshReuseWindow: 30 * time.Second,
		MaxSessionAge:      90 * 24 * time.Hour,
	}
}

func uid(s string) pgtype.UUID { return pgtype.UUID{Bytes: uuid.MustParse(s), Valid: true} }

func fakeUser(t *testing.T) db.User {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte(testPassword), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	return db.User{ID: uid(testUserID), Name: "Ada", Email: "ada@example.com", PasswordHash: string(hash), Role: constants.RoleCustomer}
}

// refreshToken signs a refresh token for the test user and family.
func refreshToken(t *testing.T, cfg *config.Config) string {
	t.Helper()
	tok, err := session.SignRefresh(cfg, db.User{ID: uid(testUserID)}, uid(testFamilyID), time.Now().Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

// activeSession returns a session whose current token is currentToken.
func activeSession(currentToken string) db.Session {
	return db.Session{
		ID:               uid(testFamilyID),
		UserID:           uid(testUserID),
		CurrentTokenHash: session.HashRefreshToken(currentToken),
		CreatedAt:        pgtype.Timestamptz{Time: time.Now().Add(-time.Hour), Valid: true},
		ExpiresAt:        pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true},
	}
}

// rotatedSession: presented token was rotated rotatedAgo; current is something else.
func rotatedSession(presented string, rotatedAgo time.Duration) db.Session {
	s := activeSession("someone-else")
	s.PreviousTokenHash = pgtype.Text{String: session.HashRefreshToken(presented), Valid: true}
	s.PreviousRotatedAt = pgtype.Timestamptz{Time: time.Now().Add(-rotatedAgo), Valid: true}
	return s
}

type result struct {
	code    int
	body    types.APIResponse
	cookies map[string]*http.Cookie
}

func do(t *testing.T, h gin.HandlerFunc, method string, body any, cookies map[string]string) result {
	t.Helper()
	gin.SetMode(gin.TestMode)
	validator.Init()
	r := gin.New()
	r.Handle(method, "/", h)

	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, "/", &buf)
	req.Header.Set("Content-Type", "application/json")
	for k, v := range cookies {
		req.AddCookie(&http.Cookie{Name: k, Value: v})
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	res := result{code: w.Code, cookies: map[string]*http.Cookie{}}
	if err := json.Unmarshal(w.Body.Bytes(), &res.body); err != nil {
		t.Fatalf("decode body %q: %v", w.Body.String(), err)
	}
	for _, c := range w.Result().Cookies() {
		res.cookies[c.Name] = c
	}
	return res
}

// sessionSet: all three cookies set with positive max-age.
func (r result) sessionSet() bool {
	for _, n := range []string{session.AccessCookie, session.RefreshCookie, session.LoggedInCookie} {
		if c, ok := r.cookies[n]; !ok || c.MaxAge <= 0 || c.Value == "" {
			return false
		}
	}
	return true
}

// sessionCleared: all three cookies expired.
func (r result) sessionCleared() bool {
	for _, n := range []string{session.AccessCookie, session.RefreshCookie, session.LoggedInCookie} {
		if c, ok := r.cookies[n]; !ok || c.MaxAge >= 0 {
			return false
		}
	}
	return true
}
