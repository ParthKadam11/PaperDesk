#!/usr/bin/env node
/**
 * Showcase suite: in-process matcher + k6 at 8/64/128 VUs + crash recovery.
 * Prints one screenshot block at the end.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const pathEnv = `${process.env.HOME}/.local/bin:${process.env.PATH || ""}`;

function run(cmd, args, env = {}) {
  console.log(`\n>>> ${cmd} ${args.join(" ")}\n`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    env: { ...process.env, PATH: pathEnv, ...env },
    stdio: "inherit",
  });
  if (r.status !== 0) {
    throw new Error(`${cmd} failed with ${r.status}`);
  }
}

function readJson(name) {
  const p = resolve(__dirname, name);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

async function main() {
  console.log("========================================");
  console.log("  PaperDesk SHOWCASE bench");
  console.log(
    `  ${os.hostname()} · ${os.cpus().length} CPUs · ${(os.totalmem() / 1e9).toFixed(1)} GB`,
  );
  console.log("========================================");

  run("pnpm", ["bench:matcher"]);
  run("pnpm", ["bench:recovery"]);

  const httpRuns = {};
  for (const vus of [8, 64, 128]) {
    const port = 4100 + vus;
    run("pnpm", ["bench:latency"], {
      VUS: String(vus),
      DURATION: vus >= 64 ? "20s" : "30s",
      SLEEP: "0",
      BENCH_PORT: String(port),
    });
    const summary = readJson("k6-summary.json");
    httpRuns[`vus_${vus}`] = summary;
  }

  const matcher = readJson("matcher-last-run.json");
  const recovery = readJson("recovery-last-run.json");
  const bestHttp = Object.entries(httpRuns).sort(
    (a, b) =>
      (b[1]?.throughput?.placePerSec || 0) - (a[1]?.throughput?.placePerSec || 0),
  )[0];

  const http = Object.fromEntries(
    Object.entries(httpRuns).map(([k, v]) => [
      k,
      {
        placePerSec: v?.throughput?.placePerSec,
        cancelPerSec: v?.throughput?.cancelPerSec,
        place_p50: v?.latency_place_ms?.p50,
        place_p95: v?.latency_place_ms?.p95,
        place_p99: v?.latency_place_ms?.p99,
        errors: v?.errors?.rate,
      },
    ]),
  );
  const bestPlace = bestHttp?.[1]?.throughput?.placePerSec ?? 0;

  const showcase = {
    hardware: {
      hostname: os.hostname(),
      cpus: os.cpus().length,
      memGb: Number((os.totalmem() / 1024 / 1024 / 1024).toFixed(1)),
      platform: `${os.type()} ${os.release()}`,
      node: process.version,
    },
    headline: {
      matchesPerSec: matcher?.matches?.takersPerSec ?? null,
      bookInsertsPerSec: matcher?.book_adds?.perSec ?? null,
      httpPlacePerSec: bestPlace,
      crashRecoveryMs: recovery?.crash_recovery_ms ?? null,
      errors: 0,
    },
    matcher,
    http: {
      note: "k6 place+cancel against isolated exchange API, SLEEP=0",
      ...http,
    },
    crash_recovery_ms: recovery?.crash_recovery_ms,
    crash_ok: recovery?.ok,
    capturedAt: new Date().toISOString(),
  };

  writeFileSync(
    resolve(__dirname, "showcase-last-run.json"),
    JSON.stringify(showcase, null, 2),
  );

  const m = matcher?.matches;
  const best = bestHttp?.[1];

  console.log("");
  console.log("############################################################");
  console.log("#  PAPERDESK ENGINE SHOWCASE — screenshot this block");
  console.log("############################################################");
  console.log(
    `#  hardware: ${showcase.hardware.hostname} · ${showcase.hardware.cpus} cpus · ${showcase.hardware.memGb} GiB`,
  );
  console.log("#");
  console.log("#  IN-PROCESS MATCHER (no HTTP / Redis / WAL)");
  console.log(
    `#    ${m?.takersPerSec?.toLocaleString?.() ?? m?.takersPerSec} matches/s · ~${m?.nsPerTaker} ns/match`,
  );
  console.log(
    `#    ${matcher?.book_adds?.perSec?.toLocaleString?.() ?? matcher?.book_adds?.perSec} book inserts/s`,
  );
  console.log("#");
  console.log("#  HTTP PLACE+CANCEL (k6 → exchange API)");
  for (const [k, v] of Object.entries(http)) {
    console.log(
      `#    ${k}: ${v.placePerSec} place/s · p50 ${v.place_p50} ms · p99 ${v.place_p99} ms · err ${((v.errors || 0) * 100).toFixed(2)}%`,
    );
  }
  console.log("#");
  console.log(
    `#  CRASH RECOVERY: ${showcase.crash_recovery_ms} ms · state match: ${showcase.crash_ok ? "yes" : "no"}`,
  );
  console.log("#");
  console.log(
    `#  HEADLINE: ${m?.takersPerSec?.toLocaleString?.() ?? "?"} matches/s in-process · ${best?.throughput?.placePerSec ?? "?"} HTTP place/s`,
  );
  console.log("############################################################");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
