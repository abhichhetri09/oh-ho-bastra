-- Products a shopper saved for later.
CREATE TABLE wishlist_items (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, product_id)
);

CREATE INDEX wishlist_items_user_idx ON wishlist_items(user_id, created_at DESC);
