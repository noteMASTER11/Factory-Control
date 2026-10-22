"""Captures real endpoint results and existing engine benchmark logs under the project."""
import concurrent.futures, datetime, json, pathlib, re, statistics, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
DEST=ROOT/'docs'/'evidence'
DEST.mkdir(parents=True,exist_ok=True)
BASE='http://127.0.0.1:18741'
def get(path):
    with urllib.request.urlopen(BASE+path,timeout=10) as r:return json.load(r)
status=get('/api/v1/status')
topics={t:get('/api/v1/telemetry/'+t) for t in ['status','production','machines','power','logistics','research','resources']}
def arr(value):return value if isinstance(value,list) else []
machines=arr(topics['machines']['payload']['data']['groups'])
power=topics['power']['payload']['data']
production=arr(topics['production']['payload']['data']['rows'])
logistics=topics['logistics']['payload']['data']
before=get('/api/v1/status')['mcp_calls']
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:list(pool.map(lambda _:get('/api/v1/overview'),range(48)))
after=get('/api/v1/status')['mcp_calls']
summary={
 'captured_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'source_kind':status['source_kind'],'source_process_id':status['source_process_id'],
 'session_id':status['session_id'],'connected':status['connected'],
 'coverage':topics['status']['payload']['coverage'],
 'lua_errors':topics['status']['payload']['data']['errors'],
 'topics':{k:{'tick':v['tick'],'age_seconds':v['age_seconds'],'stale':v['stale']} for k,v in topics.items()},
 'counts':{
   'assemblers':sum(x['count'] for x in machines if x['type']=='assembling-machine'),
   'furnaces':sum(x['count'] for x in machines if x['type']=='furnace'),
   'machine_status_groups':len(machines),'production_rows':len(production),
   'electric_networks':len(arr(power.get('networks'))),
   'logistic_networks':len(arr(logistics.get('networks'))),'trains':len(arr(logistics.get('trains'))),
   'requesters':len(arr(logistics.get('requesters'))),
   'resource_chunk_rows':len(arr(topics['resources']['payload']['data'].get('chunks')))},
 'power_watts':{'production':sum(n['production_watts'] for n in arr(power.get('networks'))),'consumption':sum(n['consumption_watts'] for n in arr(power.get('networks')))},
 'active_production_examples':sorted(production,key=lambda x:x['consumed_per_minute'],reverse=True)[:10],
 'http_cache_test':{'concurrent_requests':48,'mcp_calls_before':before,'mcp_calls_after':after,'mcp_delta':after-before},
 'sessions':get('/api/v1/sessions'),
}
with urllib.request.urlopen('http://127.0.0.1:18740/health',timeout=10) as r:bridge=json.load(r)
profile=pathlib.Path(bridge['directory'])/'profile.txt'
lines=profile.read_text(encoding='utf-8').splitlines()[-20:]
timings=[]
for line in lines:
    match=re.search(r'(?:Duration:|Длительность:)\s*([0-9.,]+)',line)
    if match:timings.append(float(match[1].replace(',','.')))
summary['live_collector_profile']={'source_path':str(profile),'method':'LuaProfiler mean over 300 live game ticks; includes script export call, not external gateway work','last_samples_ms':timings,'sample_mean_ms':statistics.mean(timings) if timings else None}
(DEST/'telemetry-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
benchmark={'method':'Five independent runs of 6000 updates on the same save and game version; includes initial discovery. Benchmark mode on this installation does not export helper files, so disk output was tested separately in live SP and MP. Existing primary game process may influence host timings.','ticks_per_run':6000,'runs_per_mode':5}
for mode in ['baseline','collector']:
    log=(ROOT/'Validation'/('benchmark-'+mode)/'stdout.log').read_text(encoding='utf-8')
    runs=[{'mean_ms':float(a),'min_ms':float(b),'max_ms':float(c)} for a,b,c in re.findall(r'avg:\s*([\d.]+) ms, min:\s*([\d.]+) ms, max:\s*([\d.]+) ms',log)]
    benchmark[mode]={'runs':runs,'mean_ms':statistics.mean(x['mean_ms'] for x in runs),'max_observed_ms':max(x['max_ms'] for x in runs)}
benchmark['increment_mean_ms']=benchmark['collector']['mean_ms']-benchmark['baseline']['mean_ms']
benchmark['relative_increment_percent']=100*benchmark['increment_mean_ms']/benchmark['baseline']['mean_ms']
benchmark['increment_of_60ups_tick_budget_percent']=100*benchmark['increment_mean_ms']/(1000/60)
(DEST/'benchmark.json').write_text(json.dumps(benchmark,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'counts':summary['counts'],'coverage':summary['coverage'],'lua_errors':summary['lua_errors'],'http_cache_test':summary['http_cache_test'],'benchmark':benchmark,'live_profile_mean_ms':summary['live_collector_profile']['sample_mean_ms']},ensure_ascii=False,indent=2))
