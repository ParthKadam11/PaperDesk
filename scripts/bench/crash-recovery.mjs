#!/usr/bin/env node
/**
 * Crash recovery (k6-adjacent): seed book on an isolated engine, SIGKILL,
 * restart against the same WAL/data dir, measure time to /health/live and
 * assert book + balances + orders match.
 *
 * Uses a clean data dir on this VPS so production ~500MB snapshots do not
 * dominate the recovery clock (those are a separate ops issue).
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import os from "node:os";
import { startBenchEngine, waitHttpOk, ROOT } from "./spawn-engine.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MARKET = "SOL-USD";

async function api(baseUrl, token, method, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-gateway-token": token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

function normalizeBook(book) {
  const bids = [...(book.bids || [])]
    .map((l) => ({ price: l.price, quantity: l.quantity }))
    .sort((a, b) => b.price - a.price);
  const asks = [...(book.asks || [])]
    .map((l) => ({ price: l.price, quantity: l.quantity }))
    .sort((a, b) => a.price - b.price);
  return { bids, asks };
}

function balancesMap(payload) {
  const out = {};
  for (const b of payload.balances || []) {
    out[`${b.userId}:${b.asset}`] = {
      available: b.available,
      locked: b.locked,
    };
  }
  return out;
}

function restartEngine({ port, dataDir, token }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      "pnpm",
      ["--filter", "@cex/exchange", "start"],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          NODE_ENV: "production",
          EXCHANGE_PORT: String(port),
          EXCHANGE_DATA_DIR: dataDir,
          EXCHANGE_ALLOW_EPHEMERAL_DATA: "true",
          EXCHANGE_MARKETS: MARKET,
          EXCHANGE_GATEWAY_TOKEN: token,
        },
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      },
    );
    let logs = "";
    child.stdout.on("data", (b) => {
      logs += b.toString();
    });
    child.stderr.on("data", (b) => {
      logs += b.toString();
    });
    child.on("error", reject);
    resolvePromise({
      child,
      logs: () => logs,
      async stop() {
        try {
          if (child.pid) process.kill(-child.pid, "SIGKILL");
        } catch {
          try {
            child.kill("SIGKILL");
          } catch {
            // gone
          }
        }
        await new Promise((r) => setTimeout(r, 200));
      },
    });
  });
}

async function main() {
  const engine = await startBenchEngine({ port: 4019, keepData: true });
  const { baseUrl, token, dataDir, port } = engine;

  try {
    const buyer = "bench-recovery-buyer";
    const seller = "bench-recovery-seller";
    const sellId = "bench-recovery-sell-1";
    const buyId = "bench-recovery-buy-1";

    for (const [userId, asset, amount] of [
      [buyer, "USD", 100_000],
      [seller, "SOL", 100],
    ]) {
      const r = await api(baseUrl, token, "POST", `/v1/markets/${MARKET}/credit`, {
        userId,
        asset,
        amount,
        commandId: `bench-recovery-credit-${userId}-${asset}`,
      });
      if (r.status !== 200) {
        throw new Error(`credit failed: ${JSON.stringify(r.json)}`);
      }
    }

    for (const order of [
      {
        orderId: sellId,
        userId: seller,
        side: "SELL",
        type: "LIMIT",
        timeInForce: "GTC",
        price: 123456,
        quantity: 7,
      },
      {
        orderId: buyId,
        userId: buyer,
        side: "BUY",
        type: "LIMIT",
        timeInForce: "GTC",
        price: 42,
        quantity: 3,
      },
    ]) {
      const r = await api(baseUrl, token, "POST", `/v1/markets/${MARKET}/orders`, order);
      if (r.status !== 200 || !r.json?.accepted) {
        throw new Error(`seed order failed: ${JSON.stringify(r.json)}`);
      }
    }

    const bookBefore = normalizeBook(
      (await api(baseUrl, token, "GET", `/v1/markets/${MARKET}/book`)).json,
    );
    const balBuyerBefore = balancesMap(
      (await api(baseUrl, token, "GET", `/v1/markets/${MARKET}/balances/${buyer}`))
        .json,
    );
    const balSellerBefore = balancesMap(
      (await api(baseUrl, token, "GET", `/v1/markets/${MARKET}/balances/${seller}`))
        .json,
    );
    const orderSellBefore = (
      await api(baseUrl, token, "GET", `/v1/markets/${MARKET}/orders/${sellId}`)
    ).json;
    const orderBuyBefore = (
      await api(baseUrl, token, "GET", `/v1/markets/${MARKET}/orders/${buyId}`)
    ).json;

    console.log("SIGKILL isolated exchange…");
    await engine.stop("SIGKILL");

    console.log("restarting against same data dir…");
    const restartStarted = Date.now();
    const restarted = await restartEngine({ port, dataDir, token });
    let recoveryMs;
    try {
      recoveryMs = await waitHttpOk(`${baseUrl}/health/live`, 90_000);
    } catch (e) {
      await restarted.stop("SIGKILL");
      throw new Error(`${e.message}\n${restarted.logs().slice(-2000)}`);
    }
    const wallMs = Date.now() - restartStarted;

    const bookAfter = normalizeBook(
      (await api(baseUrl, token, "GET", `/v1/markets/${MARKET}/book`)).json,
    );
    const balBuyerAfter = balancesMap(
      (await api(baseUrl, token, "GET", `/v1/markets/${MARKET}/balances/${buyer}`))
        .json,
    );
    const balSellerAfter = balancesMap(
      (await api(baseUrl, token, "GET", `/v1/markets/${MARKET}/balances/${seller}`))
        .json,
    );
    const orderSellAfter = (
      await api(baseUrl, token, "GET", `/v1/markets/${MARKET}/orders/${sellId}`)
    ).json;
    const orderBuyAfter = (
      await api(baseUrl, token, "GET", `/v1/markets/${MARKET}/orders/${buyId}`)
    ).json;

    const bookMatch = JSON.stringify(bookBefore) === JSON.stringify(bookAfter);
    const balMatch =
      JSON.stringify(balBuyerBefore) === JSON.stringify(balBuyerAfter) &&
      JSON.stringify(balSellerBefore) === JSON.stringify(balSellerAfter);
    const ordersMatch =
      orderSellBefore?.order?.orderId === orderSellAfter?.order?.orderId &&
      orderSellBefore?.order?.quantity === orderSellAfter?.order?.quantity &&
      orderBuyBefore?.order?.orderId === orderBuyAfter?.order?.orderId &&
      orderBuyBefore?.order?.quantity === orderBuyAfter?.order?.quantity;

    await api(baseUrl, token, "DELETE", `/v1/markets/${MARKET}/orders/${sellId}`);
    await api(baseUrl, token, "DELETE", `/v1/markets/${MARKET}/orders/${buyId}`);
    await restarted.stop("SIGTERM");

    const result = {
      tool: "crash-recovery",
      method: "SIGKILL + WAL/snapshot reload on clean data dir",
      hardware: {
        hostname: os.hostname(),
        cpus: os.cpus().length,
        memGb: Number((os.totalmem() / 1024 / 1024 / 1024).toFixed(1)),
        platform: `${os.type()} ${os.release()}`,
      },
      crash_recovery_ms: recoveryMs,
      restart_wall_ms: wallMs,
      book_match: bookMatch,
      balances_match: balMatch,
      orders_match: ordersMatch,
      ok: bookMatch && balMatch && ordersMatch,
    };

    const outPath = resolve(__dirname, "recovery-last-run.json");
    writeFileSync(outPath, JSON.stringify(result, null, 2));

    console.log("\n=== crash recovery ===");
    console.log(`crash_recovery_ms: ${recoveryMs}`);
    console.log(`restart_wall_ms: ${wallMs}`);
    console.log(`book+balances+orders match: ${result.ok ? "yes" : "NO"}`);
    console.log(`wrote ${outPath}`);

    if (!result.ok) {
      console.error({ bookBefore, bookAfter, balBuyerBefore, balBuyerAfter });
      process.exit(1);
    }
  } finally {
    try {
      await engine.stop("SIGKILL");
    } catch {
      // already dead
    }
    engine.cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
