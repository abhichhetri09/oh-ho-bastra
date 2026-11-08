-- The store's option lists (migrations/000039_attributes.up.sql).

-- name: ListAttributes :many
-- Every attribute in order, with its values in order.
SELECT
    a.*,
    (
        SELECT COALESCE(
            json_agg(
                jsonb_build_object('id', av.id, 'value', av.value, 'hex', av.hex)
                ORDER BY av.position, av.value
            ),
            '[]'::json
        )
        FROM attribute_values av WHERE av.attribute_id = a.id
    ) AS "values"
FROM attributes a
ORDER BY a.position, lower(a.name);

-- name: CreateAttribute :one
INSERT INTO attributes (name, type, position)
VALUES (@name, @type, (SELECT COALESCE(MAX(position) + 1, 0) FROM attributes))
RETURNING *;

-- name: UpdateAttribute :one
UPDATE attributes SET name = @name, type = @type
WHERE id = @id
RETURNING *;

-- name: DeleteAttribute :execresult
DELETE FROM attributes WHERE id = $1;

-- name: ClearAttributeValues :exec
DELETE FROM attribute_values WHERE attribute_id = $1;

-- name: AddAttributeValue :exec
INSERT INTO attribute_values (attribute_id, value, hex, position)
VALUES (@attribute_id, @value, sqlc.narg(hex), @position);
