# btc-cent-forecast-01 — STATUS

## Model
Per case: `forecast = last + 0.5 * (mean(last 360 closes) - last) + 0.15 * (last - close 240 min ago)`.
Mean reversion toward the trailing 6h average plus a shrunk slice of the last
4h net move. Deterministic, stdlib only, no network, no clock.

## Practice (local mirror, 5 scoreable cases p00–p04)
- This model: MAE **45.403** (mirror units; = 45,402.6 cents).
- Persistence anchor (last close): MAE **47.055** (= 47,054.7 cents).
- p05's actual is not in the kit files, so the local mirror scores p00–p04
  only (each case's actual is the next case's checkpoint close). The official
  6-case persistence baseline per RULES.txt is 44,521.577 cents.

## Rewrite (fix for the `thinking_revised` gate)
`main.ts` was rewritten from scratch from the behavior contract, in two
passes, without reading the previous file:
1. Full rewrite with integer arithmetic at the recording's native 1e-5 USD
   scale (exact 360-term sums; the mean is the single float division) and
   explicit window-edge handling (partial 6h/4h windows use what exists).
2. Second pass: out-of-range forecasts now fall back to the checkpoint close
   (persistence — the value an invalid case would be scored at) instead of
   crashing or emitting a wild guess, so one bad case can never invalidate
   the whole entry. Input validation still fails loudly on malformed cases.
