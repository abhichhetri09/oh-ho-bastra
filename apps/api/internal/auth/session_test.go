package auth

import (
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
)

func TestDecide(t *testing.T) {
	now := time.Now()
	window := 30 * time.Second
	sess := func(rotatedAgo time.Duration) db.Session {
		return db.Session{
			CurrentTokenHash:  "current",
			PreviousTokenHash: pgtype.Text{String: "previous", Valid: true},
			PreviousRotatedAt: pgtype.Timestamptz{Time: now.Add(-rotatedAgo), Valid: true},
		}
	}

	tests := []struct {
		name      string
		sess      db.Session
		presented string
		want      RefreshDecision
	}{
		{"current token rotates", sess(time.Second), "current", Rotate},
		{"previous token inside window is grace", sess(5 * time.Second), "previous", Grace},
		{"previous token at window edge is reuse", sess(window), "previous", Reuse},
		{"previous token after window is reuse", sess(time.Minute), "previous", Reuse},
		{"unknown token is reuse", sess(time.Second), "something-else", Reuse},
		{"never rotated, unknown token is reuse", db.Session{CurrentTokenHash: "current"}, "previous", Reuse},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Decide(tt.sess, tt.presented, now, window); got != tt.want {
				t.Fatalf("Decide = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestNextExpiry(t *testing.T) {
	ttl, maxAge := 30*24*time.Hour, 90*24*time.Hour
	created := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

	tests := []struct {
		name string
		now  time.Time
		want time.Time
	}{
		{"fresh session slides by ttl", created, created.Add(ttl)},
		{"mid-life slides by ttl", created.Add(30 * 24 * time.Hour), created.Add(60 * 24 * time.Hour)},
		{"near the cap is clamped", created.Add(80 * 24 * time.Hour), created.Add(maxAge)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := NextExpiry(created, tt.now, ttl, maxAge); !got.Equal(tt.want) {
				t.Fatalf("NextExpiry = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestNormalizeEmail(t *testing.T) {
	if got := NormalizeEmail("  Ada.Lovelace@Example.COM "); got != "ada.lovelace@example.com" {
		t.Fatalf("got %q", got)
	}
}

func TestTruncate(t *testing.T) {
	if got := truncate("short", 10); got != "short" {
		t.Fatalf("got %q", got)
	}
	// "é" is 2 bytes; cutting at 2 would split it, so it backs off to 1 byte
	if got := truncate("aé", 2); got != "a" {
		t.Fatalf("got %q", got)
	}
	if got := truncate("abcdef", 3); got != "abc" {
		t.Fatalf("got %q", got)
	}
}
