package cloudinary

import (
	"crypto/sha1" //nolint:gosec // Cloudinary's default request signature is SHA-1
	"encoding/hex"
	"testing"
)

func TestSignUpload(t *testing.T) {
	c, err := New("ohhobastra", "key-123", "secret-xyz")
	if err != nil {
		t.Fatal(err)
	}
	got, err := c.SignUpload("ohhobastra/products", 1760000000)
	if err != nil {
		t.Fatal(err)
	}
	// Cloudinary: sha1 of the sorted "key=value&..." params, then the secret.
	sum := sha1.Sum([]byte("allowed_formats=jpg,png,webp,avif&folder=ohhobastra/products&timestamp=1760000000secret-xyz")) //nolint:gosec
	if got.Signature != hex.EncodeToString(sum[:]) {
		t.Errorf("signature = %s, want %s", got.Signature, hex.EncodeToString(sum[:]))
	}
	if got.CloudName != "ohhobastra" || got.APIKey != "key-123" || got.AllowedFormats != "jpg,png,webp,avif" || got.Folder != "ohhobastra/products" || got.Timestamp != 1760000000 {
		t.Errorf("unexpected signature: %+v", got)
	}
}

func TestOwns(t *testing.T) {
	c, _ := New("ohhobastra", "k", "s")
	const own = "https://res.cloudinary.com/ohhobastra/image/upload/v1/ohhobastra/products/a1.jpg"
	for _, tc := range []struct {
		url, publicID string
		want          bool
	}{
		{own, "ohhobastra/products/a1", true},
		// another cloud, even with a public id that exists on ours
		{"https://res.cloudinary.com/demo/image/upload/samples/two-ladies.jpg", "samples/two-ladies", false},
		{"https://res.cloudinary.com/ohhobastra-evil/image/upload/ohhobastra/products/a1.jpg", "ohhobastra/products/a1", false},
		{"https://example.com/res.cloudinary.com/ohhobastra/image/upload/ohhobastra/products/a1.jpg", "ohhobastra/products/a1", false},
		// our URL, but a public id that isn't its own or isn't an upload of ours
		{own, "ohhobastra/products/b2", false},
		{own, "ohhobastra/products/a", false},
		{"https://res.cloudinary.com/ohhobastra/image/upload/v1/brand/logo.png", "brand/logo", false},
		{own, "", false},
	} {
		if got := c.Owns(tc.url, tc.publicID); got != tc.want {
			t.Errorf("Owns(%q, %q) = %v, want %v", tc.url, tc.publicID, got, tc.want)
		}
	}
}
