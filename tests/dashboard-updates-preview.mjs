// Local in-memory UI fixture. No credentials or production writes.
// Start Next on 3004, then inspect this fixture on 3005.
import http from 'node:http';
import { parseResource, seoulDate } from '../src/lib/ops.ts';
import { calculateLeave } from '../src/lib/leave.ts';

const tasks = [];
let profile = { hire_date: '2026-08-03', prior_used: 1, prior_used_date: '2026-09-25' };
let entries = [];
let failTask = false;
let failLeave = false;
const requests = [];
http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1:3005').pathname;
  const json = (value, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(value));
  };
  let raw = ''; for await (const chunk of req) raw += chunk;
  if (path === '/__state') return json({ tasks, profile, entries, requests });
  if (path === '/__fail-task') { failTask = raw === 'true'; return json({ ok: true }); }
  if (path === '/__fail-leave') { failLeave = raw === 'true'; return json({ ok: true }); }
  if (path === '/api/session') return json({ configured: true, user: { email: 'qa@example.invalid' } });
  if (path === '/api/automation-results') return json({ ready: true, results: [] });
  if (path === '/api/workflow') return json({ ready: true, data: { inbox: [], contexts: [] } });
  if (path === '/api/phase2' && req.method === 'GET') return json({
    data: { leave: entries, content: [], inspiration: [], recurrence: [], exceptions: [] },
    versions: [], contentTasks: [], personalContent: true, calendarRecurrence: true, recurrenceArchive: true, truncated: [],
  });
  if (path === '/api/leave') {
    if (req.method === 'GET') return json({ profile, entries, asOf: seoulDate(), calculation: calculateLeave(profile, entries, seoulDate()) });
    const body = JSON.parse(raw); requests.push(body);
    if (failLeave) return json({ error: '연차 저장 실패 테스트' }, 409);
    if (body.action === 'profile') profile = body.value;
    else if (body.action === 'usage') entries.push({
      id: crypto.randomUUID(), kind: 'use', date: body.value.date,
      amount: -Number(body.value.amount), title: body.value.title || '연차', created_at: new Date().toISOString(),
    });
    return json({ ok: true });
  }
  if (path === '/api/ops') {
    if (req.method === 'GET') return json({
      taskProcessReady: true, taskClassification: true, timerGuardReady: true, taskTestClassification: true,
      data: { tasks, projects: [], schedules: [], deleted_schedules: [], work_sessions: [], session_intervals: [], session_events: [], task_notes: [] },
      serverNow: new Date().toISOString(), truncated: [],
    });
    const body = JSON.parse(raw); requests.push(body);
    if (body.resource === 'tasks') {
      if (failTask) return json({ error: '업무 저장 실패 테스트' }, 409);
      const row = { id: crypto.randomUUID(), ...parseResource('tasks', body.value), created_at: new Date().toISOString() };
      tasks.push(row); return json({ row }, 201);
    }
  }
  try {
    const upstream = await fetch(`http://127.0.0.1:3004${req.url}`, {
      method: req.method, headers: { 'Content-Type': req.headers['content-type'] || 'text/plain' },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : raw,
    });
    res.writeHead(upstream.status, Object.fromEntries([...upstream.headers].filter(([name]) => !['transfer-encoding', 'content-encoding', 'content-length'].includes(name))));
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch { json({ error: 'Start application on port 3004' }, 503); }
}).listen(3005, '127.0.0.1', () => console.log('Dashboard fixture http://127.0.0.1:3005'));
