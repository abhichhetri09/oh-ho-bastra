package user

import (
	"errors"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/repository"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"golang.org/x/sync/errgroup"
)

const (
	// listingPageSize divides evenly into 2, 3 and 4 column grids.
	listingPageSize int64 = 24

	// MaxPriceFilter bounds price_min/price_max (in cents); it matches the
	// largest variant price.
	MaxPriceFilter = 100_000_000

	// MaxOptionFilters bounds the repeated option query parameter.
	MaxOptionFilters = 20
	// maxOptionPart matches the variant property name/value length limits.
	maxOptionPart = 20

	// MaxSearchLength bounds the q query parameter (in characters).
	MaxSearchLength = 100
	// maxSearchTerms caps the words a search matches on; later ones are
	// ignored.
	maxSearchTerms = 8
)

// SortOptions are the accepted values of the sort query parameter. relevance
// only means something with a search; without one it falls back to newest.
var SortOptions = []string{"relevance", "newest", "price_asc", "price_desc"}

// ListProducts lists every visible product (active, with an active default
// variant).
func ListProducts(queries repository.ProductRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		listing(c, queries, pgtype.Text{})
	}
}

// ListProductByCategory lists the visible products of a category and all its
// subcategories.
func ListProductByCategory(queries repository.ProductRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		slug := c.Param("slug")
		if _, err := queries.GetCategoryBySlug(c.Request.Context(), slug); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				httpx.Fail(c, http.StatusNotFound, constants.CategoryNotFound, "Category not found")
				return
			}
			httpx.Internal(c, "failed to fetch category", err, "slug", slug)
			return
		}
		listing(c, queries, pgtype.Text{String: slug, Valid: true})
	}
}

// listingQuery is the parsed query string shared by both listings.
type listingQuery struct {
	page         int
	sort         string
	searchTerms  []string
	featured     bool
	priceMin     int32
	priceMax     int32
	optionNames  []string
	optionValues []string
}

func parseListingQuery(c *gin.Context) (listingQuery, bool) {
	q := listingQuery{}

	page, ok := httpx.ParsePage(c)
	if !ok {
		return q, false
	}
	q.page = page

	search := c.Query("q")
	if utf8.RuneCountInString(search) > MaxSearchLength {
		httpx.Fail(c, http.StatusBadRequest, constants.InvalidQueryParam,
			"q must be at most 100 characters")
		return q, false
	}
	q.searchTerms = searchTerms(search)

	// A search sorts by relevance unless told otherwise.
	defaultSort := "newest"
	if len(q.searchTerms) > 0 {
		defaultSort = "relevance"
	}
	q.sort = c.DefaultQuery("sort", defaultSort)
	if !slices.Contains(SortOptions, q.sort) {
		httpx.Fail(c, http.StatusBadRequest, constants.InvalidQueryParam,
			"sort must be one of: relevance, newest, price_asc, price_desc")
		return q, false
	}
	if q.sort == "relevance" && len(q.searchTerms) == 0 {
		q.sort = "newest"
	}

	switch c.Query("featured") {
	case "", "false":
	case "true":
		q.featured = true
	default:
		httpx.Fail(c, http.StatusBadRequest, constants.InvalidQueryParam, "featured must be true or false")
		return q, false
	}

	priceMin, okMin := parsePrice(c.Query("price_min"))
	priceMax, okMax := parsePrice(c.Query("price_max"))
	if !okMin || !okMax || (priceMin > 0 && priceMax > 0 && priceMin > priceMax) {
		httpx.Fail(c, http.StatusBadRequest, constants.InvalidPriceFilter, "Invalid price filter")
		return q, false
	}
	q.priceMin, q.priceMax = priceMin, priceMax

	names, values, ok := parseOptions(c.QueryArray("option"))
	if !ok {
		httpx.Fail(c, http.StatusBadRequest, constants.InvalidQueryParam,
			"option must be name:value (at most 20)")
		return q, false
	}
	q.optionNames, q.optionValues = names, values

	return q, true
}

