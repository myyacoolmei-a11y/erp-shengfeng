-- 晟風 ERP 出勤／薪資擴充。只新增獨立資料表，不變更既有 employees 欄位。
-- 正式套用前先備份資料庫：psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/db-migrate-attendance-payroll.sql
BEGIN;
CREATE TABLE IF NOT EXISTS employee_pay_settings (
 employee_id integer PRIMARY KEY REFERENCES employees(id) ON DELETE RESTRICT,
 employment_type text NOT NULL DEFAULT 'full_time',
 pay_type text NOT NULL DEFAULT 'monthly',
 base_cents bigint NOT NULL DEFAULT 0 CHECK (base_cents >= 0),
 labor_cents bigint NOT NULL DEFAULT 0 CHECK (labor_cents >= 0),
 health_cents bigint NOT NULL DEFAULT 0 CHECK (health_cents >= 0),
 fixed_allowance_cents bigint NOT NULL DEFAULT 0 CHECK (fixed_allowance_cents >= 0),
 day_hours numeric(5,2) NOT NULL DEFAULT 8 CHECK (day_hours > 0),
 effective_from date NOT NULL DEFAULT CURRENT_DATE,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by integer
);
CREATE TABLE IF NOT EXISTS employee_pay_settings_history (
 id bigserial PRIMARY KEY, employee_id integer NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
 employment_type text NOT NULL, pay_type text NOT NULL,
 base_cents bigint NOT NULL, labor_cents bigint NOT NULL, health_cents bigint NOT NULL,
 fixed_allowance_cents bigint NOT NULL, day_hours numeric(5,2) NOT NULL,
 effective_from date NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), changed_by integer
);
CREATE INDEX IF NOT EXISTS idx_pay_settings_history_employee_date ON employee_pay_settings_history(employee_id,effective_from DESC,id DESC);
-- 出勤免登記設定與薪資設定分開；預設所有人需要登記。
CREATE TABLE IF NOT EXISTS employee_attendance_preferences (
 employee_id integer PRIMARY KEY REFERENCES employees(id) ON DELETE RESTRICT,
 requires_attendance boolean NOT NULL DEFAULT true,
 updated_by integer,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS employee_attendance (
 id bigserial PRIMARY KEY, employee_id integer NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
 work_date date NOT NULL, status text NOT NULL DEFAULT 'unrecorded',
 start_time text, end_time text, break_minutes integer NOT NULL DEFAULT 0,
 worked_minutes integer NOT NULL DEFAULT 0 CHECK (worked_minutes >= 0),
 leave_minutes integer NOT NULL DEFAULT 0 CHECK (leave_minutes >= 0),
 leave_type text, note text NOT NULL DEFAULT '',
 updated_by integer, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(employee_id,work_date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_month ON employee_attendance(work_date,employee_id);
CREATE TABLE IF NOT EXISTS employee_attendance_segments (
 id bigserial PRIMARY KEY, attendance_id bigint NOT NULL REFERENCES employee_attendance(id) ON DELETE CASCADE,
 segment_type text NOT NULL CHECK(segment_type IN ('work','break','leave')),
 start_time text NOT NULL, end_time text NOT NULL, leave_type text
);
CREATE TABLE IF NOT EXISTS employee_attendance_audit (
 id bigserial PRIMARY KEY, attendance_id bigint NOT NULL, employee_id integer NOT NULL,
 old_value jsonb, new_value jsonb NOT NULL, changed_by integer,
 changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS employee_payroll (
 id bigserial PRIMARY KEY, employee_id integer NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
 pay_month text NOT NULL CHECK(pay_month ~ '^\d{4}-\d{2}$'),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','paid')),
 source_mode text NOT NULL DEFAULT 'attendance' CHECK(source_mode IN ('attendance','manual')),
 work_days numeric(7,2) NOT NULL DEFAULT 0, leave_hours numeric(9,2) NOT NULL DEFAULT 0,
 base_cents bigint NOT NULL DEFAULT 0, allowance_cents bigint NOT NULL DEFAULT 0,
 bonus_cents bigint NOT NULL DEFAULT 0, overtime_cents bigint NOT NULL DEFAULT 0,
 leave_deduct_cents bigint NOT NULL DEFAULT 0, labor_cents bigint NOT NULL DEFAULT 0,
 health_cents bigint NOT NULL DEFAULT 0, other_deduct_cents bigint NOT NULL DEFAULT 0,
 gross_cents bigint NOT NULL DEFAULT 0, net_cents bigint NOT NULL DEFAULT 0,
 notes text NOT NULL DEFAULT '', adjustment_reason text NOT NULL DEFAULT '',
 snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 approved_at timestamptz, approved_by integer,
 paid_at timestamptz, paid_by integer,
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by integer,
 UNIQUE(employee_id,pay_month)
);
CREATE TABLE IF NOT EXISTS employee_payroll_audit (
 id bigserial PRIMARY KEY, payroll_id bigint NOT NULL,
 old_value jsonb, new_value jsonb NOT NULL, changed_by integer,
 changed_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
