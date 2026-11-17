import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { z } from "zod";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();
const attendanceRoles = requireRole("super_admin", "owner", "admin");
const ownerOnly = requireRole("super_admin", "owner");
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const money = z.number().int().min(0).max(100000000000);
const roundCents = (n: number) => Math.round(n * 100);
const int = (n: unknown) => Number(n);
const error = (res: Response, e: unknown) => res.status(400).json({ error: e instanceof Error ? e.message : "資料格式錯誤" });
const employeeExists = async (id: number) => (await pool.query("SELECT 1 FROM employees WHERE id=$1", [id])).rowCount === 1;

// Only owner can decide who needs attendance registration; role/title does not control this.
router.get("/employee-attendance/preferences", ownerOnly, async (_req,res)=>{
 try {const result=await pool.query(`SELECT e.id AS "employeeId",e.name,
  COALESCE(p.requires_attendance,true) AS "requiresAttendance"
  FROM employees e LEFT JOIN employee_attendance_preferences p ON p.employee_id=e.id
  WHERE e.status <> '離職' ORDER BY e.id`);res.json(result.rows);}
 catch(e){error(res,e);}
});
router.put("/employee-attendance/preferences/:id",ownerOnly,async(req,res)=>{
 try {const employeeId=z.coerce.number().int().positive().parse(req.params.id);
  const {requiresAttendance}=z.object({requiresAttendance:z.boolean()}).parse(req.body);
  if(!await employeeExists(employeeId)){res.status(404).json({error:"員工不存在"});return;}
  await pool.query(`INSERT INTO employee_attendance_preferences(employee_id,requires_attendance,updated_by)
  VALUES($1,$2,$3) ON CONFLICT(employee_id) DO UPDATE SET
  requires_attendance=EXCLUDED.requires_attendance,updated_by=EXCLUDED.updated_by,updated_at=now()`,
  [employeeId,requiresAttendance,req.user!.id]);res.json({ok:true});
 }catch(e){error(res,e);}
});

// Attendance roster: only the minimum fields needed for daily check-in.
// Never reuse the employee-management response in administrative attendance pages.
router.get("/employee-attendance/employees", attendanceRoles, async(_req,res)=>{
  try {
    const result = await pool.query(`SELECT e.id,e.name FROM employees e LEFT JOIN employee_attendance_preferences p ON p.employee_id=e.id WHERE e.status <> '離職' AND COALESCE(p.requires_attendance,true) ORDER BY e.id`);
    res.json(result.rows);
  } catch(e) { error(res,e); }
});

