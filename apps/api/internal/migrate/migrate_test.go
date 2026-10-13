package migrate

import (
	"io/fs"
	"regexp"
	"strconv"
	"testing"

	"github.com/golang-migrate/migrate/v4/source/iofs"

	"github.com/suprimkhatri77/cartspace/backend/migrations"
)

var migrationName = regexp.MustCompile(`^(\d+)_\w+\.(up|down)\.sql$`)

// Every embedded migration has an up and a down, and versions run 1..N
// without gaps or repeats.
func TestEmbeddedMigrationsArePairedAndContiguous(t *testing.T) {
	files, err := fs.Glob(migrations.FS, "*.sql")
	if err != nil {
		t.Fatal(err)
	}
	if len(files) == 0 {
		t.Fatal("no migrations embedded")
	}

	directions := map[int]map[string]string{}
	for _, name := range files {
		m := migrationName.FindStringSubmatch(name)
		if m == nil {
			t.Errorf("%s: not a NNNNNN_name.(up|down).sql file", name)
			continue
		}
		version, _ := strconv.Atoi(m[1])
		if directions[version] == nil {
			directions[version] = map[string]string{}
		}
		if other, ok := directions[version][m[2]]; ok {
			t.Errorf("version %d has two %s migrations: %s and %s", version, m[2], other, name)
		}
		directions[version][m[2]] = name
	}

	for version := 1; version <= len(directions); version++ {
		d, ok := directions[version]
		if !ok {
			t.Errorf("version %d is missing (versions must run 1..%d)", version, len(directions))
			continue
		}
		if d["up"] == "" || d["down"] == "" {
			t.Errorf("version %d needs both an up and a down migration, has %v", version, d)
		}
	}
}

// golang-migrate can read the embedded files and finds the same versions.
func TestEmbeddedSourceOpens(t *testing.T) {
	source, err := iofs.New(migrations.FS, ".")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = source.Close() }()

	first, err := source.First()
	if err != nil {
		t.Fatal(err)
	}
	if first != 1 {
		t.Errorf("first version = %d, want 1", first)
	}
}
