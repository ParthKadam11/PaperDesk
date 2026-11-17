/**
 * k6: loopback place + cancel against the exchange matching engine.
 *
 * Env:
 *   BASE_URL   default http://127.0.0.1:4010
 *   TOKEN      EXCHANGE_GATEWAY_TOKEN (required)
 *   MARKET     default SOL-USD
 *   DURATION   default 30s
 *   VUS        steady VUs (default 8)
 *   SLEEP      seconds between iterations (default 0.01; use 0 for max throughput)
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.1.0/index.js";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:4010").replace(/\/$/, "");
const TOKEN = __ENV.TOKEN || "";
const MARKET = __ENV.MARKET || "SOL-USD";
const DURATION = __ENV.DURATION || "30s";
const VUS = Number(__ENV.VUS || 8);

const placeTrend = new Trend("place_ms", true);
const cancelTrend = new Trend("cancel_ms", true);
const errorRate = new Rate("bench_errors");
const places = new Counter("places");
const cancels = new Counter("cancels");
const rejects = new Counter("rejects");

if (!TOKEN) {
  throw new Error("TOKEN (EXCHANGE_GATEWAY_TOKEN) is required");
}

const headers = {
  "content-type": "application/json",
  "x-gateway-token": TOKEN,
};

export const options = {
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
  vus: VUS,
  duration: DURATION,
  thresholds: {
    bench_errors: [{ threshold: "rate<0.01", abortOnFail: true }],
    http_req_failed: [{ threshold: "rate<0.02", abortOnFail: true }],
    place_ms: ["p(99)<500"],
  },
};

function credit(userId, asset, amount) {
  const res = http.post(
    `${BASE_URL}/v1/markets/${MARKET}/credit`,
    JSON.stringify({
      userId,
      asset,
      amount,
      commandId: `bench-credit-${userId}-${asset}-${Date.now()}`,
    }),
    { headers, tags: { name: "credit" } },
  );
  if (res.status !== 200) {
    console.error(
      `credit ${userId} ${asset} -> HTTP ${res.status}: ${String(res.body).slice(0, 300)}`,
    );
    return false;
  }
  return true;
}

export function setup() {
  const health = http.get(`${BASE_URL}/health/live`);
  if (health.status !== 200) {
    throw new Error(`exchange not live: HTTP ${health.status}`);
  }

  // Far-from-market resting quotes: buy @ 1, sell @ 999999 — avoid accidental matches.
  const buyers = [];
  const sellers = [];
  for (let i = 0; i < 40; i++) {
    const b = `bench-buyer-${i}`;
    const s = `bench-seller-${i}`;
    buyers.push(b);
    sellers.push(s);
    if (!credit(b, "USD", 5_000_000)) {
      throw new Error(`credit failed for ${b}`);
    }
    if (!credit(s, "SOL", 100_000)) {
      throw new Error(`credit failed for ${s}`);
    }
  }
  return { buyers, sellers, startedAt: Date.now() };
}

export default function (data) {
  const vu = __VU;
  const iter = __ITER;
  const asBuyer = iter % 2 === 0;
  const userId = asBuyer
    ? data.buyers[(vu - 1) % data.buyers.length]
    : data.sellers[(vu - 1) % data.sellers.length];
  const side = asBuyer ? "BUY" : "SELL";
  const price = asBuyer ? 1 : 999999;
  const orderId = `bench-${vu}-${iter}-${Date.now()}`;

  const placeBody = JSON.stringify({
    orderId,
    userId,
    side,
    type: "LIMIT",
    timeInForce: "GTC",
    price,
    quantity: 1,
  });

  const t0 = Date.now();
  const placeRes = http.post(
    `${BASE_URL}/v1/markets/${MARKET}/orders`,
    placeBody,
    { headers, tags: { name: "place" } },
  );
  placeTrend.add(Date.now() - t0);

  const placed =
    placeRes.status === 200 &&
    (() => {
      try {
        return JSON.parse(placeRes.body).accepted === true;
      } catch {
        return false;
      }
    })();

  const placeOk = check(placeRes, {
    "place 200": (r) => r.status === 200,
    "place accepted": () => placed,
  });
  if (!placeOk || !placed) {
    errorRate.add(1);
    rejects.add(1);
    sleep(0.05);
    return;
  }
  places.add(1);
  errorRate.add(0);

  const t1 = Date.now();
  const cancelRes = http.del(
    `${BASE_URL}/v1/markets/${MARKET}/orders/${orderId}`,
    null,
    { headers, tags: { name: "cancel" } },
  );
  cancelTrend.add(Date.now() - t1);

  const cancelOk = check(cancelRes, {
    "cancel 200": (r) => r.status === 200,
  });
  if (!cancelOk) {
    errorRate.add(1);
  } else {
    cancels.add(1);
    errorRate.add(0);
  }

  const pause = Number(__ENV.SLEEP || 0.01);
  if (pause > 0) sleep(pause);
}

export function handleSummary(data) {
  const place = data.metrics.place_ms;
  const cancel = data.metrics.cancel_ms;
  const placeCount = data.metrics.places?.values?.count || 0;
  const cancelCount = data.metrics.cancels?.values?.count || 0;
  const durationMs =
    (data.state?.testRunDurationMs ||
      (data.state?.testRunEnd || 0) - (data.state?.testRunStart || 0)) || 1;
  const durationSec = durationMs / 1000;

  const summary = {
    tool: "k6",
    k6Version: "0.57.0",
    target: BASE_URL,
    market: MARKET,
    durationSec: Number(durationSec.toFixed(2)),
    throughput: {
      placePerSec: Number((placeCount / durationSec).toFixed(1)),
      cancelPerSec: Number((cancelCount / durationSec).toFixed(1)),
      places: placeCount,
      cancels: cancelCount,
    },
    latency_place_ms: place
      ? {
          p50: Number(
            (place.values.med ?? place.values["p(50)"] ?? 0).toFixed(2),
          ),
          p95: Number((place.values["p(95)"] ?? 0).toFixed(2)),
          p99: Number((place.values["p(99)"] ?? 0).toFixed(2)),
          avg: Number((place.values.avg ?? 0).toFixed(2)),
          max: Number((place.values.max ?? 0).toFixed(2)),
        }
      : null,
    latency_cancel_ms: cancel
      ? {
          p50: Number(
            (cancel.values.med ?? cancel.values["p(50)"] ?? 0).toFixed(2),
          ),
          p95: Number((cancel.values["p(95)"] ?? 0).toFixed(2)),
          p99: Number((cancel.values["p(99)"] ?? 0).toFixed(2)),
          avg: Number((cancel.values.avg ?? 0).toFixed(2)),
          max: Number((cancel.values.max ?? 0).toFixed(2)),
        }
      : null,
    errors: {
      rate: data.metrics.bench_errors?.values?.rate || 0,
      httpFailed: data.metrics.http_req_failed?.values?.rate || 0,
    },
  };

  return {
    stdout: textSummary(data, { indent: " ", enableColors: true }),
    "scripts/bench/k6-summary.json": JSON.stringify(summary, null, 2),
  };
}
