#!/usr/bin/env python3
# backtest.py — validation for the exports SARIMAX forecast (pipeline/forecast.py).
# -----------------------------------------------------------------------------
# Rolling-origin (walk-forward) backtest of a 3-month forecast of total
# Canada->US softwood exports, across several initial-training-window sizes, vs a
# seasonal-naive baseline. Prints MAPE by horizon, 80% interval coverage, and the
# marginal value of the exogenous regressors. This is a dev/validation tool — it
# is NOT run in the pipeline (forecast.py bakes in the winning order + reference
# numbers). Run it to re-check or tune the model:
#
#   pip install -r pipeline/requirements.txt
#   python pipeline/backtest.py
#
# Method notes:
#  - Target = log(total exports); exog = US permits + lumber PPI, LAGGED 3 months
#    (so a 3-step forecast only uses already-observed exog — no look-ahead) and
#    standardized.
#  - Expanding window: fit on data up to origin t, forecast t+1..t+3, slide t
#    forward one month, refit. Each forecast only sees data up to its own origin.
#  - Larger initial windows push the test period onto the most recent (2025-26)
#    declining regime, which is genuinely harder — hence higher error there.
# -----------------------------------------------------------------------------
import io, csv, json, urllib.request, warnings
from pathlib import Path
import numpy as np, pandas as pd
from statsmodels.tsa.statespace.sarimax import SARIMAX
warnings.filterwarnings('ignore')

d = json.loads((Path(__file__).resolve().parents[1] / 'data' / 'dataset.json').read_text(encoding='utf-8'))
reg = d['industry']['exportsByRegion']; regions = reg['regions']
exp  = {r['period']: sum(r[k] for k in regions) for r in reg['series']}
perm = {p['period']: p['total'] for p in d['industry']['housingPermits']['series']}

def fred(s):
    txt = urllib.request.urlopen(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={s}', timeout=30).read().decode()
    return {r[0][:7]: float(r[1]) for r in csv.reader(io.StringIO(txt)) if r and r[0][:4].isdigit() and r[1] not in ('', '.')}
ppi = fred('WPU081')

ts = lambda p: pd.Timestamp(p + '-01')
idx = pd.date_range('2019-09-01', ts(reg['series'][-1]['period']), freq='MS')
sf = lambda dct: pd.Series({ts(k): v for k, v in dct.items()}).reindex(idx)
df = pd.DataFrame({'exp': sf(exp), 'perm': sf(perm), 'ppi': sf(ppi)}, index=idx)
df[['perm', 'ppi']] = df[['perm', 'ppi']].ffill()
LAG = 3
df['perm_l'] = df['perm'].shift(LAG); df['ppi_l'] = df['ppi'].shift(LAG)
data = df.dropna(subset=['exp', 'perm_l', 'ppi_l']).copy(); data.index.freq = 'MS'
y = np.log(data['exp'])
Xs = ((data[['perm_l', 'ppi_l']] - data[['perm_l', 'ppi_l']].mean()) / data[['perm_l', 'ppi_l']].std())
print(f'usable sample: {len(data)} months  {data.index[0]:%Y-%m} -> {data.index[-1]:%Y-%m}')
mape = lambda a, p: float(np.mean(np.abs((np.asarray(a) - np.asarray(p)) / np.asarray(a))) * 100)
ORDER, SORDER, H = (0, 1, 1), (0, 1, 1, 12), 3

def backtest(init, use_exog=True):
    rec, cov = {1: [], 2: [], 3: []}, {1: [], 2: [], 3: []}
    for o in range(init, len(data) - 1):
        hm = min(H, len(data) - o)
        try:
            m = SARIMAX(y.iloc[:o], exog=(Xs.iloc[:o] if use_exog else None), order=ORDER,
                        seasonal_order=SORDER, enforce_stationarity=False, enforce_invertibility=False).fit(disp=False)
            fc = m.get_forecast(steps=hm, exog=(Xs.iloc[o:o + hm] if use_exog else None))
            mean = np.exp(fc.predicted_mean.values); ci = np.exp(fc.conf_int(alpha=0.2).values)
        except Exception:
            continue
        for h in range(hm):
            a = data['exp'].iloc[o + h]
            rec[h + 1].append((a, mean[h])); cov[h + 1].append(ci[h, 0] <= a <= ci[h, 1])
    return rec, cov

def naive(init):
    nv = {1: [], 2: [], 3: []}
    for o in range(init, len(data) - 1):
        for h in range(min(H, len(data) - o)):
            if o + h - 12 >= 0:
                nv[h + 1].append((data['exp'].iloc[o + h], data['exp'].iloc[o + h - 12]))
    return nv

print(f'\n=== ROLLING-ORIGIN BACKTEST — SARIMAX{ORDER}x{SORDER} + lagged exog ===')
print(f'{"init train":<12}{"test n":>8}{"h=1":>9}{"h=2":>9}{"h=3":>9}{"naive h=3":>12}{"  80% cov (1/2/3)":>20}')
for init in [48, 60, 65]:
    rec, cov = backtest(init); nv = naive(init)
    if not rec[3]:
        continue
    row = [mape(*zip(*rec[h])) for h in [1, 2, 3]]
    print(f'{str(init)+" mo":<12}{len(rec[3]):>8}' + ''.join(f'{v:>8.1f}%' for v in row)
          + f'{mape(*zip(*nv[3])):>10.1f}% ' + f'{" / ".join(f"{np.mean(cov[h])*100:.0f}%" for h in [1,2,3]):>18}')
    if init == 60:
        r0, _ = backtest(60, use_exog=False)
        print('  exog effect (60-mo):', ' '.join(
            f"h{h} {mape(*zip(*rec[h])):.1f}% vs {mape(*zip(*r0[h])):.1f}% no-exog" for h in [1, 2, 3]))
