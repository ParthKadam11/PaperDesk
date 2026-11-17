/**
 * Start / stop an isolated exchange process for benches.
 * Uses a clean EXCHANGE_DATA_DIR so production ~500MB snapshots do not dominate.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, "../..");

export function makeToken() {
  return randomBytes(24).toString("base64url");
}

export async function waitHttpOk(url, timeoutMs = 60_000) {
  const start = Date.now();
  let lastErr;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return Date.now() - start;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    `timeout waiting for ${url}: ${lastErr instanceof Error ? lastErr.message : lastErr}`,
  );
}

/**
 * @param {{ port?: number, markets?: string, keepData?: boolean }} opts
 */
export async function startBenchEngine(opts = {}) {
  const port = opts.port ?? 4019;
  const dataDir =
    opts.dataDir ??
    resolve(`/tmp/cex-bench-${process.pid}-${Date.now()}`);
  const token = opts.token ?? makeToken();
  mkdirSync(dataDir, { recursive: true });

  const env = {
    ...process.env,
    NODE_ENV: "production",
    EXCHANGE_PORT: String(port),
    EXCHANGE_DATA_DIR: dataDir,
    EXCHANGE_ALLOW_EPHEMERAL_DATA: "true",
    EXCHANGE_MARKETS: opts.markets ?? "SOL-USD",
    EXCHANGE_GATEWAY_TOKEN: token,
    // Avoid loading the huge repo .env production paths for data.
  };

  const child = spawn(
    "pnpm",
    ["--filter", "@cex/exchange", "start"],
    {
      cwd: ROOT,
      env,
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

  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitHttpOk(`${baseUrl}/health/live`, 60_000);
  } catch (e) {
    child.kill("SIGKILL");
    throw new Error(`${e.message}\n--- engine logs ---\n${logs.slice(-4000)}`);
  }

  return {
    port,
    baseUrl,
    token,
    dataDir,
    child,
    logs: () => logs,
    async stop(_signal = "SIGTERM") {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {
          // gone
        }
      }
      try {
        spawnSync("fuser", ["-k", `${port}/tcp`], { stdio: "ignore" });
      } catch {
        // ignore
      }
      await new Promise((r) => setTimeout(r, 200));
    },
    cleanup() {
      if (!opts.keepData && existsSync(dataDir)) {
        rmSync(dataDir, { recursive: true, force: true });
      }
    },
  };
}
