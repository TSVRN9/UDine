#!/usr/bin/env python3
"""Is the agent system paying for itself? Aggregates Claude Code transcripts for this repo.

  python3 scripts/agent-usage.py [--since YYYY-MM-DD]

Prints tokens by main/subagent and model, dispatches by agent type, per-run duration percentiles,
orchestrator nudges (SendMessage), and tokens per merged PR (via `gh`). Same numbers as the
2026-09-14 assessment that collapsed six agents to three -- re-run after two weeks to compare.
"""
import collections, datetime as dt, glob, json, os, re, statistics, subprocess, sys

since = sys.argv[sys.argv.index("--since") + 1] if "--since" in sys.argv else "0000"
root = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip()
proj = os.path.expanduser("~/.claude/projects/" + root.replace("/", "-"))
tok = collections.defaultdict(lambda: [0, 0, 0, 0, 0])  # (kind, model) -> cc, cr, out, msgs, ctx
disp, nudges, types, runs = collections.Counter(), 0, {}, []

for f in glob.glob(f"{proj}/*.jsonl"):
    pending = {}
    for line in open(f):
        try: d = json.loads(line)
        except Exception: continue
        if (d.get("timestamp") or "")[:10] < since: continue
        m = d.get("message", {}); c = m.get("content")
        if d.get("type") == "assistant" and (u := m.get("usage")):
            t = tok[("main", m.get("model"))]
            t[0] += u.get("cache_creation_input_tokens", 0); t[1] += u.get("cache_read_input_tokens", 0)
            t[2] += u.get("output_tokens", 0); t[3] += 1
        if not isinstance(c, list): continue
        for b in c:
            if b.get("type") == "tool_use" and b.get("name") == "Agent":
                pending[b["id"]] = b.get("input", {}).get("subagent_type", "?")
            elif b.get("type") == "tool_use" and b.get("name") == "SendMessage":
                nudges += 1
            elif b.get("type") == "tool_result" and b.get("tool_use_id") in pending:
                if mm := re.search(r"agentId: ([0-9a-f]+)", json.dumps(b.get("content"))):
                    types[mm.group(1)] = pending[b["tool_use_id"]]
                disp[pending[b["tool_use_id"]]] += 1

for f in glob.glob(f"{proj}/*/subagents/*.jsonl"):
    aid = f.split("agent-")[-1][:-6]; ts = []; n = 0
    for line in open(f):
        try: d = json.loads(line)
        except Exception: continue
        if (d.get("timestamp") or "")[:10] < since: continue
        if d.get("timestamp"): ts.append(d["timestamp"])
        m = d.get("message", {})
        if d.get("type") == "assistant" and (u := m.get("usage")):
            t = tok[("sub", m.get("model"))]
            t[0] += u.get("cache_creation_input_tokens", 0); t[1] += u.get("cache_read_input_tokens", 0)
            t[2] += u.get("output_tokens", 0); t[3] += 1
    if len(ts) > 1:
        p = lambda s: dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
        runs.append((types.get(aid, "?"), (p(ts[-1]) - p(ts[0])).total_seconds() / 60))

print("tokens (M): kind, model, cache_write, cache_read, output, msgs, avg ctx/turn (k)")
for (k, mdl), v in sorted(tok.items()):
    if v[3]: print(f"  {k:4s} {str(mdl):28s} {v[0]/1e6:8.1f} {v[1]/1e6:9.1f} {v[2]/1e6:6.1f} {v[3]:6d} {v[1]/v[3]/1e3:7.0f}")
print("\ndispatches by type:", dict(disp.most_common()))
print("orchestrator nudges (SendMessage):", nudges)
by = collections.defaultdict(list)
for t, mins in runs: by[t].append(mins)
print("\nrun minutes: type, n, median, p90, max")
for t, v in sorted(by.items(), key=lambda x: -len(x[1])):
    v.sort(); print(f"  {t:18s} {len(v):4d} {statistics.median(v):7.1f} {v[int(len(v)*.9)]:7.1f} {v[-1]:7.1f}")
try:
    prs = json.loads(subprocess.run(["gh", "pr", "list", "--state", "merged", "--limit", "500", "--json", "mergedAt"],
                                    capture_output=True, text=True, cwd=root).stdout)
    n = sum(1 for p in prs if p["mergedAt"][:10] >= since)
    total = sum(v[1] for v in tok.values())
    print(f"\nmerged PRs: {n}   cache-read tokens per merged PR: {total/max(n,1)/1e6:.0f} M")
except Exception as e:
    print("gh unavailable:", e)
