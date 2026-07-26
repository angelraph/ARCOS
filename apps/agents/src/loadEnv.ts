import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/agents/src -> repo root is three levels up
config({ path: path.resolve(__dirname, "../../../.env") });
