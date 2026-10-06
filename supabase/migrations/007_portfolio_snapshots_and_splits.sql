-- Migration: 007_portfolio_snapshots_and_splits.sql
-- คำสั่ง SQL สำหรับบันทึกสถานะการแตกพาร์ลงตาราง assets และเพิ่มตาราง portfolio_snapshots สำหรับเก็บประวัติผลตอบแทนพอร์ตจริง

-- 1. เพิ่มคอลัมน์ last_split_date ให้กับตาราง assets (จัดเก็บวันที่แตกพาร์ล่าสุด เช่น '2024-06-10')
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS last_split_date TEXT DEFAULT NULL;

-- 2. สร้างตาราง portfolio_snapshots สำหรับบันทึกประวัติมูลค่าพอร์ตสิ้นวัน
CREATE TABLE IF NOT EXISTS public.portfolio_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  total_market_value NUMERIC(15, 4) NOT NULL DEFAULT 0.0000,
  total_cost NUMERIC(15, 4) NOT NULL DEFAULT 0.0000,
  unrealized_pl NUMERIC(15, 4) NOT NULL DEFAULT 0.0000,
  unrealized_pl_percent NUMERIC(15, 4) NOT NULL DEFAULT 0.0000,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, snapshot_date)
);

-- 3. เปิดใช้งาน Row Level Security (RLS) สำหรับ portfolio_snapshots
ALTER TABLE public.portfolio_snapshots ENABLE ROW LEVEL SECURITY;

-- 4. กำหนดสิทธิ์ RLS สำหรับผู้ใช้ที่ล็อกอิน (แยกพอร์ตเด็ดขาดด้วย auth.uid() = user_id)
DROP POLICY IF EXISTS "Users can manage their own portfolio snapshots" ON public.portfolio_snapshots;

CREATE POLICY "Users can manage their own portfolio snapshots"
  ON public.portfolio_snapshots
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. ให้สิทธิ์การใช้งานเฉพาะ authenticated
GRANT ALL ON public.portfolio_snapshots TO authenticated;
REVOKE ALL ON public.portfolio_snapshots FROM anon;
