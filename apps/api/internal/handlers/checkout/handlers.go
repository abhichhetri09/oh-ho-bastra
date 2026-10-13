// Package checkout serves checkout, the Stripe webhook, orders and the
// address book. The rules live in internal/checkout.
package checkout

import (
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/suprimkhatri77/cartspace/backend/internal/checkout"
	"github.com/suprimkhatri77/cartspace/backend/internal/constants"
	db "github.com/suprimkhatri77/cartspace/backend/internal/database/generated"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/httpx"
	"github.com/suprimkhatri77/cartspace/backend/internal/pkg/payments"
	"github.com/suprimkhatri77/cartspace/backend/internal/types"
	"github.com/suprimkhatri77/cartspace/backend/internal/utils"
	"github.com/suprimkhatri77/cartspace/backend/internal/validator"
)

const (
	// ordersPageSize is the order history page (an infinite list in the web).
	ordersPageSize int64 = 10
	// maxWebhookBody bounds what the webhook reads; Stripe events are small.
	maxWebhookBody = 1 << 16
)

func unavailable(c *gin.Context) {
	httpx.Fail(c, http.StatusServiceUnavailable, constants.PaymentsUnavailable,
		"Payments are not set up on this server")
}

// failRefusal sends a checkout refusal, or a 500 for anything else.
func failRefusal(c *gin.Context, msg string, err error) {
	var refusal *checkout.Refusal
	if errors.As(err, &refusal) {
		httpx.Fail(c, refusal.Status, refusal.Code, refusal.Message)
		return
	}
	httpx.Internal(c, msg, err)
}

// StartCheckout reserves the cart and returns the Stripe Checkout URL.
func StartCheckout(svc *checkout.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !svc.Enabled() {
			unavailable(c)
			return
		}
		userID, ok := httpx.UserID(c)
		if !ok {
			return
		}
		req, ok := validator.BindJSON[types.CheckoutRequest](c)
		if !ok {
			return
		}
		if (req.AddressID == "") == (req.Address == nil) {
			httpx.Fail(c, http.StatusBadRequest, constants.ValidationFailed,
				"Give either address_id or address")
			return
		}

		res, err := svc.Start(c.Request.Context(), userID, *req)
		if err != nil {
			failRefusal(c, "failed to start checkout", err)
			return
		}
		c.JSON(http.StatusCreated, types.APIResponse{
			Success: true,
			Message: "Checkout started",
			Data:    res,
		})
	}
}

// StripeWebhook applies verified Stripe events. A 5xx makes Stripe retry.
func StripeWebhook(svc *checkout.Service, provider payments.Provider) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !svc.Enabled() {
			unavailable(c)
			return
		}
		payload, err := io.ReadAll(io.LimitReader(c.Request.Body, maxWebhookBody))
		if err != nil {
			httpx.Fail(c, http.StatusBadRequest, constants.InvalidWebhookSignature, "Unreadable webhook body")
			return
		}
		event, err := provider.ParseEvent(payload, c.GetHeader("Stripe-Signature"))
		if errors.Is(err, payments.ErrInvalidSignature) {
			httpx.Fail(c, http.StatusBadRequest, constants.InvalidWebhookSignature, "Invalid webhook signature")
			return
		}
		if err != nil {
			httpx.Internal(c, "failed to read webhook event", err)
			return
		}
		if err := svc.HandleEvent(c.Request.Context(), event); err != nil {
			httpx.Internal(c, "failed to apply webhook event", err, "event", event.ID, "type", event.Type)
			return
		}
		c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: "Event received"})
	}
}

// SessionOrder is the success page's view of a checkout: the order behind
// a Stripe session. A pending order is first reconciled with Stripe, so
// the page works even before (or without) the webhook.
func SessionOrder(svc *checkout.Service, queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !svc.Enabled() {
			unavailable(c)
			return
		}
		userID, ok := httpx.UserID(c)
		if !ok {
			return
		}
		sessionID := c.Param("sessionID")
		if !strings.HasPrefix(sessionID, "cs_") || len(sessionID) > 255 {
			httpx.Fail(c, http.StatusBadRequest, constants.InvalidSessionID, "Invalid checkout session ID")
			return
		}

		ctx := c.Request.Context()
		params := db.GetOrderBySessionParams{
			StripeSessionID: pgtype.Text{String: sessionID, Valid: true},
			UserID:          userID,
		}
		order, err := queries.GetOrderBySession(ctx, params)
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(c, http.StatusNotFound, constants.OrderNotFound, "Order not found")
			return
		}
		if err != nil {
			httpx.Internal(c, "failed to get order", err)
			return
		}
		if order.Status == "pending" {
			if err := svc.Reconcile(ctx, sessionID); err != nil {
				// The webhook may still settle it; answer with what we know.
				slog.Warn("checkout: reconcile", "order", order.Number, "err", err)
			} else if order, err = queries.GetOrderBySession(ctx, params); err != nil {
				httpx.Internal(c, "failed to get order", err)
				return
			}
		}
		respondOrder(c, queries, order)
	}
}

