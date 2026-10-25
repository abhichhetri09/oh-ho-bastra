import { beforeEach, describe, expect, it } from "vitest";
import type { Mailer, Message } from "../src/emails/mailer";
import { makeUser, setupTestApp } from "./helpers";

const sent: Message[] = [];
let failing = false;
const mailer: Mailer = {
  send: async (msg) => {
    if (failing) throw new Error("smtp down");
    sent.push(msg);
  },
};

const { http, db } = setupTestApp({ mailer });
const noMail = setupTestApp();

beforeEach(async () => {
  sent.length = 0;
  failing = false;
  await db.query(
    "INSERT INTO store_settings DEFAULT VALUES ON CONFLICT DO NOTHING",
  );
});

const message = {
  name: " Aino ",
  email: "aino@example.com",
  topic: "order",
  order_number: "OHB-1042",
  message: "Where is my order? It's been a week.",
};

const post = (body: unknown, app = http) =>
  app()
    .post("/api/v1/contact")
    .send(body as object);

describe("POST /contact", () => {
  it("emails the business address, with Reply-To set to the shopper", async () => {
    await db.query(
      "UPDATE store_settings SET business_email = 'hello@shop.test'",
    );
    const res = await post(message);
    expect(res.status).toBe(202);
    expect(res.body).toEqual({
      success: true,
      message: "Thanks, your message is on its way",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: "hello@shop.test",
      replyTo: "aino@example.com",
      subject: "Contact: An order (OHB-1042), from Aino",
    });
    expect(sent[0]!.text).toContain("Where is my order?");
    expect(sent[0]!.html).toContain("Where is my order?");
  });

  it("escapes the message in the HTML email", async () => {
    await db.query(
      "UPDATE store_settings SET business_email = 'hello@shop.test'",
    );
    await post({ ...message, message: "<script>alert(1)</script> hello" });
    expect(sent[0]!.html).not.toContain("<script>");
    expect(sent[0]!.html).toContain("&lt;script&gt;");
  });

  it("falls back to every admin without a business email", async () => {
    const a = await makeUser(db, { role: "admin" });
    const b = await makeUser(db, { role: "admin" });
    await makeUser(db);
    const res = await post(message);
    expect(res.status).toBe(202);
    expect(sent.map((m) => m.to).sort()).toEqual([a.email, b.email].sort());
  });

  it("drops a message with the honeypot filled, but looks sent", async () => {
    await db.query(
      "UPDATE store_settings SET business_email = 'hello@shop.test'",
    );
    const res = await post({ ...message, website: "http://spam.example" });
    expect(res.status).toBe(202);
    expect(sent).toHaveLength(0);
  });

  it("validates the fields", async () => {
    const res = await post({ ...message, email: "nope", message: "short" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    const fields = res.body.errors.map((e: { field: string }) => e.field);
    expect(fields).toEqual(expect.arrayContaining(["email", "message"]));
  });

  it("is a 503 when the send fails or mail is off", async () => {
    await db.query(
      "UPDATE store_settings SET business_email = 'hello@shop.test'",
    );
    failing = true;
    expect((await post(message)).status).toBe(503);
    const off = await post(message, noMail.http);
    expect(off.status).toBe(503);
    expect(off.body.code).toBe("MAIL_UNAVAILABLE");
  });
});
