"""Summarize PresentMon captures and correlate stalls with metadata-only export observations."""
import csv,json,math,pathlib,sys
source=pathlib.Path(sys.argv[1]);rows=list(csv.DictReader(source.open(encoding='utf-8-sig')))
frames=[r for r in rows if r.get('MsBetweenPresents') not in (None,'NA','')]
times=sorted(float(r['MsBetweenPresents']) for r in frames)
if not times:raise SystemExit('No frames captured')
events=[]
if len(sys.argv)>2 and pathlib.Path(sys.argv[2]).exists():
    events=[json.loads(line) for line in pathlib.Path(sys.argv[2]).read_text(encoding='utf-8').splitlines()]
stalls=[]
for row in frames:
    elapsed=float(row['MsBetweenPresents'])
    if elapsed<=100:continue
    stall={'duration_ms':elapsed}
    if row.get('CPUStartQPCTimeInMs') not in (None,'NA',''):
        start=float(row['CPUStartQPCTimeInMs']);stall['start_qpc_ms']=start
        stall['exports']=[e for e in events if start-50<=e['qpc_ms']<=start+elapsed+100]
    stalls.append(stall)
percentile=lambda p:times[min(len(times)-1,math.ceil(len(times)*p)-1)]
report={'source':str(source),'frames':len(times),'measured_seconds':sum(times)/1000,'p95_ms':percentile(.95),'p99_ms':percentile(.99),'p999_ms':percentile(.999),'max_ms':times[-1],'stalls_over_100ms':stalls}
print(json.dumps(report,ensure_ascii=False,indent=2))
