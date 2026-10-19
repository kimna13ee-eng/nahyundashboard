const {chromium}=require(require('node:path').join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const assert=require('node:assert/strict');
(async()=>{
 const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:3003';
 const denied=await fetch(`${base}/mcp`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 assert.equal(denied.status,401);assert.match(denied.headers.get('www-authenticate'),/oauth-protected-resource/);
 const origin=await fetch(`${base}/mcp`,{method:'POST',headers:{Origin:'https://evil.invalid'},body:'{}'});assert.equal(origin.status,403);
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.route('**/api/session',r=>r.fulfill({json:{configured:true,user:{email:'metricool@example.invalid'}}}));
  await page.route('**/api/ops?*',r=>r.fulfill({json:{data:{tasks:[],projects:[],schedules:[],deleted_schedules:[],work_sessions:[],session_intervals:[],session_events:[],task_notes:[]},serverNow:new Date().toISOString(),truncated:[],timerGuardReady:true}}));
  await page.route('**/api/workflow?*',r=>r.fulfill({json:{ready:false,data:{}}}));
  await page.route('**/api/automation-results',r=>r.fulfill({json:{ready:true,results:[{id:'result1',source:'metricool_personal',title:'개인 Metricool 보고서',body:'조회수 42회\n<script>window.BAD=true</script>',source_url:'https://chatgpt.com/c/example',received_at:new Date().toISOString(),reported_at:new Date().toISOString()}]}}));
  await page.goto(base);
  await page.locator('.ops-sidebar nav').getByRole('button',{name:'Automations',exact:true}).click();
  const receipt=page.locator('.ops-automation-receipt').filter({hasText:'개인 Metricool 보고서'});
  const conversation=receipt.getByRole('link',{name:'개인 Metricool 보고서 · ChatGPT 대화 열기',exact:true});
  await conversation.waitFor();
  assert.equal(await conversation.isVisible(),true);
  assert.equal(await conversation.getAttribute('href'),'https://chatgpt.com/c/example');
  assert.equal(await receipt.locator('details').getAttribute('open'),null);
  await receipt.getByText('결과 내용 보기',{exact:true}).click();
  await page.getByText('조회수 42회',{exact:false}).waitFor();
  assert.equal(await page.evaluate(()=>window.BAD),undefined);
  await conversation.waitFor();
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  console.log('PASS: MCP 미인증/외부 Origin 거부, 자동화 결과 표시·원본 링크·XSS·모바일 넘침');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
