"""Fixed, read-only export. Run inside the existing production container; no model loop."""
import sys, json, pathlib, re
import hermes_yaml as yaml
cfg=yaml.safe_load(pathlib.Path('/opt/data/profiles/trading/config.yaml').read_text())
env=cfg['mcp_servers']['trading_results']['env']
# Follow only the already-approved fixed read adapter, not arbitrary configured commands.
if env.get('PYTHONPATH')!='/workspace/trading-runtime/0.3.1': raise RuntimeError('runtime_changed')
path=env.get('PMPAPER_DB','')
if not re.fullmatch(r'/workspace/trading-runs/[A-Za-z0-9_-]+/paper.db',path):raise RuntimeError('ledger_path_changed')
import os
os.environ['PMPAPER_DB']=path
sys.path.insert(0,env['PYTHONPATH'])
from pmpaper import mcp_readonly as results
# All source reads share one SQLite read transaction from the existing mode=ro adapter.
with results._db() as db:
 db.execute('BEGIN')
 r=results.report.build(db,results.utcnow())
 position_rows=[dict(x) for x in db.execute("SELECT p.strategy,p.title,p.stake,p.entry_price,p.mark_price,p.opened_at,v.state AS valuation_state FROM positions p LEFT JOIN valuations v ON v.position_id=p.id WHERE p.status='open' ORDER BY p.id DESC LIMIT 50")]

if r.get('run_id')!='pm-video-20261027T161450Z':raise RuntimeError('run_window_requires_review')
if r.get('paper_only') is not True or r.get('execution_mode')!='paper':raise RuntimeError('paper_boundary_changed')
num=lambda x: x if isinstance(x,(float,int)) and not isinstance(x,bool) and abs(x)<1e15 else None
strategies=[]
for name,s in r.get('strategies',{}).items():
 strategies.append(dict(name=str(name)[:60],ruleVersions=[str(v)[:120] for v in s.get('rule_versions',[])],openPositions=s['open_positions'],closedPositions=s['closed_positions'],exposure=num(s.get('exposure')),staked=num(s.get('staked')),realized=num(s.get('realized')),unrealized=num(s.get('unrealized')),unavailablePositions=s['unavailable_positions'],drawdownHasGaps=s['drawdown_has_valuation_gaps'],maxDrawdown=num(s.get('max_drawdown'))))
p=[]
for x in position_rows:
 p.append(dict(strategy=x['strategy'],title=str(x.get('title') or '')[:300],stake=num(x.get('stake')),entryPrice=num(x.get('entry_price')),markPrice=num(x.get('mark_price')) if x.get('valuation_state')=='available' else None,valuationState=x.get('valuation_state'),openedAt=x.get('opened_at')))
q=r['data_quality']; cycles=r['cycles_24h']
# Deliberately omit raw errors, private paths, wallet identities, prompts and source assumptions.
payload=dict(executionVersion=r['execution_version'],mode='paper',venue=r['venue'],account=r['account_label'],currency='USD',runMode=r['run_mode'],window=dict(start='2026-10-27T16:23:00Z',end='2026-10-30T16:23:00Z'),observationAsOf=q.get('observation_as_of'),collectionState=q['collection_state'],unavailablePositions=q['unavailable_positions'],cycles={k:cycles[k] for k in ('total','ok','degraded')},feeStatus='unresolved-report-contract; ledger figures are not accepted net performance',strategies=strategies,positions=p,positionsLimit=50)
print(json.dumps(dict(instanceId='sporekeeper',profileId='trading',kind='trader',runId=r['run_id'],observedAt=r['generated_at'],schemaVersion=1,payload=payload),allow_nan=False))
