#!/usr/bin/env node
// Binance P2P rate checker
// See README.md for full usage. Quick flags:
//   --amount N --target-ves N --fiat VES --trade SELL|BUY
//   --bank provincial    (single)       or    --banks provincial,banesco,mercantil
//   --rows 5 --min-orders N
//   --tradable-only --verified-only
//   --json --summary-json

const URL = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";

function normalizeFinishRate(v) {
  if (!Number.isFinite(v) || v <= 0) return 0;
  const normalized = v > 1 ? v / 100 : v;
  return Math.max(0, Math.min(1, normalized));
}

const PAY_TYPES = {
  // Venezuela (VES)
  provincial: "Provincial",
  banesco: "Banesco",
  mercantil: "Mercantil",
  bdv: "BancoDeVenezuela",
  bancamiga: "Bancamiga",
  bancaribe: "Bancaribe",
  bnc: "BNCBancoNacional",
  pagomovil: "PagoMovil",
  zinli: "Zinli",
  // Colombia (COP)
  bancolombia: "BancolombiaSA",
  nequi: "Nequi",
  daviplata: "Daviplata",
  davivienda: "DaviviendaSA",
  bogota: "BancodeBogota",
  bancodebogota: "BancodeBogota",
  cajasocial: "BancoSocialColombia",
  scotiabank: "ScotiabankColpatria",
  colpatria: "ScotiabankColpatria",
  breb: "BreBKeys",
  brebkeys: "BreBKeys",
  cashdeposit: "CashDeposit",
  // Multi-market / generic
  bank: "BANK",
  bbva: "BBVABank",
  zelle: "Zelle",
};

function resolveBankPayType(bank) {
  const normalized = bank.toLowerCase();
  if (["any", "none", ""].includes(normalized)) return null;
  return PAY_TYPES[normalized] ?? bank;
}

function isVerified(user) {
  if (user.proMerchant === true) return true;
  if (typeof user.userIdentity === "string" && user.userIdentity.toUpperCase() === "MERCHANT") return true;
  if (typeof user.userType === "string" && user.userType.toLowerCase() === "merchant") return true;
  return false;
}

function parseArgs(argv) {
  const args = {
    amount: null,
    targetVes: null,
    fiat: "VES",
    trade: "SELL",
    bank: "provincial",
    banks: null,
    rows: 5,
    minOrders: 0,
    minFinishRate: 0,
    tradableOnly: false,
    verifiedOnly: false,
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
    else if (a === "--banks") {
      args.banks = argv[++i]
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v !== "");
    } else if (a === "--rows") args.rows = Number(argv[++i]);
    else if (a === "--min-orders") args.minOrders = Number(argv[++i]);
    else if (a === "--min-finish-rate") args.minFinishRate = normalizeFinishRate(Number(argv[++i]));
    else if (a === "--tradable-only") args.tradableOnly = true;
    else if (a === "--verified-only") args.verifiedOnly = true;
    else if (a === "--json") args.json = true;
    else if (a === "--summary-json") args.summaryJson = true;
    else if (a === "-h" || a === "--help") {
      console.log(
        [
          "Uso: node p2p_rates.mjs [opciones]",
          "",
          "  --amount N          Filtra anuncios que acepten N (en fiat)",
          "  --target-ves N      Atajo: fija --amount N y calcula USDT equivalente",
          "  --fiat VES|USD|...  Moneda fiat (default VES)",
          "  --trade SELL|BUY    SELL=tú vendes USDT (default), BUY=tú compras",
          "  --bank NAME         Un solo banco / método (default provincial)",
          "  --banks a,b,c       Compara varios bancos en una sola corrida",
          "                      (prevalece sobre --bank; añade bloque by_bank)",
          "  --rows N            Filas por banco (default 5, max 20)",
          "  --min-orders N      Excluye mercaderes con < N órdenes/mes",
          "  --min-finish-rate N Excluye mercaderes con tasa de completación < N",
          "                      (acepta 0-1 o 0-100; ej 0.98 o 98)",
          "  --tradable-only     Solo ads con isTradable=true",
          "  --verified-only     Solo merchants verificados (publisherType=merchant)",
          "  --json              JSON crudo del primer banco",
          "  --summary-json      JSON compacto (estructurado, multi-banco)",
          "",
          "Aliases de --bank / --banks:",
          "  VE (VES): provincial, banesco, mercantil, bdv, bancamiga,",
          "            bancaribe, bnc, pagomovil, zinli",
          "  CO (COP): bancolombia, nequi, daviplata, davivienda, bogota,",
          "            cajasocial, scotiabank|colpatria, breb, cashdeposit",
          "  Mixto:    bank, bbva, zelle, any.",
        ].join("\n")
      );
      process.exit(0);
    }
  }
  if (args.targetVes != null && args.amount == null) args.amount = args.targetVes;
  return args;
}

