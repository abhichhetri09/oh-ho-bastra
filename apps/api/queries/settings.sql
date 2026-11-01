-- name: GetStoreSettings :one
SELECT theme, heading_font, corners, announcements, announcements_enabled,
       business_name, business_id, business_address, business_email, business_phone,
       shipping_flat, free_shipping_from, free_shipping_items, logo_url, updated_at
FROM store_settings WHERE id;

-- name: UpdateStoreAppearance :one
UPDATE store_settings
SET theme = sqlc.arg(theme),
    heading_font = sqlc.narg(heading_font),
    corners = sqlc.narg(corners),
    updated_at = now()
WHERE id
RETURNING theme, heading_font, corners, announcements, announcements_enabled,
          business_name, business_id, business_address, business_email, business_phone,
          shipping_flat, free_shipping_from, free_shipping_items, logo_url, updated_at;

-- name: UpdateAnnouncements :one
UPDATE store_settings
SET announcements = sqlc.arg(announcements)::TEXT[],
    announcements_enabled = sqlc.arg(announcements_enabled),
    updated_at = now()
WHERE id
RETURNING theme, heading_font, corners, announcements, announcements_enabled,
          business_name, business_id, business_address, business_email, business_phone,
          shipping_flat, free_shipping_from, free_shipping_items, logo_url, updated_at;

-- name: UpdateBusinessDetails :one
UPDATE store_settings
SET business_name = sqlc.arg(business_name),
    business_id = sqlc.arg(business_id),
    business_address = sqlc.arg(business_address),
    business_email = sqlc.arg(business_email),
    business_phone = sqlc.arg(business_phone),
    updated_at = now()
WHERE id
RETURNING theme, heading_font, corners, announcements, announcements_enabled,
          business_name, business_id, business_address, business_email, business_phone,
          shipping_flat, free_shipping_from, free_shipping_items, logo_url, updated_at;

-- name: UpdateShippingRule :one
UPDATE store_settings
SET shipping_flat = sqlc.arg(shipping_flat),
    free_shipping_from = sqlc.narg(free_shipping_from),
    free_shipping_items = sqlc.narg(free_shipping_items),
    updated_at = now()
WHERE id
RETURNING theme, heading_font, corners, announcements, announcements_enabled,
          business_name, business_id, business_address, business_email, business_phone,
          shipping_flat, free_shipping_from, free_shipping_items, logo_url, updated_at;

-- name: UpdateStoreLogo :one
UPDATE store_settings
SET logo_url = sqlc.narg(logo_url),
    updated_at = now()
WHERE id
RETURNING theme, heading_font, corners, announcements, announcements_enabled,
          business_name, business_id, business_address, business_email, business_phone,
          shipping_flat, free_shipping_from, free_shipping_items, logo_url, updated_at;

-- name: GetShippingRule :one
-- What delivery costs now, for the cart and checkout.
SELECT shipping_flat, free_shipping_from, free_shipping_items FROM store_settings WHERE id;
