# Fleet analytics v1

Additive release for Hermy HQ. PostgreSQL schema `hq_analytics_v1` is separate from the legacy command bus. Two outbound publishers have separate instance-scoped roles, enforced by RLS; the web reader is SELECT-only. Publisher credentials are host-side 0600 files. The web reader URL is a server-only sensitive Vercel variable; never NEXT_PUBLIC.

Snapshots are keyed by instance, profile, kind and run, with schema version, snapshot-observation and ingestion timestamps. Trader carries its separate source-observation timestamp; freshness is measured from that source timestamp, never from successful re-publishing. The exporter selects fields explicitly; it does not export private stores, sessions, secrets, raw errors, prompts or wallet identifiers. An equal/older observation does not replace newer data. Missing or >10-minute-old source data remains unavailable/stale.

`export-trader.py` imports the fixed existing SQLite read-only adapter. It does not invoke a model, modify the ledger or change the running experiment. Its initial run window is the operator-approved 27–30 October recovery window. A future run requires a reviewed exporter/window update; do not blindly reuse a window.

The fee-description conflict is deliberately unresolved in presentation: separate source-ledger realized/unrealized values, no accepted net/fee-adjusted claims or strategy-equity ranking. Researcher is configured, without an invented results integration.

Every new command must specify instance/profile. This release binds commands only to Sporekeeper/default. All prompts await a human HQ decision; native Hermes approvals remain in force. Other profiles are visibility-only until command-route acceptance. Cron mutation APIs refuse requests and their controls are removed.

Rollback: first disable only the new publisher timers; revert the web deployment to `dpl_6w4e3a6rAoEquu7dMtyHnrP9U3As` and restore the bridge backup from the dated host report. Keep additive columns/schema for inspection; do not drop analytics roles/schema while any deployment still references them. No Hermes container, runner, ledger, official dashboard, native approval setting or source profile needs restoration. Usage tuning follows functional release acceptance; the Launch change was made by Milan, not this deployment.
