#!/usr/bin/env node
// Binance P2P rate checker
// Uso: node p2p_rates.mjs [--amount N] [--target-ves N] [--fiat VES] [--trade SELL|BUY]
//                         [--bank provincial|banesco|...|any] [--rows 5]
//                         [--min-orders N] [--json] [--summary-json]

const URL = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";

const PAY_TYPES = {
  provincial: "Provincial",
  banesco: "Banesco",
  mercantil: "Mercantil",
  bdv: "BancoDeVenezuela",
  bancamiga: "Bancamiga",
  bancaribe: "Bancaribe",
  bnc: "BNCBancoNacional",
  pagomovil: "PagoMovil",
  bank: "BANK",
  zelle: "Zelle",
  zinli: "Zinli",
};

function parseArgs(argv) {
  const args = {
    amount: null,
    targetVes: null,
    fiat: "VES",
    trade: "SELL",
    bank: "provincial",
    rows: 5,
    minOrders: 0,
    json: false,
    summaryJson: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--amount") args.amount = argv[++i];
    else if (a === "--target-ves") args.targetVes = Number(argv[++i]);
    else if (a === "--fiat") args.fiat = argv[++i];
    else if (a === "--trade") args.trade = argv[++i].toUpperCase();
    else if (a === "--bank") args.bank = argv[++i];
    else if (a === "--rows") args.rows = Number(argv[++i]);
    else if (a === "--min-orders") args.minOrders = Number(argv[++i]);
    else if (a === "--json") args.json = true;
    else if (a === "--summary-json") args.summaryJson = true;
    else if (a === "-h" || a === "--help") {
      console.log(
        [
          "Uso: node p2p_rates.mjs [opciones]",
          "",
          "  --amount N         Filtra anuncios que acepten N (en fiat)",
          "  --target-ves N     Atajo: fija --amount N y calcula USDT equivalente",
          "  --fiat VES|USD|... Moneda fiat (default VES)",
          "  --trade SELL|BUY   SELL=tú vendes USDT (default), BUY=tú compras",
          "  --bank NAME        provincial|banesco|mercantil|bdv|bancamiga|bancaribe|",
          "                     bnc|pagomovil|zelle|zinli|any  (default provincial)",
          "  --rows N           Filas a pedir (default 5)",
          "  --min-orders N     Excluye mercaderes con < N órdenes/mes",
          "  --json             JSON crudo de Binance",
          "  --summary-json     JSON compacto listo para agente/CSV",
        ].join("\n")
      );
      process.exit(0);
    }
  }
  if (args.targetVes != null && args.amount == null) args.amount = args.targetVes;
  return args;
}

async function fetchRates({ amount, fiat, trade, bank, rows }) {
  const payload = {
    asset: "USDT",
    tradeType: trade,
    fiat,
    page: 1,
    rows,
    publisherType: null,
    merchantCheck: false,
  };
  if (amount) payload.transAmount = String(amount);
  if (bank && !["any", "none", ""].includes(bank.toLowerCase())) {
    const id = PAY_TYPES[bank.toLowerCase()] || bank;
    payload.payTypes = [id];
  }

  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

function extractMerchants(data, minOrders) {
  const ads = data.data || [];
  const out = [];
  for (const item of ads) {
    const adv = item.adv;
    const u = item.advertiser;
    const orders = Number(u.monthOrderCount ?? 0);
    if (orders < minOrders) continue;
    out.push({
      nick: u.nickName,
      rate: Number(adv.price),
      orders,
      finish_rate: u.monthFinishRate != null ? Number(u.monthFinishRate) : null,
      min: Number(adv.minSingleTransAmount),
      max: Number(adv.dynamicMaxSingleTransAmount),
      methods: (adv.tradeMethods || []).map((t) => t.identifier),
      user_type: u.userType,
      user_no: u.userNo,
    });
  }
  return out;
}

function buildSummary(args, merchants) {
  const base = {
    timestamp: new Date().toISOString(),
    query: {
      trade: args.trade,
      fiat: args.fiat,
      bank: args.bank,
      amount: args.amount != null ? Number(args.amount) : null,
      min_orders: args.minOrders,
    },
    n_merchants: merchants.length,
  };
  if (!merchants.length) return { ...base, best: null, avg_rate: null, worst_rate: null, merchants: [] };

  const rates = merchants.map((m) => m.rate);
  const bestIdx = args.trade === "SELL" ? rates.indexOf(Math.max(...rates)) : rates.indexOf(Math.min(...rates));
  const best = merchants[bestIdx];
  const summary = {
    ...base,
    best: { rate: best.rate, merchant: best.nick, orders: best.orders, min: best.min, max: best.max, methods: best.methods },
    avg_rate: Number((rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(4)),
    worst_rate: args.trade === "SELL" ? Math.min(...rates) : Math.max(...rates),
    merchants,
  };
  if (args.targetVes != null && best) {
    summary.target = {
      target_ves: args.targetVes,
      usdt_at_best_rate: Number((args.targetVes / best.rate).toFixed(6)),
      usdt_at_avg_rate: Number((args.targetVes / summary.avg_rate).toFixed(6)),
    };
  }
  return summary;
}

function pad(s, n, right = false) {
  s = String(s);
  if (s.length > n) s = s.slice(0, n);
  return right ? s.padStart(n) : s.padEnd(n);
}

function formatTable(merchants, args) {
  if (!merchants.length) return "Sin resultados. Prueba --bank any, baja --amount o --min-orders.";
  const lines = [];
  lines.push(
    `${pad("Mercader", 22)} ${pad("Precio", 9, true)} ${pad("Min", 12, true)} ${pad("Max", 14, true)} ${pad("Orders", 7, true)}  Métodos`
  );
  lines.push("-".repeat(100));
  for (const m of merchants) {
    lines.push(
      `${pad(m.nick, 22)} ` +
        `${pad(m.rate.toFixed(2), 9, true)} ` +
        `${pad(m.min, 12, true)} ` +
        `${pad(m.max, 14, true)} ` +
        `${pad(m.orders, 7, true)}  ` +
        `${m.methods.join(",").slice(0, 45)}`
    );
  }
  const rates = merchants.map((m) => m.rate);
  const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
  lines.push("");
  lines.push(
    `Promedio: ${avg.toFixed(2)} ${args.fiat}/USDT  |  Min: ${Math.min(...rates).toFixed(2)}  |  Max: ${Math.max(...rates).toFixed(2)}`
  );
  if (args.targetVes != null) {
    const best = args.trade === "SELL" ? Math.max(...rates) : Math.min(...rates);
    lines.push(
      `Target ${args.targetVes} ${args.fiat}  →  USDT a mejor tasa (${best.toFixed(2)}): ${(args.targetVes / best).toFixed(4)}`
    );
  }
  return lines.join("\n");
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  try {
    const data = await fetchRates(args);
    if (args.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    const merchants = extractMerchants(data, args.minOrders);
    if (args.summaryJson) {
      console.log(JSON.stringify(buildSummary(args, merchants), null, 2));
      return;
    }
    console.log(
      `\nConsulta: ${args.trade} USDT/${args.fiat}  |  Banco: ${args.bank}  |  Monto: ${args.amount ?? "sin filtro"}  |  Min-orders: ${args.minOrders}  |  Top ${args.rows}\n`
    );
    console.log(formatTable(merchants, args));
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
})();
