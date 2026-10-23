-- name: CreateVariantOptionValue :exec
INSERT INTO variant_option_values (variant_id, option_value_id)
VALUES ($1, $2);

-- name: GetOptionValuesByVariant :many
SELECT
    po.name AS option_name,
    pov.value AS option_value,
    pov.id AS option_value_id
FROM variant_option_values vov
JOIN product_option_values pov ON pov.id = vov.option_value_id
JOIN product_options po ON po.id = pov.option_id
WHERE vov.variant_id = $1;

-- name: GetVariantsByOptionValue :many
-- used for filtering: give me all variants that have color = "Red"
SELECT pv.* FROM product_variants pv
JOIN variant_option_values vov ON vov.variant_id = pv.id
WHERE vov.option_value_id = $1
AND pv.is_active = TRUE;

-- name: DeleteVariantOptionValues :exec
DELETE FROM variant_option_values
WHERE variant_id = $1;

 