"use client";

import { Button } from "@/components/ui/button";
import { GoogleIcon } from "@/components/ui/googleButton";
import { SiteHeader } from "@/components/SiteHeader";
import { useSession } from "next-auth/react";
import { signInWithGoogle } from "@/lib/google-sign-in";
import { useRouter } from "next/navigation";

const REPO = "https://github.com/ParthKadam11/PaperDesk";

const WRITING = [
  {
    href: "/guide",
    kicker: "Guide",
    title: "Getting around",
    body: "A first-visit walkthrough. Add practice money, place one order, and learn what the screens are showing.",
  },
  {
    href: "/system",
    kicker: "System",
    title: "How it works",
    body: "The path after Buy: one matching process, an outbox, a gateway, and a separate history writer.",
  },
] as const;

const ASKS = [
  { price: "122.00", size: "22", total: 114 },
  { price: "121.00", size: "22", total: 92 },
  { price: "120.00", size: "22", total: 70 },
  { price: "119.00", size: "16", total: 48 },
  { price: "118.50", size: "16", total: 32 },
] as const;

const BIDS = [
  { price: "117.00", size: "41", total: 41 },
  { price: "116.00", size: "33", total: 74 },
  { price: "115.00", size: "16", total: 90 },
  { price: "114.00", size: "16", total: 106 },
  { price: "113.00", size: "16", total: 122 },
] as const;

const PRINTS = [
  { side: "buy", qty: "2.00", price: "118.00" },
  { side: "sell", qty: "1.00", price: "118.00" },
  { side: "buy", qty: "4.00", price: "117.00" },
  { side: "sell", qty: "3.00", price: "119.00" },
  { side: "buy", qty: "1.00", price: "118.00" },
  { side: "sell", qty: "2.00", price: "118.50" },
] as const;

const MARKETS = [
  {
    name: "Spot",
    symbol: "SOL-USD",
    body: "Buy and sell against the ledger. A limit order rests on the book. A market order takes what is there. Size stays locked until it fills or you cancel.",
    rows: [
      ["Settlement", "Immediate"],
      ["Orders", "Limit · Market"],
      ["Collateral", "SOL · USD"],
    ],
  },
  {
    name: "Perps",
    symbol: "SOL-USD-PERP",
    body: "Long or short the same pair with margin. Mark, funding, and liquidation run in the same process as the spot book.",
    rows: [
      ["Exposure", "Long · Short"],
      ["Margin", "USD"],
      ["Risk", "Mark · Funding"],
    ],
  },
] as const;

const PATH = [
  {
    name: "Place",
    body: "You send the order. The OMS writes it before the engine is allowed to match it.",
  },
  {
    name: "Match",
    body: "One process owns the book, the balances, and the write-ahead log. Fills settle there.",
  },
  {
    name: "Stream",
    body: "The gateway pushes the book, trades, and positions. The desk does not poll them while the stream is up.",
  },
] as const;

