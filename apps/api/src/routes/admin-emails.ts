import {
  adminEmailCounts,
  adminGetEmail,
  adminListEmails,
  adminRequeueEmail,
  type AdminListEmailsRow,
} from "../db/gen";
import type { Deps } from "../deps";
import { requireAuth, requireRole } from "../http/middleware";
import {
  checkPageInRange,
  offset,
  parsePage,
  pathUuid,
  query,
} from "../http/params";
import { fail, ok, paginationMeta } from "../http/response";
import type { Group } from "../http/router";

const EMAILS_PAGE_SIZE = 25;

const EMAIL_STATUSES = ["pending", "sent", "failed"];

export function adminEmailRoutes(api: Group, deps: Deps) {
  const { db, cfg } = deps;
  const admin = api.group("/admin", requireAuth(cfg), requireRole("admin"));

  /** The email outbox, newest first, by status, with the count of each status. */
  admin.get("/emails", async (req, res) => {
    const page = parsePage(req, res);
    if (page === null) return;
    const status = query(req, "status") || null;
    if (status !== null && !EMAIL_STATUSES.includes(status)) {
      fail(
        res,
        400,
        "INVALID_QUERY_PARAMETER",
        "status must be pending, sent or failed",
      );
      return;
    }

    const counts: Record<string, number> = Object.fromEntries(
      EMAIL_STATUSES.map((s) => [s, 0]),
    );
    let total = 0;
    for (const r of await adminEmailCounts(db)) {
      counts[r.status] = r.count;
      if (status === null || r.status === status) total += r.count;
    }
    if (!checkPageInRange(res, page, total, EMAILS_PAGE_SIZE)) return;
    let rows: AdminListEmailsRow[] = [];
    if (total > 0) {
      rows = await adminListEmails(db, {
        status,
        page_limit: EMAILS_PAGE_SIZE,
        page_offset: offset(page, EMAILS_PAGE_SIZE),
      });
    }
    // Go marshals a map with its keys sorted.
    const sorted = Object.fromEntries(
      Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    ok(
      res,
      200,
      "Emails fetched",
      { rows, counts: sorted },
      paginationMeta(total, page, EMAILS_PAGE_SIZE),
    );
  });

  /**
   * Sends a failed email back to the queue for a fresh set of attempts; the
   * sender picks it up within its next tick.
   */
  admin.post("/emails/:emailID/retry", async (req, res) => {
    const id = pathUuid(req, res, "emailID", "INVALID_EMAIL_ID", "email ID");
    if (!id) return;
    const n = await adminRequeueEmail(db, id);
    const email = await adminGetEmail(db, id);
    if (!email) {
      fail(res, 404, "EMAIL_NOT_FOUND", "Email not found");
      return;
    }
    if (n === 0) {
      fail(
        res,
        409,
        "EMAIL_NOT_FAILED",
        "Only a failed email can be sent again",
      );
      return;
    }
    ok(res, 200, "Email queued again", email);
  });
}
