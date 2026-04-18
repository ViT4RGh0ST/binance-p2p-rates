# binance-p2p-rates

CLI tool (Node, no dependencies) that queries Binance P2P USDT rates
filtered by fiat currency, payment method / bank, and transaction amount.
Useful to check what you'd actually pay or receive on the P2P market
before opening a trade, and to feed structured rate data into other
automations.

## Requirements

- Node.js **≥ 18** (uses the native `fetch` API).
- Outbound HTTPS access to `p2p.binance.com`.

No `npm install` needed — the script has zero runtime dependencies.

## Usage

```bash
node p2p_rates.mjs [options]
```

### Options

| Flag               | Type    | Default      | Description                                                                 |
| ------------------ | ------- | ------------ | --------------------------------------------------------------------------- |
| `--amount N`       | number  | —            | Only include ads that accept this fiat amount (Binance `transAmount`).      |
| `--target-ves N`   | number  | —            | Shortcut: sets `--amount` and reports the USDT equivalent at best/avg rate. |
| `--fiat CODE`      | string  | `VES`        | Fiat currency code (`VES`, `USD`, `COP`, `ARS`, etc.).                      |
| `--trade SIDE`     | enum    | `SELL`       | `SELL` = you sell USDT. `BUY` = you buy USDT.                               |
| `--bank NAME`      | string  | `provincial` | Single payment method alias (see below), or `any`/`none` to disable.       |
| `--banks a,b,c`    | list    | —            | Compare multiple banks in one run. Overrides `--bank`; adds a `by_bank` block to the summary and picks the global best across all banks. |
| `--rows N`         | number  | `5`          | Merchants per bank (1–20).                                                  |
| `--min-orders N`   | number  | `0`          | Exclude merchants with fewer monthly orders than N.                         |
| `--min-finish-rate N` | number | `0`         | Minimum 30-day completion rate. Accepts `0.98` or `98` — both mean 98%.    |
| `--tradable-only`  | flag    | off          | Keep only ads with `isTradable=true` (skip out-of-stock/paused).            |
| `--verified-only`  | flag    | off          | Restrict to verified merchants (sends `publisherType=merchant` to Binance). |
| `--json`           | flag    | off          | Print the raw per-bank responses as JSON.                                   |
| `--summary-json`   | flag    | off          | Print a compact structured summary (best/avg/worst + merchants + by_bank). |
| `-h`, `--help`     | flag    | —            | Show help and exit.                                                         |

### Supported bank aliases

`provincial`, `banesco`, `mercantil`, `bdv`, `bancamiga`, `bancaribe`,
`bnc`, `pagomovil`, `bank`, `zelle`, `zinli`. Any other string is passed
through to Binance as-is (useful for methods outside this list).

## Examples

Top 5 merchants buying USDT via BBVA Provincial right now, default VES:

```bash
node p2p_rates.mjs
```

Need to pay something worth 20,000 VES — get the best rate and the USDT
to sell, filtering out low-activity merchants:

```bash
node p2p_rates.mjs --target-ves 20000 --bank provincial --min-orders 100
```

Buy USDT with Zelle at the cheapest rate:

```bash
node p2p_rates.mjs --trade BUY --fiat USD --bank zelle --rows 10
```

Machine-readable output for downstream automations:

```bash
node p2p_rates.mjs --target-ves 50000 --bank provincial --summary-json
```

## Summary JSON shape

```jsonc
{
  "timestamp": "2026-04-17T20:16:13.411Z",
  "query": { "trade": "SELL", "fiat": "VES", "bank": "provincial", "amount": 50000, "min_orders": 100 },
  "n_merchants": 5,
  "best": {
    "rate": 617.60,
    "merchant": "ElGocho54",
    "orders": 514,
    "min": 20000,
    "max": 37111,
    "methods": ["Provincial"]
  },
  "avg_rate": 617.06,
  "worst_rate": 616.80,
  "merchants": [ /* full list with per-merchant details */ ],
  "target": {
    "target_ves": 50000,
    "usdt_at_best_rate": 80.96,
    "usdt_at_avg_rate": 80.99
  }
}
```

`target` is only present when `--target-ves` is passed.

## Notes

- The Binance endpoint used (`/bapi/c2c/v2/friendly/c2c/adv/search`) is
  public and does not require an API key.
- Binance rate-limits per IP. If you poll on a schedule, space calls at
  least a few seconds apart and add a backoff on HTTP 429.
- Rates move continuously (usually ±0.5 in the fiat unit per refresh);
  don't treat a single snapshot as the definitive market price.

## Disclaimer

This tool reads a public endpoint and is intended for personal/educational
use. It is not affiliated with or endorsed by Binance. You are responsible
for complying with Binance's Terms of Service in your jurisdiction. No
warranty is provided — use at your own risk.

## License

[MIT](./LICENSE)
