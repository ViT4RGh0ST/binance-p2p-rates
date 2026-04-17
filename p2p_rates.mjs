#!/usr/bin/env node
// Binance P2P rate checker — PoC
// Uso: node p2p_rates.mjs [--amount 500] [--fiat VES] [--trade SELL|BUY] [--bank provincial] [--rows 5] [--json]

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
    fiat: "VES",
    trade: "SELL",
    bank: "provincial",
    rows: 5,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--amount") args.amount = argv[++i];
    else if (a === "--fiat") args.fiat = argv[++i];
    else if (a === "--trade") args.trade = argv[++i].toUpperCase();
    else if (a === "--bank") args.bank = argv[++i];
    else if (a === "--rows") args.rows = Number(argv[++i]);
    else if (a === "--json") args.json = true;
    else if (a === "-h" || a === "--help") {
      console.log(
        "Uso: node p2p_rates.mjs [--amount N] [--fiat VES] [--trade SELL|BUY] [--bank provincial|banesco|zelle|...] [--rows 5] [--json]"
      );
      process.exit(0);
    }
  }
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
  if (bank) {
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

function pad(s, n, right = false) {
  s = String(s);
  if (s.length > n) s = s.slice(0, n);
  return right ? s.padStart(n) : s.padEnd(n);
}

function formatTable(data, fiat) {
  const ads = data.data || [];
  if (!ads.length) return "Sin resultados. Prueba sin --bank o baja el --amount.";
  const lines = [];
  lines.push(
    `${pad("Mercader", 22)} ${pad("Precio", 9, true)} ${pad("Min", 12, true)} ${pad("Max", 14, true)} ${pad("Orders", 7, true)}  Métodos`
  );
  lines.push("-".repeat(100));
  const prices = [];
  for (const item of ads) {
    const adv = item.adv;
    const u = item.advertiser;
    const price = Number(adv.price);
    prices.push(price);
    const methods = (adv.tradeMethods || []).map((t) => t.identifier).join(",");
    lines.push(
      `${pad(u.nickName, 22)} ` +
        `${pad(price.toFixed(2), 9, true)} ` +
        `${pad(adv.minSingleTransAmount, 12, true)} ` +
        `${pad(adv.dynamicMaxSingleTransAmount, 14, true)} ` +
        `${pad(u.monthOrderCount ?? "?", 7, true)}  ` +
        `${methods.slice(0, 45)}`
    );
  }
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  lines.push("");
  lines.push(
    `Promedio: ${avg.toFixed(2)} ${fiat}/USDT  |  Min: ${Math.min(...prices).toFixed(2)}  |  Max: ${Math.max(...prices).toFixed(2)}`
  );
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
    console.log(
      `\nConsulta: ${args.trade} USDT/${args.fiat}  |  Banco: ${args.bank}  |  Monto: ${args.amount ?? "sin filtro"}  |  Top ${args.rows}\n`
    );
    console.log(formatTable(data, args.fiat));
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
})();
