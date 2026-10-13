package admin

import (
	"reflect"
	"testing"

	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/cloudinary"
)

func TestDeletableImages(t *testing.T) {
	cld, err := cloudinary.New("ohhobastra", "k", "s")
	if err != nil {
		t.Fatal(err)
	}
	const base = "https://res.cloudinary.com/ohhobastra/image/upload/v1/ohhobastra/products/"
	images := []db.ListProductImagesRow{
		{Url: base + "a.jpg", PublicID: "ohhobastra/products/a"},
		{Url: base + "b.jpg", PublicID: "ohhobastra/products/b"},
		// a variant reusing the product's photo
		{Url: base + "a.jpg", PublicID: "ohhobastra/products/a"},
		// shown on a past order
		{Url: base + "c.jpg", PublicID: "ohhobastra/products/c"},
		// the demo catalog's, on another cloud
		{Url: "https://res.cloudinary.com/demo/image/upload/samples/d.jpg", PublicID: "samples/d"},
	}
	got := deletableImages(cld, images, []string{base + "c.jpg"})
	want := []string{"ohhobastra/products/a", "ohhobastra/products/b"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("deletableImages = %v, want %v", got, want)
	}
	if ids := deletableImages(nil, images, nil); ids != nil {
		t.Errorf("without Cloudinary: %v, want none", ids)
	}
}
