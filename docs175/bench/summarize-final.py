import json,sys,statistics as st
O='load-final/'
def load(mode,v): return json.load(open(f'{O}{mode}.vus{v}.json'))['metrics']
def samples(mode,v):
    w=[json.loads(l) for l in open(f'{O}{mode}.windows.jsonl')]; w=[x for x in w if x['vus']==v][0]
    s=[json.loads(l) for l in open(f'{O}{mode}.samples.jsonl')]; s=[x for x in s if w['from']<=x['at']<=w['to']]
    return s
rows=[]
print("== overall http_req_duration / RPS / errors / resources ==")
print("mode   VUs   RPS    err%   p50    p95     p99    max   | nodeCPU% pgCPU% k6CPU% nodeRSS pgRSS pgConns(max) poolWait(max)")
for mode in ('before','idx','after'):
    for v in (10,50,100):
        m=load(mode,v); d=m['http_req_duration']; s=samples(mode,v)
        rps=m['http_reqs']['rate']; err=m['errors']['value']*100 if 'errors' in m else 0
        cpu=lambda k: st.mean([x[k] for x in s]) if s else 0
        print(f"{mode:6} {v:4} {rps:6.1f} {err:5.2f} {d['med']:6.1f} {d['p(95)']:7.1f} {d['p(99)']:7.1f} {d['max']:7.0f} | {cpu('nodeCpuPct'):6.0f} {cpu('pgCpuPct'):6.0f} {cpu('k6CpuPct'):6.0f} {max(x['nodeRssMB'] for x in s):6} {max(x['pgRssMB'] for x in s):6} {max(x['pgConns'] or 0 for x in s):5} {max(x['poolWaiting'] for x in s):5}")
print("\n== per endpoint p50/p95/p99 (ms) ==")
names=['list_customers','list_invoices','list_invoices_deep','list_invoices_nocount','list_invoices_cursor_deep','sync_pull','report_summary','list_payments','ledger','me','create_customer','create_payment']
for v in (10,50,100):
    print(f"-- {v} VUs   (p50/p95/p99 ms)  before | idx-only | idx+cache")
    for n in names:
        row=[]
        for mode in ('before','idx','after'):
            a=load(mode,v).get(f'lat_{n}')
            row.append(f"{a['med']:7.1f}/{a['p(95)']:7.1f}/{a['p(99)']:7.1f}" if a else "      -        ")
        if any(x.strip()!='-' for x in row): print(f"{n:25}", " | ".join(row))
