-- Migration: 009_harden_rls_policies.sql
-- คำสั่ง SQL สำหรับกระชับสิทธิ์ Row Level Security (RLS) บน Supabase Cloud
-- 1. ป้องกันไม่ให้ Authenticated users สั่ง DELETE แคตตาล็อกกองทุนรวม thai_funds_catalog (อนุญาตเฉพาะ INSERT และ UPDATE)
-- 2. กระชับสิทธิ์ portfolio_snapshots ให้ผูกกับ auth.uid() = user_id อย่างเด็ดขาด และตัดสิทธิ์ anon ออกทั้งหมด

-- 1. ตาราง thai_funds_catalog
DROP POLICY IF EXISTS "Allow authenticated upsert to thai_funds_catalog" ON public.thai_funds_catalog;
DROP POLICY IF EXISTS "Allow authenticated insert to thai_funds_catalog" ON public.thai_funds_catalog;
DROP POLICY IF EXISTS "Allow authenticated update to thai_funds_catalog" ON public.thai_funds_catalog;

CREATE POLICY "Allow authenticated insert to thai_funds_catalog"
  ON public.thai_funds_catalog
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update to thai_funds_catalog"
  ON public.thai_funds_catalog
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 2. ตาราง portfolio_snapshots
DROP POLICY IF EXISTS "Users can manage their own portfolio snapshots" ON public.portfolio_snapshots;

CREATE POLICY "Users can manage their own portfolio snapshots"
  ON public.portfolio_snapshots
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT ALL ON public.portfolio_snapshots TO authenticated;
REVOKE ALL ON public.portfolio_snapshots FROM anon;
