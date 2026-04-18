# Roadmap

Tracked improvements for `p2p_rates.mjs` (standalone) and the matching
OpenClaw plugin (`extensions/p2p-rates/` in VitarClaw2). Items are not
ordered by priority — priorities get reassessed per iteration.

## In progress

_(empty)_

## Pending

- [ ] **2. Persistent mini-history.** Log each call (or a scheduled poll) as a row in `~/.openclaw/workspace/p2p_rates.sqlite`. Add a sibling tool `p2p_rates_history` for questions like "average best rate today" or "peak this week". **Tradeoff:** introduces persistence — keep the primary `p2p_rates` tool pure by separating the writer into a hook or second plugin. Enables the CSV/agent-decides-to-log flow cleanly.

- [ ] **4. Optional alerts / thresholds.** Param like `alert_if_above: 620`. When the best rate crosses the threshold, include `alert: true` in the summary so downstream agents can notify/act. **Tradeoff:** thresholds are subjective and rot with market drift; could be framed as percentiles over history once #2 lands.

- [ ] **5. Rate limiting + retry with backoff.** Retry 429/5xx with exponential backoff; add jitter. Necessary hygiene before running periodic polls (every N minutes) for the history table.

## Done

- [x] **1. Multi-bank query in a single call.** `--banks provincial,banesco,mercantil` (CLI) / `banks: [...]` (tool param). Response includes `by_bank` breakdown and a global best across all banks. Shipped 2026-04-17.
- [x] **3. `finish_rate` filter.** `--min-finish-rate 0.98` (CLI, also accepts `98`) / `min_finish_rate: 0.98` (tool param). Shipped 2026-04-17.
- [x] **Prior filters:** `tradable_only` and `verified_only` params + CLI flags. Shipped 2026-04-17.

## Not doing (yet)

- Multi-asset (BTC/ETH). Scope creep for current use case (USDT/VES).
- Authentication / private endpoints. Public `/friendly/` endpoint is enough.
