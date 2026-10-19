// Local, in-memory UI fixture. No Supabase credentials or production writes.
// Start the application on port 3004, then run this and inspect port 3005.
import http from 'node:http';
import {parseResource,seoulDate} from '../src/lib/ops.ts';
const id='11111111-1111-4111-8111-111111111111';
let task={id,title:'업무 단계 검증',notes:'기존 메모',status:'pending',priority:'normal',due_date:seoulDate(),created_at:new Date().toISOString(),work_kind:'planned',task_category:'content',process_steps:[{id:'collect',title:'자료 수집',done:true},{id:'draft',title:'초안 작성',done:false},{id:'review',title:'검수',done:false}],tool:'기존 도구',assignee:'기존 담당자',estimated_minutes:60,approval:'none',result_url:''};
const sessions=[],intervals=[],notes=[],requests=[];
let failSteps=false;
http.createServer(async(req,res)=>{
 const path=new URL(req.url,'http://127.0.0.1:3005').pathname;
 const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
 let raw='';for await(const chunk of req)raw+=chunk;
 if(path==='/__state')return json({task,requests});
 if(path==='/__fail-steps'){failSteps=raw==='true';return json({ok:true});}
 if(path==='/api/session')return json({configured:true,user:{email:'qa@example.invalid'}});
 if(path==='/api/automation-results')return json({ready:true,results:[]});
 if(path==='/api/workflow')return json({ready:true,data:{inbox:[],contexts:[]}});
 if(path==='/api/ops'){
  if(req.method==='GET')return json({taskProcessReady:true,taskClassification:true,timerGuardReady:true,taskTestClassification:false,data:{tasks:[task],projects:[],schedules:[],deleted_schedules:[],work_sessions:sessions,session_intervals:intervals,session_events:[],task_notes:notes},serverNow:new Date().toISOString(),truncated:[]});
  const body=JSON.parse(raw);requests.push(body);
  if(body.resource==='tasks'){
   if(failSteps&&body.value.process_steps)return json({error:'단계 저장 테스트 실패'},409);
   task={...task,...parseResource('tasks',body.value)};return json({row:task});
  }
  if(body.resource==='task_notes'){notes.push({...body.value,id:'note1'});return json({row:notes.at(-1)});}
  if(body.action==='timer'){
   sessions.splice(0,sessions.length,{id:'session1',task_id:id,status:'ACTIVE',created_at:new Date().toISOString()});
   intervals.splice(0,intervals.length,{id:'interval1',session_id:'session1',starts_at:new Date().toISOString(),ends_at:null});
   return json({ok:true,session_id:'session1'});
  }
 }
 try{
  const upstream=await fetch(`http://127.0.0.1:3004${req.url}`,{method:req.method,headers:{'Content-Type':req.headers['content-type']||'text/plain'},body:['GET','HEAD'].includes(req.method)?undefined:raw});
  res.writeHead(upstream.status,Object.fromEntries([...upstream.headers].filter(([name])=>!['transfer-encoding','content-encoding','content-length'].includes(name))));
  res.end(Buffer.from(await upstream.arrayBuffer()));
 }catch{json({error:'Start application on port 3004'},503);}
}).listen(3005,'127.0.0.1',()=>console.log('Task process fixture http://127.0.0.1:3005'));