// ListOrders is the user's order history, newest first (placed orders
// only, not abandoned checkouts).
func ListOrders(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := httpx.UserID(c)
		if !ok {
			return
		}
		page, ok := httpx.ParsePage(c)
		if !ok {
			return
		}
		ctx := c.Request.Context()
		total, err := queries.CountOrders(ctx, userID)
		if err != nil {
			httpx.Internal(c, "failed to count orders", err)
			return
		}
		if !httpx.CheckPageInRange(c, page, total, ordersPageSize) {
			return
		}
		orders := []db.ListOrdersRow{}
		if total > 0 {
			orders, err = queries.ListOrders(ctx, db.ListOrdersParams{
				UserID: userID,
				Limit:  int32(ordersPageSize),
				Offset: httpx.Offset(page, ordersPageSize),
			})
			if err != nil {
				httpx.Internal(c, "failed to list orders", err)
				return
			}
		}
		c.JSON(http.StatusOK, types.APIResponse{
			Success: true,
			Message: "Orders fetched",
			Data:    orders,
			Meta:    types.NewPaginationMeta(total, page, ordersPageSize),
		})
	}
}

// GetOrder is one of the user's orders by its number.
func GetOrder(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := httpx.UserID(c)
		if !ok {
			return
		}
		number, err := strconv.ParseInt(c.Param("number"), 10, 64)
		if err != nil || number < 1 {
			httpx.Fail(c, http.StatusBadRequest, constants.InvalidOrderNumber, "Invalid order number")
			return
		}
		order, err := queries.GetOrderByNumber(c.Request.Context(), db.GetOrderByNumberParams{Number: number, UserID: userID})
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(c, http.StatusNotFound, constants.OrderNotFound, "Order not found")
			return
		}
		if err != nil {
			httpx.Internal(c, "failed to get order", err)
			return
		}
		respondOrder(c, queries, order)
	}
}

func respondOrder(c *gin.Context, queries *db.Queries, order db.Order) {
	ctx := c.Request.Context()
	items, err := queries.GetOrderItems(ctx, order.ID)
	if err != nil {
		httpx.Internal(c, "failed to get order items", err)
		return
	}
	reviewed, err := queries.ListReviewedProductIDs(ctx, db.ListReviewedProductIDsParams{OrderID: order.ID, UserID: order.UserID})
	if err != nil {
		httpx.Internal(c, "failed to get the order's reviews", err)
		return
	}
	if reviewed == nil {
		reviewed = []pgtype.UUID{}
	}
	c.JSON(http.StatusOK, types.APIResponse{
		Success: true,
		Message: "Order fetched",
		Data:    types.OrderDetail{Order: order, Items: items, ReviewedProductIDs: reviewed},
	})
}

// ListAddresses is the user's address book, the default first, then the
// newest (at most 10).
func ListAddresses(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := httpx.UserID(c)
		if !ok {
			return
		}
		addresses, err := queries.ListAddresses(c.Request.Context(), userID)
		if err != nil {
			httpx.Internal(c, "failed to list addresses", err)
			return
		}
		c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: "Addresses fetched", Data: addresses})
	}
}

// DeleteAddress removes an address from the book. Orders keep their copy.
func DeleteAddress(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := httpx.UserID(c)
		if !ok {
			return
		}
		id, ok := httpx.PathUUID(c, "addressID", constants.InvalidAddressID, "address ID")
		if !ok {
			return
		}
		n, err := queries.DeleteAddress(c.Request.Context(), db.DeleteAddressParams{ID: id, UserID: userID})
		if err != nil {
			httpx.Internal(c, "failed to delete address", err, "address_id", utils.UUIDToString(id))
			return
		}
		if n == 0 {
			httpx.Fail(c, http.StatusNotFound, constants.AddressNotFound, "Address not found")
			return
		}
		c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: "Address deleted"})
	}
}

// SetDefaultAddress makes one address the default (checkout picks it first)
// and unmarks the old one. Setting the current default again is a no-op.
func SetDefaultAddress(pool *pgxpool.Pool, queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := httpx.UserID(c)
		if !ok {
			return
		}
		id, ok := httpx.PathUUID(c, "addressID", constants.InvalidAddressID, "address ID")
		if !ok {
			return
		}
		ctx := c.Request.Context()
		tx, err := pool.Begin(ctx)
		if err != nil {
			httpx.Internal(c, "set default address: begin", err)
			return
		}
		defer func() { _ = tx.Rollback(ctx) }()
		qtx := queries.WithTx(tx)

		// Locked so two of these at once can't both leave a default.
		if err := qtx.LockAddresses(ctx, userID); err != nil {
			httpx.Internal(c, "set default address: lock", err)
			return
		}
		if err := qtx.ClearDefaultAddress(ctx, userID); err != nil {
			httpx.Internal(c, "set default address: clear", err)
			return
		}
		address, err := qtx.SetDefaultAddress(ctx, db.SetDefaultAddressParams{ID: id, UserID: userID})
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(c, http.StatusNotFound, constants.AddressNotFound, "Address not found")
			return
		}
		if err != nil {
			httpx.Internal(c, "set default address", err, "address_id", utils.UUIDToString(id))
			return
		}
		if err := tx.Commit(ctx); err != nil {
			httpx.Internal(c, "set default address: commit", err)
			return
		}
		c.JSON(http.StatusOK, types.APIResponse{Success: true, Message: "Default address updated", Data: address})
	}
}
