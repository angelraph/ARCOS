import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Next.js only auto-loads .env files from its own app directory, not the monorepo root
// where ARCOS's real secrets/addresses live. Load explicitly, server-side only.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../../.env") });
