import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth, hasRole } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const todayTaiwan = () => new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const statuses = [{value:"present",label:"正常上班"},{value:"half",label:"半天"},{value:"late",label:"遲到"},{value:"early",label:"早退／中途離開"},{value:"leave",label:"整天請假"},{value:"official",label:"公出"},{value:"rest",label:"休息日"},{value:"unrecorded",label:"未登記"}];
const leaveTypes = [{value:"none",label:"無"},{value:"personal",label:"事假"},{value:"sick",label:"病假"},{value:"annual",label:"特休"},{value:"official",label:"公假"},{value:"other",label:"其他／待確認"}];
const workTypes = [{value:"full_time",label:"正職"},{value:"part_time",label:"兼職"},{value:"day_worker",label:"日薪僱用"},{value:"contractor",label:"外包個人"},{value:"contractor_team",label:"外包班組"}];
const payTypes = [{value:"monthly",label:"月薪"},{value:"daily",label:"日薪"},{value:"hourly",label:"時薪"},{value:"piece",label:"按件"},{value:"project",label:"工程計價"}];
const asMoney = (n:number|string|undefined)=> (Number(n||0)/100).toLocaleString("zh-TW",{minimumFractionDigits:0,maximumFractionDigits:2});
const cents=(v:string)=>Math.round(Math.max(0,Number(v)||0)*100);
const yuan=(v:number|string|undefined)=>String(Number(v||0)/100);
const api=async <T,>(path:string,method="GET",body?:unknown):Promise<T>=>{
 const token=localStorage.getItem("erp_auth_token");
 const r=await fetch("/api"+path,{method,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(data.error||`操作失敗 (${r.status})`);
 return data as T;
};
type Attendance={employeeId:number;date:string;status:string;startTime:string|null;endTime:string|null;breakMinutes:number;workedMinutes:number;leaveMinutes:number;leaveType:string|null;note:string};
type PaySetting={employeeId:number;employmentType:string;payType:string;baseCents:number;laborCents:number;healthCents:number;fixedAllowanceCents:number;dayHours:number;effectiveFrom:string};
type Payroll={id:number;employee_id:number;employeeName:string;status:string;work_days:string;leave_hours:string;base_cents:string;allowance_cents:string;bonus_cents:string;overtime_cents:string;leave_deduct_cents:string;labor_cents:string;health_cents:string;other_deduct_cents:string;gross_cents:string;net_cents:string;source_mode:string};
type AttendancePreference={employeeId:number;name:string;requiresAttendance:boolean};
type Monthly={employeeId:number;attendanceDays:number;workedMinutes:number;leaveMinutes:number;exceptions:number};
const blankSetting=(employeeId:number):PaySetting=>({employeeId,employmentType:"full_time",payType:"monthly",baseCents:0,laborCents:0,healthCents:0,fixedAllowanceCents:0,dayHours:8,effectiveFrom:todayTaiwan()});
const blankAttendance=(employeeId:number,date:string):Attendance=>({employeeId,date,status:"unrecorded",startTime:null,endTime:null,breakMinutes:0,workedMinutes:0,leaveMinutes:0,leaveType:null,note:""});
function Choice({value,onChange,options}:{value:string;onChange:(v:string)=>void;options:{value:string;label:string}[]}) {
 // Native select avoids a Radix menu being hidden/clipped by existing ERP layout layers.
 return <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50" value={options.some(o=>o.value===value)?value:""} onChange={e=>onChange(e.target.value)} disabled={!options.length}>
  {!options.length?<option value="">沒有可選的人員</option>:<><option value="" disabled>請選擇</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</>}
 </select>;
}
function MoneyField({label,value,onChange}:{label:string;value:number;onChange:(v:number)=>void}) {return <div className="space-y-1"><Label>{label}（元）</Label><Input type="number" min="0" step="1" value={yuan(value)} onChange={e=>onChange(cents(e.target.value))}/></div>;}
function AttendanceTab({employees}:{employees:{id:number;name:string}[]}){
 const qc=useQueryClient();const {toast}=useToast();const [date,setDate]=useState(todayTaiwan());const [employeeId,setEmployeeId]=useState(0);
 const {data=[],isLoading}=useQuery({queryKey:["attendance",date],queryFn:()=>api<Attendance[]>(`/employee-attendance?date=${date}`)});
 useEffect(()=>{if(employees.length&&!employees.some(e=>e.id===employeeId))setEmployeeId(employees[0].id);},[employeeId,employees]);
 const saved=data.find(r=>r.employeeId===employeeId);
 const [form,setForm]=useState<Attendance>(blankAttendance(employeeId,date));
 useEffect(()=>{setForm(saved??blankAttendance(employeeId,date));},[saved?.employeeId,saved?.date,saved?.status,saved?.startTime,saved?.endTime,saved?.workedMinutes,saved?.leaveMinutes,employeeId,date]);
 const [busy,setBusy]=useState(false);
 async function save(){try{setBusy(true);await api("/employee-attendance","PUT",{...form,employeeId,date,leaveType:form.leaveType||null});await qc.invalidateQueries({queryKey:["attendance"]});toast({title:"出勤已儲存"});}catch(e){toast({title:"無法儲存",description:String(e),variant:"destructive"});}finally{setBusy(false);}}
 return <div className="space-y-4"><Card><CardHeader><CardTitle>每日出勤登記</CardTitle></CardHeader><CardContent className="space-y-4">
 <div className="grid md:grid-cols-2 gap-3"><div><Label>選擇日期</Label><Input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div><div><Label>員工</Label><Choice value={String(employeeId)} onChange={v=>setEmployeeId(Number(v))} options={employees.map(e=>({value:String(e.id),label:e.name}))}/></div></div>
 <div className="rounded-md border p-3"><p className="text-sm font-medium mb-2">當日快速點名</p><div className="flex flex-wrap gap-2">{employees.map(e=><Button key={e.id} type="button" size="sm" variant={employeeId===e.id?"default":"outline"} onClick={()=>setEmployeeId(e.id)}>{e.name} · {statuses.find(s=>s.value===data.find(d=>d.employeeId===e.id)?.status)?.label||"未登記"}</Button>)}</div></div>
 {isLoading?<p>讀取中…</p>:<><div className="grid md:grid-cols-2 gap-3"><div><Label>狀態</Label><Choice value={form.status} onChange={v=>setForm(f=>({...f,status:v}))} options={statuses}/></div><div><Label>請假原因</Label><Choice value={form.leaveType||"none"} onChange={v=>setForm(f=>({...f,leaveType:v==="none"?null:v}))} options={leaveTypes}/></div>
 <div><Label>上班時間（選填）</Label><Input type="time" value={form.startTime??""} onChange={e=>setForm(f=>({...f,startTime:e.target.value||null}))}/></div><div><Label>離開時間（選填）</Label><Input type="time" value={form.endTime??""} onChange={e=>setForm(f=>({...f,endTime:e.target.value||null}))}/></div>
 <div><Label>實際工作時數</Label><Input type="number" min="0" max="24" step="0.5" value={form.workedMinutes/60} onChange={e=>setForm(f=>({...f,workedMinutes:Math.round(Math.max(0,Number(e.target.value)||0)*60)}))}/></div>
 <div><Label>請假時數</Label><Input type="number" min="0" max="24" step="0.5" value={form.leaveMinutes/60} onChange={e=>setForm(f=>({...f,leaveMinutes:Math.round(Math.max(0,Number(e.target.value)||0)*60)}))}/></div></div>
 <div><Label>備註（例如 13:00 中途離開）</Label><Textarea value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/></div>
 <Button onClick={()=>void save()} disabled={busy||!employeeId}>{busy?"儲存中…":"儲存今日出勤"}</Button></>}
 </CardContent></Card><p className="text-xs text-muted-foreground">行政只能記錄實際出勤，不會在這裡顯示任何底薪或薪資金額。未登記不代表曠職，也不會自動扣薪。</p></div>;
}
function AttendanceExemptionSettings(){
 const qc=useQueryClient();const {toast}=useToast();const [busyId,setBusyId]=useState<number|null>(null);
 const {data:preferences=[],error:preferenceError}=useQuery({queryKey:["attendance-preferences"],queryFn:()=>api<AttendancePreference[]>("/employee-attendance/preferences")});
 async function change(item:AttendancePreference){try{setBusyId(item.employeeId);
  await api(`/employee-attendance/preferences/${item.employeeId}`,"PUT",{requiresAttendance:!item.requiresAttendance});
  await qc.invalidateQueries({queryKey:["attendance-preferences"]});
  await qc.invalidateQueries({queryKey:["attendance-employee-list"]});
  await qc.invalidateQueries({queryKey:["attendance-month"]});
  toast({title:`${item.name} 已設為${item.requiresAttendance?"免出勤登記":"需要出勤登記"}`});
 }catch(e){toast({title:"設定失敗",description:String(e),variant:"destructive"});}finally{setBusyId(null);}}
 return <Card><CardHeader><CardTitle>出勤登記設定（僅老闆）</CardTitle></CardHeader><CardContent className="space-y-3">
 <p className="text-sm text-muted-foreground">設定哪些人需要行政每日點名；免登記者不會出現在行政點名清單，也不會被算成未出勤。與職位、系統權限、薪資結算分開。</p>
 {preferenceError&&<p className="text-sm text-red-600">無法讀取出勤設定：{String(preferenceError)}。請檢查資料庫 migration 是否已執行。</p>}<div className="grid sm:grid-cols-2 gap-2">{preferences.map(item=><div key={item.employeeId} className="border rounded-lg px-3 py-2 flex items-center justify-between gap-3"><div className="min-w-0"><p className="font-medium truncate">{item.name}</p><p className="text-xs text-muted-foreground">{item.requiresAttendance?"需要點名":"免出勤登記"}</p></div><Button type="button" size="sm" variant={item.requiresAttendance?"outline":"default"} disabled={busyId===item.employeeId} onClick={()=>void change(item)}>{item.requiresAttendance?"改為免登記":"改為需登記"}</Button></div>)}</div>
 </CardContent></Card>;
}
function SettingsTab({employees}:{employees:{id:number;name:string}[]}){
 const qc=useQueryClient();const {toast}=useToast();const [employeeId,setEmployeeId]=useState(0);
 const {data=[]}=useQuery({queryKey:["pay-settings"],queryFn:()=>api<PaySetting[]>("/employee-pay-settings")});
 useEffect(()=>{if(employees.length&&!employees.some(e=>e.id===employeeId))setEmployeeId(employees[0].id);},[employeeId,employees]);
 const selected=data.find(s=>s.employeeId===employeeId);
 const [form,setForm]=useState<PaySetting>(blankSetting(0));
 useEffect(()=>{setForm(selected??blankSetting(employeeId));},[employeeId,selected?.employeeId,selected?.baseCents,selected?.effectiveFrom]);
 const [busy,setBusy]=useState(false);const update=(field:keyof PaySetting,value:string|number)=>setForm(f=>({...f,[field]:value}));
 async function save(){try{setBusy(true);await api("/employee-pay-settings","PUT",{...form,employeeId});await qc.invalidateQueries({queryKey:["pay-settings"]});toast({title:"薪資設定已儲存"});}catch(e){toast({title:"無法儲存",description:String(e),variant:"destructive"});}finally{setBusy(false);}}
 return <div className="space-y-4"><AttendanceExemptionSettings/><Card><CardHeader><CardTitle>員工固定薪資設定（限老闆）</CardTitle></CardHeader><CardContent className="space-y-4"><div><Label>員工</Label><Choice value={String(employeeId)} onChange={v=>setEmployeeId(Number(v))} options={employees.map(e=>({value:String(e.id),label:e.name}))}/></div>
 <div className="grid md:grid-cols-2 gap-3"><div><Label>雇用類型</Label><Choice value={form.employmentType} onChange={v=>update("employmentType",v)} options={workTypes}/></div><div><Label>計薪方式</Label><Choice value={form.payType} onChange={v=>update("payType",v)} options={payTypes}/></div>
 <MoneyField label="底薪／計薪單價" value={form.baseCents} onChange={v=>update("baseCents",v)}/><MoneyField label="固定津貼" value={form.fixedAllowanceCents} onChange={v=>update("fixedAllowanceCents",v)}/><MoneyField label="勞保個人負擔" value={form.laborCents} onChange={v=>update("laborCents",v)}/><MoneyField label="健保個人負擔" value={form.healthCents} onChange={v=>update("healthCents",v)}/>
 <div><Label>標準每日工時</Label><Input type="number" min="1" max="24" value={form.dayHours} onChange={e=>update("dayHours",Number(e.target.value))}/></div><div><Label>薪資設定生效日</Label><Input type="date" value={form.effectiveFrom} onChange={e=>update("effectiveFrom",e.target.value)}/></div></div>
 <p className="text-xs text-amber-700">勞健保請填員工個人負擔，不可填雇主負擔。外包計價不應自動套用正職的勞健保。</p><Button disabled={busy||!employeeId} onClick={()=>void save()}>{busy?"儲存中…":"儲存薪資設定"}</Button></CardContent></Card></div>;
}
function PayrollTab({employees}:{employees:{id:number;name:string}[]}){
 const qc=useQueryClient();const {toast}=useToast();const [month,setMonth]=useState(todayTaiwan().slice(0,7));const [employeeId,setEmployeeId]=useState(0);
 const {data:settings=[]}=useQuery({queryKey:["pay-settings"],queryFn:()=>api<PaySetting[]>("/employee-pay-settings")});
 const {data:preferences=[]}=useQuery({queryKey:["attendance-preferences"],queryFn:()=>api<AttendancePreference[]>("/employee-attendance/preferences")});
 const exempt=preferences.find(p=>p.employeeId===employeeId)?.requiresAttendance===false;
 const {data:monthly=[]}=useQuery({queryKey:["attendance-month",month],queryFn:()=>api<Monthly[]>(`/employee-attendance/month?month=${month}`)});
 const {data:payroll=[]}=useQuery({queryKey:["payroll",month],queryFn:()=>api<Payroll[]>(`/employee-payroll?month=${month}`)});
 useEffect(()=>{if(employees.length&&!employees.some(e=>e.id===employeeId))setEmployeeId(employees[0].id);},[employeeId,employees]);
 const attendance=monthly.find(a=>a.employeeId===employeeId);const saved=payroll.find(p=>p.employee_id===employeeId);const setting=settings.find(s=>s.employeeId===employeeId);
 const [mode,setMode]=useState("attendance");const [workDays,setWorkDays]=useState("0");const [leaveHours,setLeaveHours]=useState("0");
 const [bonus,setBonus]=useState("0"),[overtime,setOvertime]=useState("0"),[leaveDeduct,setLeaveDeduct]=useState("0"),[otherDeduct,setOtherDeduct]=useState("0"),[notes,setNotes]=useState(""),[reason,setReason]=useState("");
 useEffect(()=>{setMode(saved?.source_mode||(exempt?"manual":"attendance"));setWorkDays(String(saved?Number(saved.work_days):attendance?.attendanceDays||0));setLeaveHours(String(saved?Number(saved.leave_hours):(attendance?.leaveMinutes||0)/60));setBonus(yuan(saved?.bonus_cents));setOvertime(yuan(saved?.overtime_cents));setLeaveDeduct(yuan(saved?.leave_deduct_cents));setOtherDeduct(yuan(saved?.other_deduct_cents));setNotes("");setReason("");},[employeeId,month,saved?.id,attendance?.attendanceDays,exempt]);
 const [busy,setBusy]=useState(false);
 async function save(){try{setBusy(true);await api("/employee-payroll/draft","PUT",{employeeId,month,sourceMode:mode,workDays:Number(workDays),leaveHours:Number(leaveHours),bonusCents:cents(bonus),overtimeCents:cents(overtime),leaveDeductCents:cents(leaveDeduct),otherDeductCents:cents(otherDeduct),notes,adjustmentReason:reason});await qc.invalidateQueries({queryKey:["payroll",month]});toast({title:"薪資草稿已儲存"});}catch(e){toast({title:"薪資計算失敗",description:String(e),variant:"destructive"});}finally{setBusy(false);}}
 async function action(id:number,type:"approve"|"paid"){try{await api(`/employee-payroll/${id}/${type}`,"POST");await qc.invalidateQueries({queryKey:["payroll",month]});toast({title:type==="approve"?"已核准":"已記錄付款"});}catch(e){toast({title:"操作失敗",description:String(e),variant:"destructive"});}}
 const statement=(p:Payroll)=>{const lines=["晟風工程｜個人薪資明細",`員工：${p.employeeName}`,`月份：${month}`,`出勤：${p.work_days} 天`, `請假：${p.leave_hours} 小時`, `底薪／計價：${asMoney(p.base_cents)}`,`津貼：${asMoney(p.allowance_cents)}`,`獎金：${asMoney(p.bonus_cents)}`,`加班：${asMoney(p.overtime_cents)}`,`請假扣款：${asMoney(p.leave_deduct_cents)}`,`勞保：${asMoney(p.labor_cents)}`,`健保：${asMoney(p.health_cents)}`,`其他扣款：${asMoney(p.other_deduct_cents)}`,`應發：${asMoney(p.gross_cents)}`,`實領：${asMoney(p.net_cents)}`,`狀態：${p.status}`];const w=window.open("","_blank");if(!w)return;w.document.write(`<html><head><meta charset="utf-8"><title>薪資明細</title><style>body{font:16px sans-serif;max-width:700px;margin:36px auto;line-height:2;white-space:pre-line}@media print{body{margin:24px}}</style></head><body>${lines.map(x=>x.replaceAll("&","&amp;").replaceAll("<","&lt;")).join("\n")}<script>window.print()</script></body></html>`);w.document.close();};
 return <div className="space-y-4"><Card><CardHeader><CardTitle>每月薪資結算（僅老闆）</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid md:grid-cols-2 gap-3"><div><Label>結算月份</Label><Input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></div><div><Label>員工</Label><Choice value={String(employeeId)} onChange={v=>setEmployeeId(Number(v))} options={employees.map(e=>({value:String(e.id),label:e.name}))}/></div></div>
 <div className="rounded-lg border bg-muted/30 p-3 text-sm">{exempt?"免出勤登記（薪資使用手動結算）":`行政已登記：${attendance?.attendanceDays||0} 天`}，請假 {(Number(attendance?.leaveMinutes||0)/60).toFixed(1)} 小時，異常 {attendance?.exceptions||0} 筆。薪資設定：{setting?`${payTypes.find(t=>t.value===setting.payType)?.label} ${asMoney(setting.baseCents)} 元` : "尚未建立"}。</div>
 <div><Label>結算來源</Label><Choice value={mode} onChange={setMode} options={exempt?[{value:"manual",label:"免登記／老闆手動結算"}]:[{value:"attendance",label:"自動帶入出勤"},{value:"manual",label:"老闆手動輸入"}]}/></div>
 <div className="grid md:grid-cols-2 gap-3"><div><Label>出勤天數</Label><Input type="number" step="0.5" min="0" max="31" disabled={mode==="attendance"} value={mode==="attendance"?String(attendance?.attendanceDays||0):workDays} onChange={e=>setWorkDays(e.target.value)}/></div><div><Label>請假時數</Label><Input type="number" step="0.5" min="0" disabled={mode==="attendance"} value={mode==="attendance"?String(Number(attendance?.leaveMinutes||0)/60):leaveHours} onChange={e=>setLeaveHours(e.target.value)}/></div>
 <div><Label>本月獎金（元）</Label><Input type="number" min="0" value={bonus} onChange={e=>setBonus(e.target.value)}/></div><div><Label>加班費（元）</Label><Input type="number" min="0" value={overtime} onChange={e=>setOvertime(e.target.value)}/></div>
 <div><Label>依法核算請假扣款（元）</Label><Input type="number" min="0" value={leaveDeduct} onChange={e=>setLeaveDeduct(e.target.value)}/></div><div><Label>其他合法扣款（元）</Label><Input type="number" min="0" value={otherDeduct} onChange={e=>setOtherDeduct(e.target.value)}/></div></div>
 <div><Label>人工調整原因</Label><Input value={reason} onChange={e=>setReason(e.target.value)} placeholder="例如：出勤紀錄補登、主管核准差額"/></div><div><Label>薪資備註</Label><Textarea value={notes} onChange={e=>setNotes(e.target.value)}/></div>
 <p className="text-xs text-amber-700">本版不會自動認定病假、事假該扣多少；請由老闆確認適用假別及法定比例後輸入。單純未登記不會扣薪。核准後將鎖定快照。</p>
 <Button disabled={busy||!employeeId||!setting||Boolean(saved&&saved.status!=="draft")} onClick={()=>void save()}>{busy?"計算中…":"計算並儲存薪資草稿"}</Button></CardContent></Card>
 <Card><CardHeader><CardTitle>{month} 已建立薪資草稿／結算單</CardTitle></CardHeader><CardContent className="space-y-3">{payroll.length===0?<p className="text-sm text-muted-foreground">還沒有建立薪資草稿。</p>:payroll.map(p=><div key={p.id} className="border rounded-lg p-3 flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{p.employeeName} · {p.status==="draft"?"草稿":p.status==="approved"?"已核准":"已付款"}</p><p className="text-sm">出勤 {p.work_days} 天 · 實領 NT$ {asMoney(p.net_cents)}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>statement(p)}>列印明細</Button>{p.status==="draft"&&<Button size="sm" onClick={()=>void action(p.id,"approve")}>核准</Button>}{p.status==="approved"&&<Button size="sm" onClick={()=>void action(p.id,"paid")}>標記已付款</Button>}</div></div>)}</CardContent></Card></div>;
}
export default function EmployeeAttendancePayroll({tab}:{tab:"attendance"|"settings"|"payroll"}){
 const {user}=useAuth();const boss=hasRole(user,"super_admin","owner");
 const {data:active=[],isLoading:rosterLoading,error:rosterError}=useQuery({queryKey:["attendance-employee-list"],queryFn:()=>api<{id:number;name:string}[]>("/employee-attendance/employees")});
 const {data:allPeople=[],isLoading:peopleLoading,error:peopleError}=useQuery({queryKey:["attendance-preferences"],enabled:boss,queryFn:()=>api<AttendancePreference[]>("/employee-attendance/preferences")});
 const payrollPeople=allPeople.map(e=>({id:e.employeeId,name:e.name}));
 return <div className="space-y-4"><div><h1 className="text-2xl font-bold">{tab==="attendance"?"出勤管理":tab==="settings"?"員工薪資設定":"每月薪資結算"}</h1><p className="text-sm text-muted-foreground">出勤與薪資分開授權，所有資料儲存在正式 PostgreSQL 資料庫。</p></div>
 <div className="flex flex-wrap gap-2">{boss&&<Link href="/employees"><Button variant="outline">員工管理</Button></Link>}<Link href="/attendance"><Button variant={tab==="attendance"?"default":"outline"}>出勤登記</Button></Link>{boss&&<><Link href="/employees/settings"><Button variant={tab==="settings"?"default":"outline"}>薪資設定</Button></Link><Link href="/employees/payroll"><Button variant={tab==="payroll"?"default":"outline"}>薪資結算</Button></Link></>}</div>
 {tab==="attendance"?(rosterError?<div className="border border-red-300 rounded-lg p-4 text-red-700">讀取出勤人員失敗：{String(rosterError)}。請確認已完成出勤／薪資資料庫 migration。</div>:rosterLoading?<p>正在讀取員工名單…</p>:active.length===0?<div className="border rounded-lg p-4">目前沒有需要點名的在職人員。請由老闆檢查「出勤登記設定」。</div>:<AttendanceTab employees={active}/>):!boss?<div className="p-5 border rounded-lg">只有老闆帳號可以查看薪資資料。</div>:peopleError?<div className="border border-red-300 rounded-lg p-4 text-red-700">無法取得員工名單：{String(peopleError)}。請確認已執行資料庫 migration，並檢查老闆帳號權限。</div>:peopleLoading?<p>正在讀取員工名單…</p>:payrollPeople.length===0?<div className="border rounded-lg p-4">目前沒有可設定薪資的在職員工。</div>:tab==="settings"?<SettingsTab employees={payrollPeople}/>:<PayrollTab employees={payrollPeople}/>}</div>;
}
