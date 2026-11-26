import { Router } from 'express';
import { pool } from '@workspace/db';
import { requireRoleOrFeature, effectiveRoles } from '../lib/auth';
import { z } from 'zod/v4';
import { shouldApplyOwnDataFilter } from '../../shared/userPermissions';
export const calendarRoles = ['super_admin','owner','admin','engineer','technician'];
export async function ensureCalendar(){ await pool.query(`CREATE TABLE IF NOT EXISTS calendar_notes (id serial PRIMARY KEY, text text NOT NULL, day date, time text, created_by integer NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), line_message_id text UNIQUE)`); await pool.query(`CREATE TABLE IF NOT EXISTS calendar_group_daily (day date PRIMARY KEY, sent boolean NOT NULL DEFAULT false)`); }
const router=Router();
router.use('/calendar',requireRoleOrFeature(calendarRoles,['dispatch_orders']));
const schema=z.object({text:z.string().trim().min(1).max(500),day:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional()});
const canManage=(u:any)=>effectiveRoles(u).some(r=>['super_admin','owner','admin'].includes(r));
router.get('/calendar/notes',async(req,res)=>{const u=req.user!; const own=shouldApplyOwnDataFilter(u); const r=await pool.query(`SELECT id,text,day::text AS day,time,created_by AS "createdBy" FROM calendar_notes WHERE ($1::boolean = false OR created_by=$2) ORDER BY day NULLS FIRST,id DESC`,[own,u.id]);res.json(r.rows);});
router.post('/calendar/notes',async(req,res)=>{const p=schema.safeParse(req.body);if(!p.success){res.status(400).json({error:'請確認記事內容及日期時間'});return;}const {text,day,time}=p.data; const r=await pool.query('INSERT INTO calendar_notes(text,day,time,created_by) VALUES($1,$2,$3,$4) RETURNING id',[text,day??null,day?time??null:null,req.user!.id]);res.json(r.rows[0]);});
router.patch('/calendar/notes/:id',async(req,res)=>{const p=schema.safeParse(req.body);if(!p.success||!/^\d+$/.test(String(req.params.id))){res.status(400).json({error:'資料不正確'});return;} const {text,day,time}=p.data;const r=await pool.query('UPDATE calendar_notes SET text=$1,day=$2,time=$3 WHERE id=$4 AND (created_by=$5 OR $6) RETURNING id',[text,day??null,day?time??null:null,req.params.id,req.user!.id,canManage(req.user)]);res.status(r.rowCount?200:404).json(r.rows[0]??{error:'找不到記事或無權限'});});
router.delete('/calendar/notes/:id',async(req,res)=>{if(!/^\d+$/.test(String(req.params.id))){res.status(400).json({error:'資料不正確'});return;}const r=await pool.query('DELETE FROM calendar_notes WHERE id=$1 AND (created_by=$2 OR $3)',[req.params.id,req.user!.id,canManage(req.user)]);res.status(r.rowCount?200:404).json(r.rowCount?{ok:true}:{error:'找不到記事或無權限'});});
export default router;
