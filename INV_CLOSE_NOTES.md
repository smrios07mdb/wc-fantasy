# INV-CLOSE docs note (staged, un-applied)

Sergio reports PUSH-KEYS and AUTOFIRE_CUTS_ENABLED both DONE as of 2026-07-05, but the
SEQUENCE operator row and the DECISIONS gate checklist still list them as pending.
Strike them at the next docs (`/braindocs`) pass.

INV-11 (league singleton) and INV-4a (pgbouncer / connection_limit) remain OPEN pending
a run of `apps/web/scripts/verify-launch-env.mjs` against prod — see that script's
header for the invocation. Close both once Sergio reports the output back.
