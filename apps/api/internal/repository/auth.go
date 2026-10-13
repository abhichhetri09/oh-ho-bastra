package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
)

// AuthRepository is satisfied by *db.Queries; tests use a mock.
type AuthRepository interface {
	CreateUser(ctx context.Context, params db.CreateUserParams) (db.User, error)
	GetUserByEmail(ctx context.Context, email string) (db.User, error)
	GetUserByID(ctx context.Context, id pgtype.UUID) (db.User, error)

	CreateSession(ctx context.Context, params db.CreateSessionParams) (db.Session, error)
	GetActiveSessionByID(ctx context.Context, id pgtype.UUID) (db.Session, error)
	RotateSessionToken(ctx context.Context, params db.RotateSessionTokenParams) (db.Session, error)
	RevokeSession(ctx context.Context, id pgtype.UUID) error
	RevokeAllUserSessions(ctx context.Context, userID pgtype.UUID) error
}