export function Hero() {
  const { data: session } = useSession();
  const router = useRouter();
  const openDashboard = () => router.push("/dashboard");

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <SiteHeader />

      <div id="top" className="mx-auto w-full max-w-[1200px] px-5 pb-16 sm:px-8 sm:pb-20">
        <div className="grid items-end gap-8 border-t border-border pt-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16 lg:pt-14">
          <h1 className="max-w-[12ch] font-display text-5xl leading-[0.95] tracking-[-0.03em] text-balance sm:text-6xl lg:text-7xl">
            A matching engine you can trade against.
          </h1>
          <div>
            <p className="max-w-[40ch] text-[17px] leading-relaxed text-muted-foreground">
              Spot and perpetuals for SOL on one book. Sign in, credit SOL and
              USD, and place. The chart, the ladder, and the ticket are the
              product. No wallet. No real money.
            </p>
            <div className="mt-6">
              <AuthCta session={session} onDashboard={openDashboard} />
            </div>
          </div>
        </div>

        <figure className="mt-12 sm:mt-14">
          <div className="overflow-hidden border border-border bg-foreground">
            <video
              src="/PaperDesk.mp4"
              poster="/product-shot.png"
              autoPlay
              muted
              loop
              playsInline
              controls
              preload="metadata"
              className="block h-auto w-full"
              aria-label="PaperDesk spot desk: SOL-USD chart, order book, and order ticket"
            />
          </div>
          <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-[13px] text-muted-foreground">
            <span>Spot desk · chart, book, and ticket</span>
            <span className="font-mono tabular-nums">SOL-USD</span>
          </figcaption>
        </figure>
      </div>

      <section id="desk" className="border-t border-border">
        <div className="mx-auto w-full max-w-[1200px] px-5 py-16 sm:px-8 sm:py-20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="max-w-[16ch] font-display text-4xl leading-[1.05] tracking-[-0.03em] sm:text-5xl">
              Book, tape, and balances in one frame.
            </h2>
            <p className="max-w-sm text-[15px] leading-relaxed text-muted-foreground">
              A sample of the ladder you trade against. Bids rest under the
              mid. Asks sit above it. Fills print beside the size you have left.
            </p>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <OrderBook />
            <div className="flex flex-col gap-4">
              <div className="border border-border">
                <div className="flex items-center justify-between border-b border-border px-4 py-3 text-[13px] text-muted-foreground">
                  <span>Recent prints</span>
                  <span className="font-mono text-[12px] tabular-nums">SOL</span>
                </div>
                <ul className="divide-y divide-border font-mono text-[13px] tabular-nums">
                  {PRINTS.map((row) => (
                    <li
                      key={`${row.side}-${row.price}-${row.qty}`}
                      className="grid grid-cols-3 px-4 py-2.5"
                    >
                      <span
                        className={
                          row.side === "buy"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }
                      >
                        {row.side === "buy" ? "Buy" : "Sell"}
                      </span>
                      <span className="text-right text-muted-foreground">{row.qty}</span>
                      <span className="text-right">{row.price}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Balance label="USD available" value="718.00" />
                <Balance label="SOL available" value="112.00" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="markets" className="border-t border-border">
        <div className="mx-auto w-full max-w-[1200px] px-5 py-16 sm:px-8 sm:py-24">
          <h2 className="max-w-[14ch] font-display text-4xl leading-[1.05] tracking-[-0.03em] sm:text-5xl">
            Two markets. One engine.
          </h2>
          <div className="mt-12 grid gap-12 lg:grid-cols-2 lg:gap-16">
            {MARKETS.map((market) => (
              <article key={market.symbol}>
                <p className="text-[13px] text-muted-foreground">
                  {market.name}
                </p>
                <h3 className="mt-2 font-display text-4xl tracking-[-0.03em]">
                  {market.symbol}
                </h3>
                <p className="mt-4 max-w-md text-[16px] leading-relaxed text-muted-foreground">
                  {market.body}
                </p>
                <dl className="mt-8 border-t border-border">
                  {market.rows.map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-baseline justify-between gap-6 border-b border-border py-3 text-[14px]"
                    >
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-mono tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="path" className="border-t border-border">
        <div className="mx-auto w-full max-w-[1200px] px-5 py-16 sm:px-8 sm:py-24">
          <h2 className="max-w-[16ch] font-display text-4xl leading-[1.05] tracking-[-0.03em] sm:text-5xl">
            What happens after you click buy.
          </h2>
          <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
            {PATH.map((step, index) => (
              <li key={step.name} className="border-t border-foreground pt-5">
                <p className="font-display text-4xl tracking-[-0.03em]">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-4 text-lg font-medium">{step.name}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>

          <div className="mt-16 flex flex-col items-start gap-5 border-t border-border pt-10 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-md text-[16px] leading-relaxed text-muted-foreground">
              Google sign-in. Paper SOL and USD on the ledger. Then the book.
            </p>
            <AuthCta session={session} onDashboard={openDashboard} />
          </div>
        </div>
      </section>

      <section id="writing" className="border-t border-border">
        <div className="mx-auto w-full max-w-[1200px] px-5 py-16 sm:px-8 sm:py-24">
          <h2 className="max-w-[16ch] font-display text-4xl leading-[1.05] tracking-[-0.03em] sm:text-5xl">
            Read it before you sign in.
          </h2>
          <div className="mt-12 grid gap-10 md:grid-cols-2 md:gap-16">
            {WRITING.map((piece) => (
              <a key={piece.href} href={piece.href} className="group block">
                <p className="text-[13px] text-muted-foreground">{piece.kicker}</p>
                <h3 className="mt-2 font-display text-4xl tracking-[-0.03em] group-hover:underline group-hover:decoration-border group-hover:underline-offset-4">
                  {piece.title}
                </h3>
                <p className="mt-4 max-w-md text-[16px] leading-relaxed text-muted-foreground">
                  {piece.body}
                </p>
                <p className="mt-5 text-[14px]">Read</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border text-muted-foreground">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-5 py-8 sm:flex-row sm:items-end sm:justify-between sm:px-8">
          <p className="max-w-lg text-[13px] leading-relaxed">
            Paper balances only. Fills, margin, and PnL are simulated. This is
            not a brokerage, and no real funds are held.
          </p>
          <a
            href={REPO}
            target="_blank"
            rel="noreferrer"
            className="text-[13px] text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
          >
            github.com/ParthKadam11/CEX
          </a>
        </div>
      </footer>
    </main>
  );
}

function OrderBook() {
  const maxTotal = 122;

  return (
    <div className="border border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-3 text-[13px]">
        <span>Order book</span>
        <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
          SOL-USD
        </span>
      </div>
      <div className="grid grid-cols-3 px-4 py-2 font-mono text-[11px] text-muted-foreground">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>
      <div className="font-mono text-[13px] tabular-nums">
        {ASKS.map((row) => (
          <DepthRow key={row.price} {...row} maxTotal={maxTotal} tone="ask" />
        ))}
        <div className="flex items-baseline gap-3 border-y border-border bg-muted px-4 py-3">
          <span className="text-2xl leading-none">118.00</span>
          <span className="text-[12px] text-muted-foreground">mid</span>
          <span className="ml-auto text-[12px] text-muted-foreground">117 / 118</span>
        </div>
        {BIDS.map((row) => (
          <DepthRow key={row.price} {...row} maxTotal={maxTotal} tone="bid" />
        ))}
      </div>
    </div>
  );
}

function DepthRow({
  price,
  size,
  total,
  maxTotal,
  tone,
}: {
  price: string;
  size: string;
  total: number;
  maxTotal: number;
  tone: "bid" | "ask";
}) {
  const width = Math.min(100, (total / maxTotal) * 100);

  return (
    <div className="relative grid grid-cols-3 px-4 py-1.5">
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 right-0 ${
          tone === "bid" ? "bg-emerald-600/10 dark:bg-emerald-400/15" : "bg-red-600/10 dark:bg-red-400/15"
        }`}
        style={{ width: `${width}%` }}
      />
      <span
        className={`relative ${tone === "bid" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
      >
        {price}
      </span>
      <span className="relative text-right">{size}</span>
      <span className="relative text-right text-muted-foreground">{total}</span>
    </div>
  );
}

function Balance({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border px-4 py-4">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="mt-2 font-mono text-2xl tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

function AuthCta({
  session,
  onDashboard,
  compact = false,
}: {
  session: ReturnType<typeof useSession>["data"];
  onDashboard: () => void;
  compact?: boolean;
}) {
  const signedIn = Boolean(session?.user);
  const label = signedIn
    ? compact
      ? "Desk"
      : "Open the desk"
    : compact
      ? "Sign in"
      : "Continue with Google";

  return (
    <Button
      onClick={signedIn ? onDashboard : () => void signInWithGoogle("/dashboard")}
      className={
        compact
          ? "h-9 rounded-sm bg-foreground px-3 text-[13px] font-medium text-background hover:bg-foreground/90"
          : "h-10 rounded-sm bg-foreground px-4 text-[14px] font-medium text-background hover:bg-foreground/90 active:scale-[0.98]"
      }
    >
      {signedIn || compact ? null : <GoogleIcon />}
      {label}
    </Button>
  );
}
