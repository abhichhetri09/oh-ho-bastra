import { schemas } from "../schemas.ts";
import { operation } from "./shared.ts";

export function registerHealthPaths() {
  operation({
    method: "get",
    path: "/api/v1/health",
    operationId: "getHealth",
    tag: "Health",
    summary: "Health check",
    success: {
      status: 200,
      description: "Server is up and running",
      schema: schemas.MessageResponseSchema,
    },
  });
}
