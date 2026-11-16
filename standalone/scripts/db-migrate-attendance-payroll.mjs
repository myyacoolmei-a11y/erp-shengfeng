import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('缺少 DATABASE_URL；未修改資料庫。');
  process.exit(1);
}
const sql = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'db-migrate-attendance-payroll.sql'), 'utf8');
const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({connectionString,...(connectionString.includes('.proxy.rlwy.net')||connectionString.includes('sslmode=require')?{ssl:{rejectUnauthorized:false}}:{})});
try {
  await pool.query(sql);
  console.log('出勤／薪資資料表建立完成（保留既有資料）。');
} catch (e) {
  console.error('Migration 未完成：', e);
  process.exitCode = 1;
} finally {
  await pool.end();
}
