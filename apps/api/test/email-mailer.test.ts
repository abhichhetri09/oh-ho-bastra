import { createServer, type AddressInfo, type Server } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Config } from "../src/config";
import { createMailer, PermanentError } from "../src/emails/mailer";
import { testConfig } from "./helpers";

// The SMTP mailer against a tiny SMTP server that answers RCPT TO with
// whatever the test sets.

let rcptReply = "250 OK";
const received: string[] = [];
let server: Server;
let port = 0;

beforeAll(async () => {
  server = createServer((socket) => {
    let buf = "";
    let inData = false;
    const reply = (line: string) => socket.write(line + "\r\n");
    reply("220 test ESMTP");
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      for (;;) {
        if (inData) {
          const end = buf.indexOf("\r\n.\r\n");
          if (end < 0) return;
          received.push(buf.slice(0, end));
          buf = buf.slice(end + 5);
          inData = false;
          reply("250 queued");
          continue;
        }
        const nl = buf.indexOf("\r\n");
        if (nl < 0) return;
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        const cmd = line.toUpperCase();
        if (cmd.startsWith("EHLO"))
          socket.write("250-test\r\n250 8BITMIME\r\n");
        else if (cmd.startsWith("MAIL FROM")) reply("250 OK");
        else if (cmd.startsWith("RCPT TO")) reply(rcptReply);
        else if (cmd === "STARTTLS") reply("502 not implemented");
        else if (cmd === "DATA") {
          inData = true;
          reply("354 go ahead");
        } else if (cmd === "QUIT") {
          reply("221 bye");
          socket.end();
        } else reply("250 OK");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const config = (over: Partial<Config> = {}): Config => ({
  ...testConfig(),
  smtpHost: "127.0.0.1",
  smtpPort: port,
  smtpTls: "none",
  smtpUsername: "",
  smtpPassword: "",
  mailFrom: "Oh Ho Bastra <orders@example.com>",
  ...over,
});

const msg = {
  to: "ada@example.com",
  subject: "Your order OHB-1 is confirmed",
  html: "<p>Hi Ada,</p>",
  text: "Hi Ada,",
};

describe("createMailer", () => {
  it("is off without SMTP_HOST", () => {
    expect(createMailer(config({ smtpHost: "" }))).toBeNull();
  });

  it("sends a text and an HTML part from MAIL_FROM", async () => {
    rcptReply = "250 OK";
    received.length = 0;
    await createMailer(config())!.send(msg);
    expect(received).toHaveLength(1);
    const data = received[0]!;
    expect(data).toMatch(/^From: Oh Ho Bastra <orders@example\.com>$/m);
    expect(data).toMatch(/^To: ada@example\.com$/m);
    expect(data).toMatch(/^Subject: Your order OHB-1 is confirmed$/m);
    expect(data).toMatch(/^Message-ID: </m);
    expect(data).toMatch(/^Date: /m);
    expect(data).toContain("multipart/alternative");
    expect(data.indexOf("text/plain")).toBeLessThan(data.indexOf("text/html"));
  });

  it("makes a 5xx refusal permanent", async () => {
    rcptReply = "550 no such user";
    const err = await createMailer(config())!
      .send(msg)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PermanentError);
    expect((err as Error).message).toContain("550 no such user");
  });

  it("leaves a 4xx refusal to the retries", async () => {
    rcptReply = "451 try again later";
    const err = await createMailer(config())!
      .send(msg)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(PermanentError);
    expect((err as Error).message).toMatch(/^send: .*451 try again later/);
  });

  it("requires the STARTTLS upgrade by default", async () => {
    rcptReply = "250 OK";
    const err = await createMailer(config({ smtpTls: "starttls" }))!
      .send(msg)
      .catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(PermanentError);
    expect((err as Error).message).toMatch(/^dial: /);
  });

  it("retries a server it can't reach", async () => {
    const closed = createServer();
    await new Promise<void>((resolve) =>
      closed.listen(0, "127.0.0.1", resolve),
    );
    const deadPort = (closed.address() as AddressInfo).port;
    await new Promise<void>((resolve) => closed.close(() => resolve()));
    const err = await createMailer(config({ smtpPort: deadPort }))!
      .send(msg)
      .catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(PermanentError);
    expect((err as Error).message).toMatch(/^dial: /);
  });
});
