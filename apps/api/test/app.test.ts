import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  errorHandler,
  requestId,
  validRequestId,
} from "../src/http/middleware";
import { setupTestApp } from "./helpers";

const { http } = setupTestApp();

describe("system routes", () => {
  it("answers health and the welcome route", async () => {
    expect((await http().get("/api/v1/health")).body).toEqual({
      success: true,
      message: "Server is up and running",
    });
    expect((await http().get("/")).body).toEqual({
      success: true,
      message: "Welcome to the Oh Ho Bastra API",
    });
  });

  it("serves the spec and redirects /docs", async () => {
    const spec = await http().get("/api/v1/openapi.json");
    expect(spec.status).toBe(200);
    expect(spec.body.info.title).toBe("Oh Ho Bastra API");
    const docs = await http().get("/docs");
    expect(docs.status).toBe(301);
    expect(docs.headers.location).toBe("/api/v1/docs/");
  });
});

describe("fallbacks", () => {
  it("404s unknown paths as JSON", async () => {
    const res = await http().get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      message: "Route not found",
      code: "ROUTE_NOT_FOUND",
    });
  });

  it("405s a known path with the wrong method", async () => {
    const res = await http().delete("/api/v1/health");
    expect(res.status).toBe(405);
    expect(res.body.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("never runs a group's auth for paths that don't exist", async () => {
    const res = await http().get("/api/v1/admin/categories/x/y");
    expect(res.status).toBe(404);
  });

  it("answers malformed JSON with the validation shape", async () => {
    const res = await http()
      .post("/api/v1/admin/categories")
      .set("Content-Type", "application/json")
      .send('{"name":');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: "Invalid request body",
      code: "VALIDATION_FAILED",
      errors: [{ code: "INVALID_REQUEST", message: "Invalid request body" }],
    });
  });

  it("turns a thrown error into the generic 500", async () => {
    const app = express();
    app.get("/boom", async () => {
      throw new Error("db down");
    });
    app.use(errorHandler);
    const res = await request(app).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      message: "Failed to process request",
      code: "INTERNAL_SERVER_ERROR",
    });
  });
});

describe("request ids", () => {
  it("reuses a sane id and mints one otherwise", async () => {
    const app = express()
      .use(requestId)
      .get("/", (req, res) => {
        res.send(req.requestId);
      });
    const reused = await request(app).get("/").set("X-Request-ID", "abc-123");
    expect(reused.headers["x-request-id"]).toBe("abc-123");
    const minted = await request(app).get("/").set("X-Request-ID", "has space");
    expect(minted.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(validRequestId("x".repeat(129))).toBe(false);
  });
});
