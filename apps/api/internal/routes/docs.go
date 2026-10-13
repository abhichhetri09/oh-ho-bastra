package routes

import (
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/routes/config"
)

// setupDocsRoutes serves openapi.json and the Scalar UI under /api/v1,
// keeping /docs as a shortcut.
func setupDocsRoutes(r *gin.Engine, router *gin.RouterGroup, cfg config.Config) {
	docsPath := router.BasePath() + "/docs/"

	router.GET("/openapi.json", func(c *gin.Context) {
		data, err := os.ReadFile(cfg.Config.OpenAPIPath)
		if err != nil {
			// the spec is committed (apps/api/openapi.json), so this is a
			// deployment problem such as a wrong OPENAPI_PATH
			httpx.Internal(c, "failed to read openapi spec", err, "path", cfg.Config.OpenAPIPath)
			return
		}
		c.Data(http.StatusOK, "application/json", data)
	})

	html := strings.Replace(scalarHTML, `data-url="/openapi.json"`, `data-url="`+router.BasePath()+`/openapi.json"`, 1)
	router.GET("/docs/", func(c *gin.Context) {
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.String(http.StatusOK, html)
	})

	redirect := func(c *gin.Context) { c.Redirect(http.StatusMovedPermanently, docsPath) }
	router.GET("/docs", redirect)
	r.GET("/docs", redirect)
}

// scalarHTML is the Scalar API docs page that loads /openapi.json. The
// script is pinned to an exact version with Subresource Integrity, so a
// compromised or changed CDN file is refused by the browser.
const scalarHTML = `<!DOCTYPE html>
<html>
<head>
  <title>Oh Ho Bastra API Docs</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" href="data:," />
</head>
<body>
  <script id="api-reference" data-url="/openapi.json"></script>
  <script
    src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.69.2/dist/browser/standalone.js"
    integrity="sha384-WIChsUVC1uJ+G1lFA6lPYzOUgXAe8dVxUFIZ7lcENNtV34Esuo81NIxsj8EAQeHB"
    crossorigin="anonymous"></script>
</body>
</html>
`
