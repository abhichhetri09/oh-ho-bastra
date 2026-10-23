import dotenv from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: resolve(root, ".env") });
dotenv.config({ path: resolve(root, ".env.local") });