func listing(c *gin.Context, queries repository.ProductRepository, slug pgtype.Text) {
	ctx := c.Request.Context()

	q, ok := parseListingQuery(c)
	if !ok {
		return
	}

	total, err := queries.CountStorefrontProducts(ctx, db.CountStorefrontProductsParams{
		CategorySlug: slug,
		FeaturedOnly: q.featured,
		SearchTerms:  q.searchTerms,
		PriceMin:     q.priceMin,
		PriceMax:     q.priceMax,
		OptionNames:  q.optionNames,
		OptionValues: q.optionValues,
	})
	if err != nil {
		httpx.Internal(c, "failed to count products", err, "slug", slug.String)
		return
	}

	if !httpx.CheckPageInRange(c, q.page, total, listingPageSize) {
		return
	}

	g, gctx := errgroup.WithContext(ctx)

	products := []db.StorefrontProduct{}
	var (
		filterOptions []db.GetStorefrontFilterOptionsRow
		priceRange    db.GetStorefrontPriceRangeRow
	)

	// each goroutine owns its err; errgroup returns the first failure
	if total > 0 {
		g.Go(func() error {
			var err error
			products, err = queries.ListStorefrontProducts(gctx, db.ListStorefrontProductsParams{
				CategorySlug: slug,
				FeaturedOnly: q.featured,
				SearchTerms:  q.searchTerms,
				PriceMin:     q.priceMin,
				PriceMax:     q.priceMax,
				OptionNames:  q.optionNames,
				OptionValues: q.optionValues,
				Sort:         q.sort,
				PageLimit:    int32(listingPageSize),
				PageOffset:   httpx.Offset(q.page, listingPageSize),
			})
			return err
		})
	}

	g.Go(func() error {
		var err error
		filterOptions, err = queries.GetStorefrontFilterOptions(gctx, db.GetStorefrontFilterOptionsParams{
			CategorySlug: slug,
			FeaturedOnly: q.featured,
			SearchTerms:  q.searchTerms,
		})
		return err
	})

	g.Go(func() error {
		var err error
		priceRange, err = queries.GetStorefrontPriceRange(gctx, db.GetStorefrontPriceRangeParams{
			CategorySlug: slug,
			FeaturedOnly: q.featured,
			SearchTerms:  q.searchTerms,
		})
		return err
	})

	if err := g.Wait(); err != nil {
		httpx.Internal(c, "failed to list products", err, "slug", slug.String)
		return
	}

	c.JSON(http.StatusOK, types.APIResponse{
		Success: true,
		Message: "Products fetched",
		Data: types.ProductListing{
			Products:      products,
			FilterOptions: filterOptions,
			PriceRange:    priceRange,
		},
		Meta: types.NewPaginationMeta(total, q.page, listingPageSize),
	})
}

// searchTerms splits a search into lowercase words of letters (with their
// combining marks) and digits, deduplicated and capped at maxSearchTerms.
// Everything else separates words, so "t-shirt" searches for "t" and "shirt", and no term can carry
// tsquery syntax. A search without letters or digits has no terms.
func searchTerms(raw string) []string {
	terms := []string{}
	words := strings.FieldsFunc(strings.ToLower(raw), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsMark(r) && !unicode.IsDigit(r)
	})
	for _, word := range words {
		if len(terms) == maxSearchTerms {
			break
		}
		if !slices.Contains(terms, word) {
			terms = append(terms, word)
		}
	}
	return terms
}

// parsePrice reads an optional price filter in cents; "" means no bound (0).
func parsePrice(raw string) (int32, bool) {
	if raw == "" {
		return 0, true
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 0 || n > MaxPriceFilter {
		return 0, false
	}
	return int32(n), true
}

// parseOptions splits repeated name:value filters into parallel arrays
// (variant_matches_options pairs them by index). Duplicates are dropped.
func parseOptions(raw []string) (names, values []string, ok bool) {
	names, values = []string{}, []string{}
	if len(raw) > MaxOptionFilters {
		return nil, nil, false
	}
	seen := map[string]bool{}
	for _, r := range raw {
		name, value, found := strings.Cut(r, ":")
		name, value = strings.TrimSpace(name), strings.TrimSpace(value)
		if !found || name == "" || value == "" || utf8.RuneCountInString(name) > maxOptionPart || utf8.RuneCountInString(value) > maxOptionPart {
			return nil, nil, false
		}
		if seen[name+":"+value] {
			continue
		}
		seen[name+":"+value] = true
		names = append(names, name)
		values = append(values, value)
	}
	return names, values, true
}
