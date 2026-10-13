import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateOpenAPIDocument } from "./schema.ts";

const outPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../apps/api/openapi.json",
);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  `${JSON.stringify(generateOpenAPIDocument(), null, 2)}\n`,
);

console.log("Generated", outPath);
