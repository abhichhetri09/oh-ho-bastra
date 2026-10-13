import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Must run before any schema is registered (imported first by schema.ts).
extendZodWithOpenApi(z);
