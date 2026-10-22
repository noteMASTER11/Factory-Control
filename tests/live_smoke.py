"""Runs against the real local bridge + MCP client + HTTP API, not a fake server."""
import json, os, time, unittest, urllib.request, urllib.error, concurrent.futures
BASE=os.environ.get('FACTORIO_GATEWAY_URL','http://127.0.0.1:18741')
def get(path):
    with urllib.request.urlopen(BASE+path,timeout=10) as r:
        return r.status,json.load(r)
class GatewaySmoke(unittest.TestCase):
    def test_health_and_fixed_route(self):
        status,doc=get('/health')
        self.assertEqual(200,status)
        self.assertEqual('gateway',doc['service'])
        with self.assertRaises(urllib.error.HTTPError) as error:get('/api/v1/execute_lua')
        self.assertEqual(404,error.exception.code)
    def test_real_source_and_all_topics(self):
        _,doc=get('/api/v1/status')
        self.assertTrue(doc['connected'])
        self.assertEqual(os.environ.get('FACTORIO_SOURCE_KIND','validation_copy'),doc['source_kind'])
        for topic in ['status','production','machines','power','logistics','research','resources']:
            with self.subTest(topic=topic):
                _,env=get('/api/v1/telemetry/'+topic)
                self.assertEqual(1,env['payload']['schema_version'])
                self.assertEqual(topic,env['payload']['topic'])
                self.assertGreater(env['tick'],0)
                self.assertGreaterEqual(env['age_seconds'],0)
    def test_engine_errors_and_actual_counts(self):
        _,status=get('/api/v1/telemetry/status')
        self.assertFalse(status['payload']['data']['errors'])
        _,machines=get('/api/v1/telemetry/machines')
        self.assertGreater(len(machines['payload']['data']['groups']),0)
        _,production=get('/api/v1/telemetry/production')
        self.assertGreater(len(production['payload']['data']['rows']),0)
    def test_readers_only_use_cache(self):
        _,before=get('/api/v1/status')
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            replies=list(pool.map(lambda _:get('/api/v1/client/status')[0],range(48)))
        _,after=get('/api/v1/status')
        self.assertTrue(all(code==200 for code in replies))
        self.assertLess(after['mcp_calls']-before['mcp_calls'],15)
    def test_history_and_forecasts(self):
        _,history=get('/api/v1/history?topic=production&limit=5')
        self.assertGreater(len(history),0)
        _,forecast=get('/api/v1/forecasts')
        self.assertIn('rows',forecast)
        self.assertIn('scope',forecast)
    def test_nameplate_capacity_is_distinct_from_actual_generation(self):
        _,power=get('/api/v1/power')
        self.assertIn('nameplate_generators',power['payload']['data'])
        generators=power['payload']['data']['nameplate_generators']
        self.assertGreater(len(generators),0)
        self.assertTrue(all(x['theoretical_max_watts']>=0 for x in generators))
        self.assertIn('theoretical',power['payload']['data']['capacity_kind'])
    def test_source_is_associated_with_its_actual_windows_process(self):
        _,status=get('/api/v1/status')
        self.assertIsInstance(status.get('source_process_id'),int)
        _,sessions=get('/api/v1/sessions')
        matches=[p for p in sessions['processes'] if p['pid']==status['source_process_id']]
        self.assertEqual(1,len(matches))
        self.assertTrue(matches[0]['telemetry_associated'])
if __name__=='__main__':unittest.main(verbosity=2)
