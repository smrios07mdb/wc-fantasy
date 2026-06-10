/**
 * @app/notify — Web Push transport + delivery policy (DECISIONS.md → Notifications; ARCHITECTURE.md
 * §1/§4). Notifications are server→device Web Push over the PWA; there is NO new vendor and NO
 * Realtime/publication involvement (push sidesteps the RLS-publication path entirely).
 *
 * The pure pieces — the payload builders, the preference validator, the delivery policy
 * (`dispatchToManager`), the store PORT, and the in-memory double — carry NO database/network
 * dependency and live here (proven by `purity.test.ts`). The IO surfaces are separate subpaths:
 *   `@app/notify/send`   → `sendPush` (the web-push/VAPID wrapper);
 *   `@app/notify/prisma` → `createPrismaNotifyStore` (the Prisma+web-push adapter).
 *
 * `dispatchToManager` is built + unit-tested here but invoked by NOTHING yet — Prompt 41b wires the
 * three triggers (draft-turn / player-not-starting / match-starting).
 */
export * from "./types";
export * from "./preferences";
export * from "./payload";
export * from "./dispatch";
export * from "./store";
export { MemoryNotifyStore } from "./memoryStore";
export type { RecordedSend } from "./memoryStore";
