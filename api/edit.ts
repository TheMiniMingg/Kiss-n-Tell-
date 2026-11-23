import { createHandler } from "./_lib/handler.js";

/** Owner-only backend for the on-site editor. See api/_lib/handler.ts and docs/owner-mode.md. */
const handle = createHandler({ env: process.env });

export default { fetch: handle };
