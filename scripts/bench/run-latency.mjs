#!/usr/bin/env node
/**
 * Spawn a clean isolated exchange, run k6 place/cancel bench, write last-run.json.
 *
 *   pnpm bench:latency
 *   VUS=128 DURATION=20s SLEEP=0 pnpm bench:latency
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { startBenchEngine } from "./spawn-engine.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const k6Path = (() => {
    const which = spawnSync("bash", ["-lc", "command -v k6"], {
      encoding: "utf8",
    }).stdout.trim();
    if (which) return which;
    const local = `${process.env.HOME}/.local/bin/k6`;
    return existsSync(local) ? local : null;
  })();

  if (!k6Path) {
    console.error(
      "k6 not found. Install from https://k6.io/docs/get-started/installation/",
    );
    process.exit(1);
  }

  mkdirSync(__dirname, { recursive: true });

  const duration = process.env.DURATION || "30s";
  const vus = process.env.VUS || "8";

  const engine = await startBenchEngine({
    port: Number(process.env.BENCH_PORT || 4019),
  });
  console.log(`bench engine ready at ${engine.baseUrl}`);

  try {
    console.log(`running k6 (steady ${vus} VUs / ${duration})…`);
    const run = spawnSync(
      k6Path,
      ["run", "--no-usage-report", resolve(__dirname, "orders.js")],
      {
        cwd: resolve(__dirname, "../.."),
        env: {
          ...process.env,
          PATH: `${process.env.HOME}/.local/bin:${process.env.PATH || ""}`,
          BASE_URL: engine.baseUrl,
          TOKEN: engine.token,
          MARKET: "SOL-USD",
          DURATION: duration,
          VUS: vus,
          SLEEP: process.env.SLEEP ?? "0.01",
          K6_WEB_DASHBOARD: "false",
        },
        stdio: "inherit",
      },
    );

    if (run.status !== 0) {
      process.exitCode = run.status || 1;
      return;
    }

    const k6SummaryPath = resolve(__dirname, "k6-summary.json");
    if (!existsSync(k6SummaryPath)) {
      console.error("k6-summary.json missing");
      process.exitCode = 1;
      return;
    }

    const k6Summary = JSON.parse(readFileSync(k6SummaryPath, "utf8"));
    const recoveryPath = resolve(__dirname, "recovery-last-run.json");
    const recovery = existsSync(recoveryPath)
      ? JSON.parse(readFileSync(recoveryPath, "utf8"))
      : null;

    const report = {
      hardware: {
        hostname: os.hostname(),
        cpus: os.cpus().length,
        memGb: Number((os.totalmem() / 1024 / 1024 / 1024).toFixed(1)),
        platform: `${os.type()} ${os.release()}`,
      },
      note: "Isolated exchange on this VPS with a clean data dir (production snapshots are ~500MB and skew results).",
      capturedAt: new Date().toISOString(),
      ...k6Summary,
      crash_recovery: recovery
        ? {
            crash_recovery_ms: recovery.crash_recovery_ms,
            book_balances_orders_match: recovery.ok,
          }
        : null,
    };

    const out = resolve(__dirname, "last-run.json");
    writeFileSync(out, JSON.stringify(report, null, 2));

    console.log("\n=== showable numbers ===");
    console.log(
      `hardware: ${report.hardware.hostname} · ${report.hardware.cpus} cpus · ${report.hardware.memGb} GiB`,
    );
    console.log(
      `throughput: ${report.throughput.placePerSec} place/s, ${report.throughput.cancelPerSec} cancel/s`,
    );
    if (report.latency_place_ms) {
      const p = report.latency_place_ms;
      console.log(`latency_place_ms: p50=${p.p50} p95=${p.p95} p99=${p.p99}`);
    }
    if (report.latency_cancel_ms) {
      const c = report.latency_cancel_ms;
      console.log(`latency_cancel_ms: p50=${c.p50} p95=${c.p95} p99=${c.p99}`);
    }
    if (report.crash_recovery) {
      console.log(
        `crash_recovery_ms: ${report.crash_recovery.crash_recovery_ms} (match: ${report.crash_recovery.book_balances_orders_match ? "yes" : "no"})`,
      );
    }
    console.log(`wrote ${out}`);
  } finally {
    await engine.stop("SIGKILL");
    engine.cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