async function fetchOneBank(bank, args) {
  const rows = args.verifiedOnly ? Math.min(20, args.rows + 5) : args.rows;
  const payload = {
    asset: "USDT",
    tradeType: args.trade,
    fiat: args.fiat,
    page: 1,
    rows,
    publisherType: args.verifiedOnly ? "merchant" : null,
    merchantCheck: args.verifiedOnly,
  };
  if (args.amount) payload.transAmount = String(args.amount);
  const payType = resolveBankPayType(bank);
  if (payType != null) payload.payTypes = [payType];

  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function extractMerchants(data, bank, args) {
  const ads = data.data || [];
  const out = [];
  for (const item of ads) {
    const adv = item.adv;
    const u = item.advertiser;
    const orders = Number(u.monthOrderCount ?? 0);
    if (orders < args.minOrders) continue;
    const rate = Number(adv.price);
    if (!Number.isFinite(rate)) continue;
    const finishRate = u.monthFinishRate != null ? Number(u.monthFinishRate) : null;
    if (args.minFinishRate > 0) {
      if (finishRate == null || finishRate < args.minFinishRate) continue;
    }
    const tradable = adv.isTradable !== false;
    if (args.tradableOnly && !tradable) continue;
    const verified = isVerified(u);
    if (args.verifiedOnly && !verified) continue;
    out.push({
      nick: u.nickName,
      rate,
      bank,
      orders,
      finish_rate: finishRate,
      min: Number(adv.minSingleTransAmount),
      max: Number(adv.dynamicMaxSingleTransAmount),
      methods: (adv.tradeMethods || []).map((t) => t.identifier),
      verified,
      pro_merchant: u.proMerchant === true,
      tradable,
      user_type: u.userType,
      user_no: u.userNo,
    });
    if (out.length >= args.rows) break;
  }
  return out;
}

function sortByBest(merchants, trade) {
  return merchants
    .slice()
    .sort((a, b) => (trade === "SELL" ? b.rate - a.rate : a.rate - b.rate));
}

function buildSummary(args, merchantsByBank, banksList) {
  const merged = [];
  const byBank = {};
  for (const { bank, merchants, error } of merchantsByBank) {
    if (error && merchants.length === 0) {
      byBank[bank] = { error, n_merchants: 0 };
      continue;
    }
    merged.push(...merchants);
    if (merchants.length > 0) {
      const rates = merchants.map((m) => m.rate);
      const bankBest = args.trade === "SELL" ? Math.max(...rates) : Math.min(...rates);
      const bankBestMerchant = merchants.find((m) => m.rate === bankBest).nick;
      const bankAvg = rates.reduce((a, b) => a + b, 0) / rates.length;
      byBank[bank] = {
        best_rate: bankBest,
        best_merchant: bankBestMerchant,
        avg_rate: Number(bankAvg.toFixed(4)),
        n_merchants: merchants.length,
      };
    }
  }
  const sortedMerged = sortByBest(merged, args.trade);
  const base = {
    timestamp: new Date().toISOString(),
    query: {
      trade: args.trade,
      fiat: args.fiat,
      banks: banksList,
      amount: args.amount != null ? Number(args.amount) : null,
      min_orders: args.minOrders,
      min_finish_rate: args.minFinishRate,
      tradable_only: args.tradableOnly,
      verified_only: args.verifiedOnly,
    },
    n_merchants: sortedMerged.length,
  };
  if (sortedMerged.length === 0) {
    return {
      ...base,
      best: null,
      avg_rate: null,
      worst_rate: null,
      merchants: [],
      ...(banksList.length > 1 ? { by_bank: byBank } : {}),
    };
  }
  const rates = sortedMerged.map((m) => m.rate);
  const best = sortedMerged[0];
  const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
  const summary = {
    ...base,
    best: {
      rate: best.rate,
      merchant: best.nick,
      bank: best.bank,
      orders: best.orders,
      min: best.min,
      max: best.max,
      methods: best.methods,
      verified: best.verified,
    },
    avg_rate: Number(avg.toFixed(4)),
    worst_rate: args.trade === "SELL" ? Math.min(...rates) : Math.max(...rates),
    merchants: sortedMerged,
  };
  if (banksList.length > 1) summary.by_bank = byBank;
  if (args.targetVes != null) {
    summary.target = {
      target_ves: args.targetVes,
      usdt_at_best_rate: Number((args.targetVes / best.rate).toFixed(6)),
      usdt_at_avg_rate: Number((args.targetVes / avg).toFixed(6)),
    };
  }
  return summary;
}

function pad(s, n, right = false) {
  s = String(s);
  if (s.length > n) s = s.slice(0, n);
  return right ? s.padStart(n) : s.padEnd(n);
}

function formatTable(summary, args) {
  if (summary.n_merchants === 0) {
    return "Sin resultados. Prueba --bank any, baja --amount / --min-orders o quita --verified-only.";
  }
  const lines = [];
  const multiBank = summary.query.banks.length > 1;
  lines.push(
    `${pad("Mercader", 22)} ${pad("Banco", 12)} ${pad("Precio", 9, true)} ${pad("Min", 12, true)} ${pad("Max", 14, true)} ${pad("Ord", 6, true)}  Métodos`
  );
  lines.push("-".repeat(108));
  for (const m of summary.merchants) {
    lines.push(
      `${pad(m.nick, 22)} ` +
        `${pad(m.bank, 12)} ` +
        `${pad(m.rate.toFixed(2), 9, true)} ` +
        `${pad(m.min, 12, true)} ` +
        `${pad(m.max, 14, true)} ` +
        `${pad(m.orders, 6, true)}  ` +
        `${m.methods.join(",").slice(0, 40)}`
    );
  }
  lines.push("");
  lines.push(
    `Promedio global: ${summary.avg_rate.toFixed(2)} ${args.fiat}/USDT  |  Min: ${summary.worst_rate.toFixed(2)}  |  Max (best): ${summary.best.rate.toFixed(2)} (${summary.best.merchant} / ${summary.best.bank})`
  );
  if (multiBank && summary.by_bank) {
    lines.push("");
    lines.push("Por banco:");
    for (const [b, v] of Object.entries(summary.by_bank)) {
      if (v.error) {
        lines.push(`  ${pad(b, 12)} error: ${v.error}`);
      } else {
        lines.push(
          `  ${pad(b, 12)} best ${v.best_rate.toFixed(2)} (${v.best_merchant})  avg ${v.avg_rate.toFixed(2)}  n=${v.n_merchants}`
        );
      }
    }
  }
  if (args.targetVes != null) {
    lines.push("");
    lines.push(
      `Target ${args.targetVes} ${args.fiat}  →  USDT a mejor tasa (${summary.best.rate.toFixed(2)}): ${(args.targetVes / summary.best.rate).toFixed(4)}`
    );
  }
  return lines.join("\n");
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const banksList = args.banks ?? [args.bank];
  try {
    const fetched = await Promise.all(
      banksList.map(async (bank) => {
        try {
          const data = await fetchOneBank(bank, args);
          return { bank, merchants: extractMerchants(data, bank, args) };
        } catch (err) {
          return { bank, merchants: [], error: err.message };
        }
      })
    );
    if (args.json) {
      console.log(JSON.stringify(fetched, null, 2));
      return;
    }
    const summary = buildSummary(args, fetched, banksList);
    if (args.summaryJson) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    console.log(
      `\nConsulta: ${args.trade} USDT/${args.fiat}  |  Bancos: ${banksList.join(",")}  |  Monto: ${args.amount ?? "sin filtro"}  |  Min-ord ${args.minOrders}  |  Verified: ${args.verifiedOnly}  |  Tradable: ${args.tradableOnly}  |  Rows/bank ${args.rows}\n`
    );
    console.log(formatTable(summary, args));
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
})();
