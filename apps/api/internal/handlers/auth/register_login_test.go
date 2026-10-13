package auth

import (
	"net/http"
	"reflect"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
)

func okSession(p db.CreateSessionParams) (db.Session, error) { return db.Session{ID: p.ID}, nil }

func TestRegister(t *testing.T) {
	body := map[string]string{"name": "Ada Lovelace", "email": "  Ada@Example.COM ", "password": " spaced pw "}

	t.Run("created with lowercased email and session cookies", func(t *testing.T) {
		m := &mockRepo{t: t, createSession: okSession, createUser: func(p db.CreateUserParams) (db.User, error) {
			return db.User{ID: uid(testUserID), Name: p.Name, Email: p.Email, Role: p.Role}, nil
		}}
		r := do(t, Register(m, testConfig()), http.MethodPost, body, nil)
		if r.code != http.StatusCreated || !r.sessionSet() {
			t.Fatalf("code %d, cookies %v", r.code, r.cookies)
		}
		if got := m.created[0]; got.Email != "ada@example.com" || got.Role != constants.RoleCustomer {
			t.Fatalf("created %+v", got)
		}
	})

	t.Run("duplicate email is 409", func(t *testing.T) {
		m := &mockRepo{t: t, createUser: func(db.CreateUserParams) (db.User, error) {
			return db.User{}, &pgconn.PgError{Code: "23505"}
		}}
		r := do(t, Register(m, testConfig()), http.MethodPost, body, nil)
		if r.code != http.StatusConflict || r.body.Code != constants.UserAlreadyExists {
			t.Fatalf("got %d %+v", r.code, r.body)
		}
	})

	t.Run("db email check violation is 400", func(t *testing.T) {
		m := &mockRepo{t: t, createUser: func(db.CreateUserParams) (db.User, error) {
			return db.User{}, &pgconn.PgError{Code: "23514"}
		}}
		if r := do(t, Register(m, testConfig()), http.MethodPost, body, nil); r.code != http.StatusBadRequest {
			t.Fatalf("got %d", r.code)
		}
	})

	t.Run("72 multibyte chars exceed bcrypt's 72 bytes: 400 not 500", func(t *testing.T) {
		long := map[string]string{"name": "Ada", "email": "ada@example.com", "password": strings.Repeat("é", 72)}
		r := do(t, Register(&mockRepo{t: t}, testConfig()), http.MethodPost, long, nil)
		if r.code != http.StatusBadRequest || len(r.body.Errors) != 1 || r.body.Errors[0].Field != "password" {
			t.Fatalf("got %d %+v", r.code, r.body)
		}
	})

	t.Run("invalid body is 400 without db calls", func(t *testing.T) {
		r := do(t, Register(&mockRepo{t: t}, testConfig()), http.MethodPost, map[string]string{"email": "nope"}, nil)
		if r.code != http.StatusBadRequest || r.body.Code != constants.ValidationFailed {
			t.Fatalf("got %d %+v", r.code, r.body)
		}
	})
}

func TestLogin(t *testing.T) {
	user := fakeUser(t)
	byEmail := func(e string) (db.User, error) {
		if e == "ada@example.com" {
			return user, nil
		}
		return db.User{}, pgx.ErrNoRows
	}

	t.Run("success sets cookies, email is normalized", func(t *testing.T) {
		m := &mockRepo{t: t, getUserByEmail: byEmail, createSession: okSession}
		r := do(t, Login(m, testConfig()), http.MethodPost, map[string]string{"email": "ADA@example.com", "password": testPassword}, nil)
		if r.code != http.StatusOK || !r.sessionSet() {
			t.Fatalf("got %d %+v", r.code, r.body)
		}
	})

	wrong := do(t, Login(&mockRepo{t: t, getUserByEmail: byEmail}, testConfig()), http.MethodPost,
		map[string]string{"email": "ada@example.com", "password": "wrong-password"}, nil)
	unknown := do(t, Login(&mockRepo{t: t, getUserByEmail: byEmail}, testConfig()), http.MethodPost,
		map[string]string{"email": "nobody@example.com", "password": "wrong-password"}, nil)

	t.Run("wrong password and unknown email are indistinguishable", func(t *testing.T) {
		if wrong.code != http.StatusUnauthorized || unknown.code != http.StatusUnauthorized {
			t.Fatalf("codes %d %d", wrong.code, unknown.code)
		}
		if !reflect.DeepEqual(wrong.body, unknown.body) || wrong.body.Code != constants.InvalidCredentials {
			t.Fatalf("bodies differ: %+v vs %+v", wrong.body, unknown.body)
		}
		if len(wrong.cookies) != 0 || len(unknown.cookies) != 0 {
			t.Fatal("failed login must not set cookies")
		}
	})

	t.Run("db error is 500", func(t *testing.T) {
		m := &mockRepo{t: t, getUserByEmail: func(string) (db.User, error) { return db.User{}, errDB }}
		r := do(t, Login(m, testConfig()), http.MethodPost, map[string]string{"email": "ada@example.com", "password": testPassword}, nil)
		if r.code != http.StatusInternalServerError {
			t.Fatalf("got %d", r.code)
		}
	})
}
