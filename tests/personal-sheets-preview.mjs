// Local in-memory UI fixture. No credentials or user spreadsheet content.
// Start the application on port 3004, then inspect this fixture on port 3005.
import http from 'node:http';
const tables = {
  planning: { sheetTitle: '03_기획', columns: ['콘텐츠 ID', '테마', '핵심 인사이트', '상태'], rows: [['DEMO-01', '일상 기록', '한 장면에서 시작하는 기획', '선정'], ['DEMO-02', '취향 기록', '원문의 문장을 그대로 읽어요.', '아이디어']] },
  drafts: { sheetTitle: '04_원고', columns: ['콘텐츠 ID', '주제', '영상 구성', '캡션', '원고 상태'], rows: [['DEMO-01', '일상 기록', '첫 장면\n다음 장면\n마지막 장면', '첫 번째 문단\n\n두 번째 문단', '검수요청']] },
  performance: { sheetTitle: '06_발행성과', columns: ['콘텐츠 ID', '조회수', '좋아요', '댓글', '조회 대비 반응률', '발행 URL'], rows: [['DEMO-01', '456', '18', '0', '3.9%', 'https://example.com/post/1'], ['DEMO-02', '317', '20', '7', '8.5%', 'javascript:alert(1)']] },
};
let failSheets = false;
const requests = [];
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:3005');
  const path = url.pathname;
  const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  let raw = ''; for await (const chunk of req) raw += chunk;
  if (path === '/__state') return json({ requests });
  if (path === '/__fail-sheets') { failSheets = raw === 'true'; return json({ ok: true }); }
  if (path === '/api/session') return json({ configured: true, user: { email: 'qa@example.invalid' } });
  if (path === '/api/automation-results') return json({ ready: true, results: [] });
  if (path === '/api/workflow') return json({ ready: true, data: { inbox: [], contexts: [] } });
  if (path === '/api/ops') return json({
    taskProcessReady: true, taskClassification: true, timerGuardReady: true, taskTestClassification: true,
    data: { tasks: [], projects: [], schedules: [], deleted_schedules: [], work_sessions: [], session_intervals: [], session_events: [], task_notes: [] },
    serverNow: new Date().toISOString(), truncated: [],
  });
  if (path === '/api/personal-sheets') {
    const tab = url.searchParams.get('tab'); requests.push({ workspace: url.searchParams.get('workspace'), tab });
    if (url.searchParams.get('workspace') !== 'PERSONAL') return json({ error: 'PERSONAL 전용' }, 403);
    if (failSheets) return json({ error: '시트 연결 실패 테스트' }, 502);
    if (!tables[tab]) return json({ error: '지원하지 않는 시트' }, 400);
    return json({ tab, ...tables[tab], fetchedAt: new Date().toISOString(), sourceUrl: 'https://example.com/original-sheet', truncated: false, rowLimit: 1000 });
  }
  try {
    const upstream = await fetch(`http://127.0.0.1:3004${req.url}`, {
      method: req.method, headers: { 'Content-Type': req.headers['content-type'] || 'text/plain' },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : raw,
    });
    res.writeHead(upstream.status, Object.fromEntries([...upstream.headers].filter(([name]) => !['transfer-encoding', 'content-encoding', 'content-length'].includes(name))));
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch { json({ error: 'Start application on port 3004' }, 503); }
}).listen(3005, '127.0.0.1', () => console.log('Personal sheets fixture http://127.0.0.1:3005'));