// Attendance API never selects or returns compensation columns; no sensitive data in admin responses.
router.get("/employee-attendance", attendanceRoles, async (req, res) => {
  try {
    const date = dateSchema.parse(req.query.date);
    const result = await pool.query(`SELECT a.id,a.employee_id AS "employeeId",to_char(a.work_date,'YYYY-MM-DD') AS date,
     a.status,a.start_time AS "startTime",a.end_time AS "endTime",a.break_minutes AS "breakMinutes",
     a.worked_minutes AS "workedMinutes",a.leave_minutes AS "leaveMinutes",a.leave_type AS "leaveType",a.note,
     a.updated_at AS "updatedAt" FROM employee_attendance a WHERE a.work_date=$1 ORDER BY a.employee_id`, [date]);
    res.json(result.rows);
  } catch (e) { error(res, e); }
});
const segment = z.object({ kind: z.enum(["work", "break", "leave"]), start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), leaveType: z.string().max(32).nullable().optional() });
const attendanceInput = z.object({ employeeId: z.number().int().positive(), date: dateSchema,
  status: z.enum(["present", "half", "late", "early", "leave", "official", "rest", "unrecorded"]),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  breakMinutes: z.number().int().min(0).max(1440).default(0),
  workedMinutes: z.number().int().min(0).max(1440).default(0),
  leaveMinutes: z.number().int().min(0).max(1440).default(0),
  leaveType: z.string().max(32).nullable().optional(), note: z.string().max(1000).default(""),
  segments: z.array(segment).max(12).optional(),
});
router.put("/employee-attendance", attendanceRoles, async (req, res) => {
  try {
    const v = attendanceInput.parse(req.body);
    if (!await employeeExists(v.employeeId)) { res.status(404).json({ error: "員工不存在" }); return; }
    const pref=await pool.query("SELECT requires_attendance FROM employee_attendance_preferences WHERE employee_id=$1",[v.employeeId]);
    if(pref.rows[0]?.requires_attendance===false){res.status(403).json({error:"此人已設定免出勤登記，請由老闆調整設定"});return;}
    if (v.status === "unrecorded" && (v.workedMinutes || v.leaveMinutes)) throw new Error("未登記不可填寫工作或請假時數");
    if (v.segments?.length) {
      const minutes = (t: string) => Number(t.slice(0,2))*60+Number(t.slice(3));
      const normalized = v.segments.map(s=>({ ...s,startMin:minutes(s.start),endMin:minutes(s.end) })).sort((a,b)=>a.startMin-b.startMin);
      if (normalized.some((s,i)=>s.endMin <= s.startMin || (i>0 && s.startMin<normalized[i-1].endMin))) throw new Error("出勤時段重疊或時間順序錯誤");
      const work = normalized.filter(s=>s.kind==="work").reduce((n,s)=>n+s.endMin-s.startMin,0);
      const leave = normalized.filter(s=>s.kind==="leave").reduce((n,s)=>n+s.endMin-s.startMin,0);
      if (work !== v.workedMinutes || leave !== v.leaveMinutes) throw new Error("出勤時段與登記分鐘數不一致");
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const old = await client.query("SELECT * FROM employee_attendance WHERE employee_id=$1 AND work_date=$2 FOR UPDATE",[v.employeeId,v.date]);
      const result = await client.query(`INSERT INTO employee_attendance(employee_id,work_date,status,start_time,end_time,break_minutes,worked_minutes,leave_minutes,leave_type,note,updated_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT(employee_id,work_date) DO UPDATE SET status=EXCLUDED.status,start_time=EXCLUDED.start_time,end_time=EXCLUDED.end_time,
       break_minutes=EXCLUDED.break_minutes,worked_minutes=EXCLUDED.worked_minutes,leave_minutes=EXCLUDED.leave_minutes,
       leave_type=EXCLUDED.leave_type,note=EXCLUDED.note,updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING *`,
       [v.employeeId,v.date,v.status,v.startTime??null,v.endTime??null,v.breakMinutes,v.workedMinutes,v.leaveMinutes,v.leaveType??null,v.note,req.user!.id]);
      if (v.segments) {
        await client.query("DELETE FROM employee_attendance_segments WHERE attendance_id=$1",[result.rows[0].id]);
        for (const s of v.segments) await client.query("INSERT INTO employee_attendance_segments(attendance_id,segment_type,start_time,end_time,leave_type) VALUES($1,$2,$3,$4,$5)",[result.rows[0].id,s.kind,s.start,s.end,s.leaveType??null]);
      }
      await client.query("INSERT INTO employee_attendance_audit(attendance_id,employee_id,old_value,new_value,changed_by) VALUES($1,$2,$3,$4,$5)",[result.rows[0].id,v.employeeId,old.rows[0]??null,JSON.stringify({ ...result.rows[0],segments:v.segments }),req.user!.id]);
      await client.query("COMMIT"); res.json({ ok:true });
    } catch(e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
  } catch(e) { error(res,e); }
});
router.get("/employee-attendance/month", attendanceRoles, async(req,res)=>{
  try { const month = monthSchema.parse(req.query.month);
    const rows = await pool.query(`SELECT a.employee_id AS "employeeId",COUNT(*) FILTER (WHERE status IN ('present','half','late','early','official'))::int AS "attendanceDays",
    COALESCE(sum(worked_minutes),0)::int AS "workedMinutes",COALESCE(sum(leave_minutes),0)::int AS "leaveMinutes",
    COUNT(*) FILTER (WHERE status IN ('early','late','half') OR leave_minutes>0)::int AS "exceptions"
    FROM employee_attendance a
    LEFT JOIN employee_attendance_preferences p ON p.employee_id=a.employee_id
    WHERE COALESCE(p.requires_attendance,true) AND a.work_date >= $1::date AND a.work_date < ($1::date + interval '1 month') GROUP BY a.employee_id`,[month+'-01']);
    res.json(rows.rows);
  } catch(e){error(res,e);} });

const settingsInput = z.object({ employeeId:z.number().int().positive(), employmentType:z.enum(["full_time","part_time","day_worker","contractor","contractor_team"]),payType:z.enum(["monthly","daily","hourly","piece","project"]),baseCents:money,laborCents:money,healthCents:money,fixedAllowanceCents:money,dayHours:z.number().min(1).max(24),effectiveFrom:dateSchema });
router.get("/employee-pay-settings",ownerOnly,async(_req,res)=>{try{const r=await pool.query(`SELECT employee_id AS "employeeId", employment_type AS "employmentType",pay_type AS "payType",base_cents::float8 AS "baseCents",labor_cents::float8 AS "laborCents",health_cents::float8 AS "healthCents",fixed_allowance_cents::float8 AS "fixedAllowanceCents",day_hours::float8 AS "dayHours",to_char(effective_from,'YYYY-MM-DD') AS "effectiveFrom" FROM employee_pay_settings ORDER BY employee_id`);res.json(r.rows);}catch(e){error(res,e);}});
router.put("/employee-pay-settings",ownerOnly,async(req,res)=>{try{const v=settingsInput.parse(req.body);if(!await employeeExists(v.employeeId)){res.status(404).json({error:"員工不存在"});return;}
const c=await pool.connect();try{await c.query("BEGIN");await c.query(`INSERT INTO employee_pay_settings(employee_id,employment_type,pay_type,base_cents,labor_cents,health_cents,fixed_allowance_cents,day_hours,effective_from,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
ON CONFLICT(employee_id) DO UPDATE SET employment_type=EXCLUDED.employment_type,pay_type=EXCLUDED.pay_type,base_cents=EXCLUDED.base_cents,labor_cents=EXCLUDED.labor_cents,health_cents=EXCLUDED.health_cents,fixed_allowance_cents=EXCLUDED.fixed_allowance_cents,day_hours=EXCLUDED.day_hours,effective_from=EXCLUDED.effective_from,updated_by=EXCLUDED.updated_by,updated_at=now()`,[v.employeeId,v.employmentType,v.payType,v.baseCents,v.laborCents,v.healthCents,v.fixedAllowanceCents,v.dayHours,v.effectiveFrom,req.user!.id]);
await c.query(`INSERT INTO employee_pay_settings_history(employee_id,employment_type,pay_type,base_cents,labor_cents,health_cents,fixed_allowance_cents,day_hours,effective_from,changed_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[v.employeeId,v.employmentType,v.payType,v.baseCents,v.laborCents,v.healthCents,v.fixedAllowanceCents,v.dayHours,v.effectiveFrom,req.user!.id]);await c.query("COMMIT");res.json({ok:true});}catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}}
catch(e){error(res,e);}});

router.get("/employee-payroll",ownerOnly,async(req,res)=>{try{const month=monthSchema.parse(req.query.month);
const r=await pool.query(`SELECT p.*,e.name AS "employeeName",s.pay_type AS "payType" FROM employee_payroll p JOIN employees e ON e.id=p.employee_id LEFT JOIN employee_pay_settings s ON s.employee_id=p.employee_id WHERE p.pay_month=$1 ORDER BY e.name`,[month]);res.json(r.rows);}catch(e){error(res,e);}});
const payrollInput=z.object({employeeId:z.number().int().positive(),month:monthSchema,sourceMode:z.enum(["attendance","manual"]),workDays:z.number().min(0).max(31),leaveHours:z.number().min(0).max(744),bonusCents:money,overtimeCents:money,leaveDeductCents:money,otherDeductCents:money,notes:z.string().max(1000).default(""),adjustmentReason:z.string().max(500).default("")});
router.put("/employee-payroll/draft",ownerOnly,async(req,res)=>{try{const v=payrollInput.parse(req.body);
const c=await pool.connect();try{await c.query("BEGIN");
const existing=await c.query("SELECT * FROM employee_payroll WHERE employee_id=$1 AND pay_month=$2 FOR UPDATE",[v.employeeId,v.month]);
if(existing.rows[0] && existing.rows[0].status!=="draft"){res.status(409).json({error:"已核准或已付款的薪資不得直接修改"});await c.query("ROLLBACK");return;}
const s=await c.query(`SELECT * FROM employee_pay_settings_history WHERE employee_id=$1 AND effective_from <= ($2::date + interval '1 month' - interval '1 day') ORDER BY effective_from DESC,id DESC LIMIT 1`,[v.employeeId,v.month+'-01']);
if(!s.rows[0]) {res.status(400).json({error:"請先設定員工薪資與生效日期"});await c.query("ROLLBACK");return;}
const setting=s.rows[0];
const attendance=await c.query(`SELECT COUNT(*) FILTER(WHERE status IN ('present','half','late','early','official'))::int AS days,COALESCE(SUM(worked_minutes),0)::int AS worked,COALESCE(SUM(leave_minutes),0)::int AS leave FROM employee_attendance WHERE employee_id=$1 AND work_date >= $2::date AND work_date < ($2::date + interval '1 month')`,[v.employeeId,v.month+'-01']);
const pref=await c.query("SELECT requires_attendance FROM employee_attendance_preferences WHERE employee_id=$1",[v.employeeId]);
if(pref.rows[0]?.requires_attendance===false && v.sourceMode==='attendance') {res.status(400).json({error:"此員工免登記出勤，請改用手動結算"});await c.query("ROLLBACK");return;}
const workDays=v.sourceMode==='attendance' ? Number(attendance.rows[0].days) : v.workDays;
const leaveHours=v.sourceMode==='attendance' ? Number(attendance.rows[0].leave)/60 : v.leaveHours;
// Manual leave deduction is deliberate: no unsafe one-size-fits-all statutory leave-pay assumption.
const rate=Number(setting.base_cents);const dayHours=Number(setting.day_hours);
let base=rate;
if(setting.pay_type==='daily') base=Math.round(rate*workDays);
if(setting.pay_type==='hourly') base=Math.round(rate*(v.sourceMode==='attendance'?Number(attendance.rows[0].worked)/60:workDays*dayHours));
if(['piece','project'].includes(setting.pay_type)) base=rate; // agreed period/project amount, owner verifies
const allowance=Number(setting.fixed_allowance_cents);
const gross=base+allowance+v.bonusCents+v.overtimeCents;
const deductions=v.leaveDeductCents+v.otherDeductCents+Number(setting.labor_cents)+Number(setting.health_cents);
const net=gross-deductions;
if(net<0)throw new Error("扣款超過應發薪資，請重新確認");
const snapshot={setting,workDays,leaveHours,attendance:attendance.rows[0],calculation:"leave deduction must be checked against applicable Taiwan rules"};
const result=await c.query(`INSERT INTO employee_payroll(employee_id,pay_month,source_mode,work_days,leave_hours,base_cents,allowance_cents,bonus_cents,overtime_cents,leave_deduct_cents,labor_cents,health_cents,other_deduct_cents,gross_cents,net_cents,notes,adjustment_reason,snapshot,updated_by)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
ON CONFLICT(employee_id,pay_month) DO UPDATE SET source_mode=EXCLUDED.source_mode,work_days=EXCLUDED.work_days,leave_hours=EXCLUDED.leave_hours,base_cents=EXCLUDED.base_cents,allowance_cents=EXCLUDED.allowance_cents,bonus_cents=EXCLUDED.bonus_cents,overtime_cents=EXCLUDED.overtime_cents,leave_deduct_cents=EXCLUDED.leave_deduct_cents,labor_cents=EXCLUDED.labor_cents,health_cents=EXCLUDED.health_cents,other_deduct_cents=EXCLUDED.other_deduct_cents,gross_cents=EXCLUDED.gross_cents,net_cents=EXCLUDED.net_cents,notes=EXCLUDED.notes,adjustment_reason=EXCLUDED.adjustment_reason,snapshot=EXCLUDED.snapshot,updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING *`,[v.employeeId,v.month,v.sourceMode,workDays,leaveHours,base,allowance,v.bonusCents,v.overtimeCents,v.leaveDeductCents,Number(setting.labor_cents),Number(setting.health_cents),v.otherDeductCents,gross,net,v.notes,v.adjustmentReason,JSON.stringify(snapshot),req.user!.id]);
await c.query("INSERT INTO employee_payroll_audit(payroll_id,old_value,new_value,changed_by) VALUES($1,$2,$3,$4)",[result.rows[0].id,existing.rows[0]??null,JSON.stringify(result.rows[0]),req.user!.id]);
await c.query("COMMIT");res.json({ok:true,netCents:net});
}catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}}
catch(e){error(res,e);}});
router.post("/employee-payroll/:id/approve",ownerOnly,async(req,res)=>{try{const id=z.coerce.number().int().positive().parse(req.params.id);const r=await pool.query("UPDATE employee_payroll SET status='approved',approved_by=$2,approved_at=now(),updated_at=now() WHERE id=$1 AND status='draft' RETURNING id",[id,req.user!.id]);if(!r.rowCount){res.status(409).json({error:"不存在或已核准，無法重複核准"});return;}res.json({ok:true});}catch(e){error(res,e);}});
router.post("/employee-payroll/:id/paid",ownerOnly,async(req,res)=>{try{const id=z.coerce.number().int().positive().parse(req.params.id);const r=await pool.query("UPDATE employee_payroll SET status='paid',paid_by=$2,paid_at=now(),updated_at=now() WHERE id=$1 AND status='approved' RETURNING id",[id,req.user!.id]);if(!r.rowCount){res.status(409).json({error:"必須先核准才能標記已付"});return;}res.json({ok:true});}catch(e){error(res,e);}});
export default router;
