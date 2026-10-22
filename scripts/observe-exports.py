"""Observe file metadata only; never parse heavy exports or query Factorio."""
import json,sys,time,pathlib
root=pathlib.Path('D:/ChatGPT/Projects/FactorioMonitor/Data/LiveGame/script-output/factory-telemetry')
duration=float(sys.argv[1]);destination=pathlib.Path(sys.argv[2])
seen={};end=time.perf_counter()+duration
with destination.open('w',encoding='utf-8') as output:
    while time.perf_counter()<end:
        for topic in ('status','production','machines','logistics','power','research','resources'):
            try:
                stat=(root/(topic+'.json')).stat()
                current=(stat.st_mtime_ns,stat.st_size)
                if seen.get(topic)!=current:
                    output.write(json.dumps(dict(qpc_ms=time.perf_counter_ns()/1e6,topic=topic,mtime_ns=stat.st_mtime_ns,bytes=stat.st_size))+'\n')
                    output.flush();seen[topic]=current
            except FileNotFoundError:pass
        time.sleep(.01)
