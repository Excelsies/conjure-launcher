#!/usr/bin/env python3
"""Compare a shexli JSON report with tools/shexli-baseline.json (run by tools/ego-check.sh).

usage: shexli-compare.py <shexli report.json> <baseline.json>
exit 0 when there are no errors and every finding is accepted in the baseline, 1 otherwise.
"""
import json, sys
try:
    report = json.load(open(sys.argv[1]))
except (OSError, ValueError) as e:
    print(f'FAIL: shexli produced no report ({e})')
    sys.exit(1)
if not isinstance(report, dict) or not isinstance(report.get('findings'), list) or not isinstance(report.get('summary'), dict):
    print('FAIL: the shexli report has no findings list or summary; not trusting it as a clean result')
    sys.exit(1)
accepted = json.load(open(sys.argv[2]))['accepted']
bad = 0
for f in report.get('findings', []):
    files = sorted({e['path'].split('.zip:', 1)[-1] for e in f.get('evidence', [])})
    match = next((a for a in accepted if a['rule_id'] == f['rule_id'] and set(files) <= set(a['files'])), None)
    if f['severity'] == 'error':
        print(f"FAIL: shexli error {f['rule_id']}: {f['message']} ({', '.join(files)})")
        bad = 1
    elif match is None:
        print(f"FAIL: shexli {f['severity']} {f['rule_id']} is not in tools/shexli-baseline.json: {f['message']} ({', '.join(files)})")
        bad = 1
    else:
        print(f"ok - shexli {f['severity']} {f['rule_id']} accepted: {match['reason'][:90]}...")
if not bad:
    print(f"ok - shexli: {report.get('summary', {}).get('finding_count', 0)} findings, none new, no errors")
sys.exit(bad)
