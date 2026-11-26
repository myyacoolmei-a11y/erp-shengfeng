import { pool } from '@workspace/db';
import { replyLineMessage,sendLinePushMessage } from './lineMessaging';
import { tryToAbsoluteAppUrl } from '../appUrl';
import { logger } from '../logger';
import { taipeiNowHm,taipeiToday } from '../reminders/dateUtils';
import { getLineChannelAccessToken } from './lineConfig';
const groupId=()=>process.env.CALENDAR_LINE_GROUP_ID?.trim()||'';
export async function handleCalendarGroup(e:{groupId?:string;userId?:string;messageId?:string;text:string;replyToken?:string}):Promise<void>{
 if(!e.groupId||!e.userId||!e.replyToken)return;
 if(e.text.trim()==='取得行事曆群組ID'){
   const owner=await pool.query(`SELECT id FROM users WHERE line_user_id=$1 AND is_active=true AND must_change_password=false AND (role IN ('owner','super_admin') OR roles && ARRAY['owner','super_admin']::text[]) LIMIT 2`,[e.userId]);
   if(owner.rows.length===1)await replyLineMessage({replyToken:e.replyToken,text:'此群組 ID：'+e.groupId+'\n請由管理員設定 Railway 的 CALENDAR_LINE_GROUP_ID。'});return;
 }
 if(!groupId()||e.groupId!==groupId())return;
 const match=e.text.trim().match(/^記事[：:\s]+([\s\S]{1,500})$/);const query=/^(今日|明日)行程$/.test(e.text.trim());if(!match&&!query)return;
 const r=await pool.query(`SELECT id FROM users WHERE line_user_id=$1 AND is_active=true AND must_change_password=false AND (role IN ('owner','super_admin','admin','engineer','technician') OR roles && ARRAY['owner','super_admin','admin','engineer','technician']::text[]) LIMIT 2`,[e.userId]);
 if(r.rows.length!==1){await replyLineMessage({replyToken:e.replyToken,text:'請先在官方帳號私人聊天室綁定 ERP 帳號。'});return;}
 if(match){if(!e.messageId)return;const ins=await pool.query('INSERT INTO calendar_notes(text,created_by,line_message_id) VALUES($1,$2,$3) ON CONFLICT(line_message_id) DO NOTHING',[match[1].trim(),r.rows[0].id,e.messageId]);await replyLineMessage({replyToken:e.replyToken,text:ins.rowCount?'已記錄到待安排工作。':'這筆記事已記錄。'});return;}
 const day=e.text.trim().startsWith('明日')?nextDay(taipeiToday()):taipeiToday();await replyLineMessage({replyToken:e.replyToken,text:await summary(day)});
}
function nextDay(day:string){const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
async function summary(day:string){const r=await pool.query(`SELECT scheduled_time,project_type,assigned_to FROM work_orders WHERE scheduled_date=$1 AND status NOT IN ('已取消','取消','作廢') ORDER BY scheduled_time NULLS LAST,id`,[day]);const url=tryToAbsoluteAppUrl('/calendar?day='+day);const rows=r.rows.slice(0,30).map((x,i)=>`${i+1}. ${x.scheduled_time||'待定'} ${x.project_type||'工程'} ${x.assigned_to||'未指派'}`);return `晟風工程｜${day}\n共 ${r.rows.length} 筆派工\n${rows.join('\n')}${r.rows.length>30?'\n其餘請查看行事曆':''}\n${url?'完整資料／導航（須登入）：'+url:'請登入 ERP 查看共享行事曆'}`;}
// Opt-in daily digest. Atomic claim avoids sending twice across replicas.
export async function tickCalendarGroup(){const group=groupId(),hm=process.env.CALENDAR_LINE_DAILY_TIME?.trim();if(!group||!hm||hm!==taipeiNowHm()||!getLineChannelAccessToken())return;const day=taipeiToday();const claim=await pool.query(`INSERT INTO calendar_group_daily(day) VALUES($1) ON CONFLICT DO NOTHING RETURNING day`,[day]);if(!claim.rowCount)return;try{await sendLinePushMessage({userId:group,text:await summary(day)});await pool.query('UPDATE calendar_group_daily SET sent=true WHERE day=$1',[day]);}catch(err){logger.error({err},'calendar LINE daily delivery failed; claim retained to prevent duplicates');}}
