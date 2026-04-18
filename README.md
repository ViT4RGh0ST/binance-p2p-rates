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

| Market | Aliases |
| ------ | ------- |
| Venezuela (`--fiat VES`) | `provincial`, `banesco`, `mercantil`, `bdv`, `bancamiga`, `bancaribe`, `bnc`, `pagomovil`, `zinli` |
| Colombia (`--fiat COP`)  | `bancolombia`, `nequi`, `daviplata`, `davivienda`, `bogota`, `cajasocial`, `scotiabank` / `colpatria`, `breb` (Bre-B keys), `cashdeposit` |
| Multi-market / generic    | `bank`, `bbva`, `zelle` |

Any other string is passed through to Binance as-is (useful for payment
methods outside this list). Pass `any` to disable the bank filter entirely.

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

**Compare multiple banks in one shot** (the tool fetches each in parallel
and picks the global best, plus a per-bank breakdown):

```bash
node p2p_rates.mjs --banks provincial,banesco,mercantil --rows 3
```

Only trade with verified merchants that have a ≥98% completion rate and
active tradable ads:

```bash
node p2p_rates.mjs --banks provincial,banesco --verified-only --tradable-only --min-finish-rate 0.98
```

Buy USDT with Zelle at the cheapest rate:

```bash
node p2p_rates.mjs --trade BUY --fiat USD --bank zelle --rows 10
```

Compare top Colombian banks (Bancolombia, Nequi, Daviplata) for selling USDT:

```bash
node p2p_rates.mjs --fiat COP --banks bancolombia,nequi,daviplata --rows 3
```

Machine-readable output for downstream automations (includes `by_bank` when
multiple banks are queried):

```bash
node p2p_rates.mjs --target-ves 50000 --banks provincial,banesco --summary-json
```

## Summary JSON shape

```jsonc
{
  "timestamp": "2026-04-17T20:16:13.411Z",
  "query": {
    "trade": "SELL",
    "fiat": "VES",
    "banks": ["provincial", "banesco"],
    "amount": 50000,
    "min_orders": 100,
    "min_finish_rate": 0.98,
    "tradable_only": true,
    "verified_only": true
  },
  "n_merchants": 6,
  "best": {
    "rate": 620.60,
    "merchant": "Blank_Mind",
    "bank": "banesco",
    "orders": 5793,
    "min": 2000000,
    "max": 14000000,
    "methods": ["Banesco"],
    "verified": true
  },
  "avg_rate": 619.01,
  "worst_rate": 617.56,
  "merchants": [
    /* sorted globally by best rate; each item includes bank, verified,
       pro_merchant, tradable, finish_rate, orders, min, max, methods */
  ],
  "by_bank": {
    "provincial": { "best_rate": 617.61, "best_merchant": "TuCambioYa_", "avg_rate": 617.59, "n_merchants": 3 },
    "banesco":    { "best_rate": 620.60, "best_merchant": "Blank_Mind",  "avg_rate": 620.44, "n_merchants": 3 }
  },
  "target": {
    "target_ves": 50000,
    "usdt_at_best_rate": 80.57,
    "usdt_at_avg_rate": 80.77
  }
}
```

- `by_bank` appears only when more than one bank is queried.
- `target` appears only when `--target-ves` is passed.
- If a specific bank fails (network, rate limit), its entry in `by_bank` carries an `error` field and its merchants are excluded from the merged list.

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
