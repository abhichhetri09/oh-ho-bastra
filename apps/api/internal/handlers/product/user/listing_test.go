package user_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/handlers/product/user"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
)

// listingRepo records the parameters the listing queries receive.
type listingRepo struct {
	repository.ProductRepository
	total       int64
	categoryErr error

	list  *db.ListStorefrontProductsParams
	count *db.CountStorefrontProductsParams
	facet *db.GetStorefrontFilterOptionsParams
	price *db.GetStorefrontPriceRangeParams
}

func (r *listingRepo) GetCategoryBySlug(context.Context, string) (db.Category, error) {
	return db.Category{}, r.categoryErr
}

func (r *listingRepo) CountStorefrontProducts(_ context.Context, arg db.CountStorefrontProductsParams) (int64, error) {
	r.count = &arg
	return r.total, nil
}

func (r *listingRepo) ListStorefrontProducts(_ context.Context, arg db.ListStorefrontProductsParams) ([]db.StorefrontProduct, error) {
	r.list = &arg
	return []db.StorefrontProduct{{Name: "Polo", Slug: "polo", Price: 2900}}, nil
}

func (r *listingRepo) GetStorefrontFilterOptions(_ context.Context, arg db.GetStorefrontFilterOptionsParams) ([]db.GetStorefrontFilterOptionsRow, error) {
	r.facet = &arg
	return []db.GetStorefrontFilterOptionsRow{{OptionName: "color", OptionValue: "Black", OptionType: "color"}}, nil
}

func (r *listingRepo) GetStorefrontPriceRange(_ context.Context, arg db.GetStorefrontPriceRangeParams) (db.GetStorefrontPriceRangeRow, error) {
	r.price = &arg
	return db.GetStorefrontPriceRangeRow{MinPrice: 100, MaxPrice: 900}, nil
}

func serveListing(repo repository.ProductRepository, target string) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/products", user.ListProducts(repo))
	router.GET("/categories/:slug", user.ListProductByCategory(repo))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, target, nil))
	return w
}

func TestListProductsFilters(t *testing.T) {
	repo := &listingRepo{total: 30}
	w := serveListing(repo, "/products?page=2&sort=price_desc&featured=true&price_min=100&price_max=5000"+
		"&option=size:M&option=color:Black&option=size:M&option=size:L")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", w.Code, w.Body.String())
	}

	l := repo.list
	if l == nil {
		t.Fatal("products were not listed")
	}
	if l.CategorySlug.Valid || !l.FeaturedOnly || l.Sort != "price_desc" || l.PriceMin != 100 || l.PriceMax != 5000 {
		t.Errorf("unexpected list params: %+v", *l)
	}
	if l.PageOffset != 24 || l.PageLimit != 24 {
		t.Errorf("offset/limit = %d/%d, want 24/24", l.PageOffset, l.PageLimit)
	}
	// duplicates dropped; names and values stay paired by index
	if !slices.Equal(l.OptionNames, []string{"size", "color", "size"}) ||
		!slices.Equal(l.OptionValues, []string{"M", "Black", "L"}) {
		t.Errorf("options = %v %v", l.OptionNames, l.OptionValues)
	}
	if !slices.Equal(repo.count.OptionNames, l.OptionNames) || repo.count.PriceMax != 5000 {
		t.Errorf("count params differ from list params: %+v", *repo.count)
	}
	if !repo.facet.FeaturedOnly {
		t.Error("facets must share the featured scope")
	}

	var body struct {
		Data struct {
			Products      []map[string]any `json:"products"`
			FilterOptions []map[string]any `json:"filter_options"`
			PriceRange    map[string]int   `json:"price_range"`
		} `json:"data"`
		Meta struct {
			Total      int `json:"total"`
			TotalPages int `json:"total_pages"`
		} `json:"meta"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Data.Products) != 1 || body.Data.Products[0]["offer_price"] != nil ||
		body.Data.FilterOptions[0]["option_type"] != "color" || body.Data.PriceRange["max_price"] != 900 ||
		body.Meta.TotalPages != 2 {
		t.Errorf("unexpected body: %s", w.Body.String())
	}
}

func TestListProductsEmptySkipsList(t *testing.T) {
	repo := &listingRepo{total: 0}
	w := serveListing(repo, "/products")
	if w.Code != http.StatusOK || repo.list != nil {
		t.Fatalf("status = %d, listed = %v", w.Code, repo.list != nil)
	}
	var body struct {
		Data struct {
			Products json.RawMessage `json:"products"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if string(body.Data.Products) != "[]" {
		t.Errorf("products = %s, want []", body.Data.Products)
	}
}

