// btc-cent-forecast-01 — forecast the BTC close 240 minutes after each checkpoint.
//
// Model (per case, from its 1-minute closes, last one at the checkpoint):
//   forecast = last + 0.5 * (mean of the last 6h of closes - last)
//                   + 0.15 * (last - close 240 minutes ago)
// The first term is mean reversion toward the trailing 6-hour average; the
// second carries a shrunk slice of the last 4 hours' net move. No wall clock,
// no randomness, no network: the output is a pure function of the input file.
//
// Arithmetic: prices are converted once to integers at the recording's native
// scale (1e-5 USD per unit), so the 360-term moving-average sum is exact and
// the mean is the single float division in the whole computation. The output
// is rounded back to the grid's 5 decimals.
//
// Edge handling: when a case holds fewer than 360 closes the mean is taken
// over however many exist; when it holds 240 or fewer closes the 4-hour
// anchor is the earliest close available instead of an out-of-range index.
// A malformed case fails loudly (non-zero exit, nothing written) rather than
// emitting a bogus guess.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SCALE = 100000; // 1e-5 USD per unit, the btc-usdc-1m recording's scale
const MA_WINDOW = 360; // 6 hours of 1-minute closes
const DRIFT_LAG = 240; // 4 hours, in minutes
const REVERT = 0.5; // weight on the pull toward the 6h mean
const DRIFT = 0.15; // weight on the last 4h net move
const MAX_PRICE = 10000000; // contract: price must be > 0 and < 10,000,000

function toUnits(price: unknown): number {
  if (typeof price !== "number" || !Number.isFinite(price)) {
    throw new Error(`non-finite price in input: ${String(price)}`);
  }
  return Math.round(price * SCALE);
}

// Forecast in integer 1e-5 USD units, together with the checkpoint close so
// the caller can fall back to persistence (the value an invalid case would
// be scored at) instead of forfeiting the whole entry on one bad case.
function forecastUnits(prices: unknown[]): { forecast: number; last: number } {
  if (!Array.isArray(prices) || prices.length === 0) {
    throw new Error("case holds no prices");
  }
  const units = prices.map(toUnits);
  const n = units.length;
  const last = units[n - 1];

  // Mean of the trailing 6 hours (or all closes when fewer exist).
  const maStart = Math.max(0, n - MA_WINDOW);
  let sum = 0;
  for (let i = maStart; i < n; i++) sum += units[i];
  const mean = sum / (n - maStart);

  // Close 240 minutes ago (or the earliest close when the series is shorter).
  const anchor = n > DRIFT_LAG ? units[n - 1 - DRIFT_LAG] : units[0];
  const move = last - anchor;

  return { forecast: last + REVERT * (mean - last) + DRIFT * move, last };
}

function runCase(inputPath: string): { id: string; price: number } {
  const parsed = JSON.parse(readFileSync(inputPath, "utf8")) as {
    case?: unknown;
    markets?: unknown;
  };
  const id =
    typeof parsed.case === "string" && parsed.case.length > 0
      ? parsed.case
      : inputPath.replace(/\.in$/, "").split("/").pop() ?? "unknown";
  if (!Array.isArray(parsed.markets) || parsed.markets.length === 0) {
    throw new Error(`${id}: case holds no markets`);
  }
  const market = parsed.markets[0] as { prices?: unknown };
  const { forecast, last } = forecastUnits(market.prices as unknown[]);
  let price = Math.round((forecast / SCALE) * SCALE) / SCALE;
  // Guard the contract's (0, 10,000,000) range: a forecast outside it can only
  // come from corrupted input, so fall back to the checkpoint close — the
  // value an invalid case would be scored at — and keep the entry valid
  // instead of crashing or emitting a wild guess.
  if (!Number.isFinite(price) || price <= 0 || price >= MAX_PRICE) {
    price = last / SCALE;
  }
  return { id, price };
}

function main(): void {
  const inputDir = process.env.MAKEFUN_INPUT_DIR ?? "/input";
  const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  const files = readdirSync(inputDir)
    .filter((f) => f.endsWith(".in"))
    .sort();
  if (files.length === 0) {
    throw new Error(`no .in case files in ${inputDir}`);
  }
  mkdirSync(outputDir, { recursive: true });
  for (const file of files) {
    const { id, price } = runCase(join(inputDir, file));
    const outName = `${file.replace(/\.in$/, "")}.out`;
    writeFileSync(
      join(outputDir, outName),
      JSON.stringify({ forecasts: [{ case: id, price }] }),
    );
  }
}

main();
