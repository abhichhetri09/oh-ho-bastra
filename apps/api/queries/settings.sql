-- name: GetStoreSettings :one
SELECT theme, heading_font, corners, announcements, announcements_enabled,
       business_name, business_id, business_address, business_email, business_phone,
       shipping_flat, free_shipping_from, free_shipping_items, logo_url,
       referrals_enabled, referral_friend_kind, referral_friend_value, referral_friend_min,
       referral_reward, referral_pay_after_days, referral_custom_prints, referral_monthly_cap,
       credit_max_percent, credit_expiry_months, updated_at
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
          shipping_flat, free_shipping_from, free_shipping_items, logo_url,
          referrals_enabled, referral_friend_kind, referral_friend_value, referral_friend_min,
          referral_reward, referral_pay_after_days, referral_custom_prints, referral_monthly_cap,
          credit_max_percent, credit_expiry_months, updated_at;

-- name: UpdateAnnouncements :one
UPDATE store_settings
SET announcements = sqlc.arg(announcements)::TEXT[],
    announcements_enabled = sqlc.arg(announcements_enabled),
    updated_at = now()
WHERE id
RETURNING theme, heading_font, corners, announcements, announcements_enabled,
          business_name, business_id, business_address, business_email, business_phone,
          shipping_flat, free_shipping_from, free_shipping_items, logo_url,
          referrals_enabled, referral_friend_kind, referral_friend_value, referral_friend_min,
          referral_reward, referral_pay_after_days, referral_custom_prints, referral_monthly_cap,
          credit_max_percent, credit_expiry_months, updated_at;

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
          shipping_flat, free_shipping_from, free_shipping_items, logo_url,
          referrals_enabled, referral_friend_kind, referral_friend_value, referral_friend_min,
          referral_reward, referral_pay_after_days, referral_custom_prints, referral_monthly_cap,
          credit_max_percent, credit_expiry_months, updated_at;

-- name: UpdateShippingRule :one
UPDATE store_settings
SET shipping_flat = sqlc.arg(shipping_flat),
    free_shipping_from = sqlc.narg(free_shipping_from),
    free_shipping_items = sqlc.narg(free_shipping_items),
    updated_at = now()
WHERE id
RETURNING theme, heading_font, corners, announcements, announcements_enabled,
          business_name, business_id, business_address, business_email, business_phone,
          shipping_flat, free_shipping_from, free_shipping_items, logo_url,
          referrals_enabled, referral_friend_kind, referral_friend_value, referral_friend_min,
          referral_reward, referral_pay_after_days, referral_custom_prints, referral_monthly_cap,
          credit_max_percent, credit_expiry_months, updated_at;

-- name: UpdateStoreLogo :one
UPDATE store_settings
SET logo_url = sqlc.narg(logo_url),
    updated_at = now()
WHERE id
RETURNING theme, heading_font, corners, announcements, announcements_enabled,
          business_name, business_id, business_address, business_email, business_phone,
          shipping_flat, free_shipping_from, free_shipping_items, logo_url,
          referrals_enabled, referral_friend_kind, referral_friend_value, referral_friend_min,
          referral_reward, referral_pay_after_days, referral_custom_prints, referral_monthly_cap,
          credit_max_percent, credit_expiry_months, updated_at;

-- name: UpdateReferralRule :one
UPDATE store_settings
SET referrals_enabled = sqlc.arg(referrals_enabled),
    referral_friend_kind = sqlc.arg(referral_friend_kind),
    referral_friend_value = sqlc.arg(referral_friend_value),
    referral_friend_min = sqlc.narg(referral_friend_min),
    referral_reward = sqlc.arg(referral_reward),
    referral_pay_after_days = sqlc.arg(referral_pay_after_days),
    referral_custom_prints = sqlc.arg(referral_custom_prints),
    referral_monthly_cap = sqlc.narg(referral_monthly_cap),
    credit_max_percent = sqlc.arg(credit_max_percent),
    credit_expiry_months = sqlc.narg(credit_expiry_months),
    updated_at = now()
WHERE id
RETURNING theme, heading_font, corners, announcements, announcements_enabled,
          business_name, business_id, business_address, business_email, business_phone,
          shipping_flat, free_shipping_from, free_shipping_items, logo_url,
          referrals_enabled, referral_friend_kind, referral_friend_value, referral_friend_min,
          referral_reward, referral_pay_after_days, referral_custom_prints, referral_monthly_cap,
          credit_max_percent, credit_expiry_months, updated_at;

-- name: GetShippingRule :one
-- What delivery costs now, for the cart and checkout.
SELECT shipping_flat, free_shipping_from, free_shipping_items FROM store_settings WHERE id;

-- name: GetReferralRule :one
-- The referral programme as it is now, for the referrals it will price.
SELECT referrals_enabled, referral_friend_kind, referral_friend_value, referral_friend_min,
       referral_reward, referral_pay_after_days, referral_custom_prints, referral_monthly_cap,
       credit_max_percent, credit_expiry_months
FROM store_settings WHERE id;
