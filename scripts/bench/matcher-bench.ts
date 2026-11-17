/**
 * In-process matching-engine bench — no HTTP, Redis, or Postgres.
 *
 *   pnpm bench:matcher
 */
import os from "node:os";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { OrderType, Side, TimeInForce, type Order } from "@cex/exchange-types";
import { MatchingEngine } from "../../apps/exchange/src/matching/matchingEngine.js";
import { OrderBook } from "../../apps/exchange/src/book/orderBook.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function order(
  partial: Pick<Order, "orderId" | "side" | "price" | "quantity"> &
    Partial<Order>,
): Order {
  return {
    userId: "bench",
    market: "SOL-USD",
    type: OrderType.LIMIT,
    timeInForce: TimeInForce.GTC,
    filledQuantity: 0,
    status: "NEW",
    timestamp: 1,
    ...partial,
  };
}

function nsPer(ops: number, ms: number): number {
  return (ms * 1e6) / ops;
}

function main() {
  const ADD_N = Number(process.env.MATCHER_ADDS || 500_000);
  const MATCH_N = Number(process.env.MATCHER_MATCHES || 1_000_000);
  const engine = new MatchingEngine();
  const book = new OrderBook("SOL-USD");

  // Warm JIT
  for (let i = 0; i < 10_000; i++) {
    book.add(
      order({
        orderId: `w-s-${i}`,
        side: Side.SELL,
        price: 100_000 + (i % 50),
        quantity: 1,
      }),
    );
  }
  for (let i = 0; i < 10_000; i++) {
    const taker = order({
      orderId: `w-b-${i}`,
      side: Side.BUY,
      price: 200_000,
      quantity: 1,
    });
    engine.match(taker, book);
  }

  // Fresh book for measured adds
  const addBook = new OrderBook("SOL-USD");
  const tAdd0 = performance.now();
  for (let i = 0; i < ADD_N; i++) {
    addBook.add(
      order({
        orderId: `a-${i}`,
        side: i % 2 === 0 ? Side.BUY : Side.SELL,
        price: i % 2 === 0 ? 90_000 - (i % 100) : 110_000 + (i % 100),
        quantity: 1,
      }),
    );
  }
  const tAdd1 = performance.now();
  const addMs = tAdd1 - tAdd0;
  const addPerSec = Math.round((ADD_N / addMs) * 1000);

  // Deep ask book, then 1M crossing buys (each fills 1 lot; replenish maker)
  const matchBook = new OrderBook("SOL-USD");
  const matchEngine = new MatchingEngine();
  let makerSeq = 0;
  const seedAsks = 10_000;
  for (let i = 0; i < seedAsks; i++) {
    matchBook.add(
      order({
        orderId: `m-${makerSeq++}`,
        side: Side.SELL,
        price: 100,
        quantity: 1,
      }),
    );
  }

  let trades = 0;
  const tMatch0 = performance.now();
  for (let i = 0; i < MATCH_N; i++) {
    // Keep the book stocked so every taker matches
    if (i % 1000 === 0) {
      for (let j = 0; j < 1000; j++) {
        matchBook.add(
          order({
            orderId: `m-${makerSeq++}`,
            side: Side.SELL,
            price: 100,
            quantity: 1,
          }),
        );
      }
    }
    const taker = order({
      orderId: `t-${i}`,
      side: Side.BUY,
      price: 100,
      quantity: 1,
    });
    const result = matchEngine.match(taker, matchBook);
    trades += result.trades.length;
  }
  const tMatch1 = performance.now();
  const matchMs = tMatch1 - tMatch0;
  const matchPerSec = Math.round((MATCH_N / matchMs) * 1000);
  const tradePerSec = Math.round((trades / matchMs) * 1000);

  const report = {
    tool: "in-process-matcher",
    hardware: {
      hostname: os.hostname(),
      cpus: os.cpus().length,
      memGb: Number((os.totalmem() / 1024 / 1024 / 1024).toFixed(1)),
      platform: `${os.type()} ${os.release()}`,
      node: process.version,
    },
    note: "Pure MatchingEngine + OrderBook in one Node process. No HTTP, Redis, Postgres, or WAL.",
    book_adds: {
      ops: ADD_N,
      ms: Number(addMs.toFixed(1)),
      perSec: addPerSec,
      nsPerOp: Math.round(nsPer(ADD_N, addMs)),
    },
    matches: {
      takers: MATCH_N,
      trades,
      ms: Number(matchMs.toFixed(1)),
      takersPerSec: matchPerSec,
      tradesPerSec: tradePerSec,
      nsPerTaker: Math.round(nsPer(MATCH_N, matchMs)),
    },
    capturedAt: new Date().toISOString(),
  };

  const out = resolve(__dirname, "matcher-last-run.json");
  writeFileSync(out, JSON.stringify(report, null, 2));

  console.log("");
  console.log("========================================");
  console.log("  IN-PROCESS MATCHER (screenshot)");
  console.log("========================================");
  console.log(
    `hardware: ${report.hardware.hostname} · ${report.hardware.cpus} cpus · ${report.hardware.memGb} GiB · ${report.hardware.node}`,
  );
  console.log(
    `book adds:   ${report.book_adds.perSec.toLocaleString()}/s  (${ADD_N.toLocaleString()} ops, ${report.book_adds.nsPerOp} ns/op)`,
  );
  console.log(
    `matches:     ${report.matches.takersPerSec.toLocaleString()} takers/s  (${MATCH_N.toLocaleString()} takers)`,
  );
  console.log(
    `trades:      ${report.matches.tradesPerSec.toLocaleString()} trades/s  (${trades.toLocaleString()} fills)`,
  );
  console.log(`latency:     ~${report.matches.nsPerTaker} ns per match`);
  console.log("========================================");
  console.log(`wrote ${out}`);
}

main();
