import { expect, mock, test } from "bun:test";
import type { PublicUser } from "@repo/types";

// The real POST /auth/guest is never called: each test passes its own.
mock.module("@/lib/api/client", () => ({ startGuestSession: async () => {} }));

const { ensureGuestSession } = await import("@/lib/auth/guest");

const guest: PublicUser = {
  id: "0b7c1e1e-8a52-4a8e-9a43-0d1f5b2f3c4d",
  name: "Guest",
  email: null,
  role: "guest",
  image_url: null,
};

test("concurrent calls share one guest session", async () => {
  let calls = 0;
  let resolve!: (user: PublicUser) => void;
  const start = () => {
    calls++;
    return new Promise<PublicUser>((r) => (resolve = r));
  };
  const first = ensureGuestSession(start);
  const second = ensureGuestSession(start);
  resolve(guest);
  expect(await first).toBe(guest);
  expect(await second).toBe(guest);
  expect(calls).toBe(1);
});

test("a later call starts again, also after a failure", async () => {
  let calls = 0;
  const failing = () => {
    calls++;
    return Promise.reject(new Error("offline"));
  };
  await expect(ensureGuestSession(failing)).rejects.toThrow("offline");
  expect(await ensureGuestSession(async () => guest)).toBe(guest);
  expect(calls).toBe(1);
});