func TestListingBadQuery(t *testing.T) {
	for _, q := range []string{
		"sort=cheapest",
		"featured=yes",
		"price_min=-1",
		"price_min=500&price_max=100",
		"option=size",
		"option=:M",
		"option=size:",
		"option=" + "abcdefghijklmnopqrstu:M", // 21-character name
		"q=" + strings.Repeat("a", 101),
	} {
		repo := &listingRepo{total: 1}
		w := serveListing(repo, "/products?"+q)
		if w.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d, want 400", q, w.Code)
		}
	}
}

func TestListByCategory(t *testing.T) {
	repo := &listingRepo{total: 1}
	w := serveListing(repo, "/categories/shoes?option=size:42")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	if !repo.list.CategorySlug.Valid || repo.list.CategorySlug.String != "shoes" {
		t.Errorf("slug = %+v", repo.list.CategorySlug)
	}
	if repo.facet.CategorySlug.String != "shoes" {
		t.Error("facets must be scoped to the category")
	}
}

func TestListByUnknownCategory(t *testing.T) {
	w := serveListing(&listingRepo{categoryErr: pgx.ErrNoRows}, "/categories/nope")
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", w.Code)
	}
}

func TestListingSearch(t *testing.T) {
	tests := []struct {
		name      string
		query     string
		wantTerms []string
		wantSort  string
	}{
		{"words are lowercased, deduplicated and split on punctuation", "Linen  SHIRT linen t-shirt!!", []string{"linen", "shirt", "t"}, "relevance"},
		{"an explicit sort wins over relevance", "linen&sort=price_asc", []string{"linen"}, "price_asc"},
		{"relevance without a search falls back to newest", "&sort=relevance", []string{}, "newest"},
		{"a search without letters or digits has no terms", "%25%25 --", []string{}, "newest"},
		{"combining marks stay inside a word", url.QueryEscape("नेपाली टोपी"), []string{"नेपाली", "टोपी"}, "relevance"},
		{"at most 8 terms", "a b c d e f g h i j", []string{"a", "b", "c", "d", "e", "f", "g", "h"}, "relevance"},
		{"exactly 100 characters is allowed", strings.Repeat("a", 100), []string{strings.Repeat("a", 100)}, "relevance"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &listingRepo{total: 1}
			target := "/products?q=" + strings.ReplaceAll(tt.query, " ", "+")
			w := serveListing(repo, target)
			if w.Code != http.StatusOK {
				t.Fatalf("status = %d, body %s", w.Code, w.Body.String())
			}
			if !slices.Equal(repo.list.SearchTerms, tt.wantTerms) || repo.list.Sort != tt.wantSort {
				t.Errorf("terms %q sort %q, want %q %q", repo.list.SearchTerms, repo.list.Sort, tt.wantTerms, tt.wantSort)
			}
			// the count, facets and price range follow the search
			if !slices.Equal(repo.count.SearchTerms, tt.wantTerms) ||
				!slices.Equal(repo.facet.SearchTerms, tt.wantTerms) ||
				!slices.Equal(repo.price.SearchTerms, tt.wantTerms) {
				t.Errorf("scope differs: count %q facets %q price %q",
					repo.count.SearchTerms, repo.facet.SearchTerms, repo.price.SearchTerms)
			}
		})
	}
}
