-- Migration: 010_secure_thai_funds_catalog.sql
-- คำสั่ง SQL สำหรับกระชับสิทธิ์ Row Level Security (RLS) ตาราง thai_funds_catalog
-- 1. ลบนโยบายที่อนุญาตให้ Authenticated users สั่ง INSERT และ UPDATE ออกอย่างถาวร
-- 2. อนุญาตให้เฉพาะสิทธิ์ SELECT (อ่านอย่างเดียว) สำหรับผู้ใช้งานทุกคน (public, authenticated, anon)
-- 3. การ INSERT/UPDATE จะทำได้ผ่าน Supabase Service Role (Edge Function หลังบ้าน) เท่านั้น

-- ลบนโยบายการเขียนเดิมของ authenticated users
DROP POLICY IF EXISTS "Allow authenticated upsert to thai_funds_catalog" ON public.thai_funds_catalog;
DROP POLICY IF EXISTS "Allow authenticated insert to thai_funds_catalog" ON public.thai_funds_catalog;
DROP POLICY IF EXISTS "Allow authenticated update to thai_funds_catalog" ON public.thai_funds_catalog;

-- บังคับเปิด RLS บนตาราง thai_funds_catalog
ALTER TABLE public.thai_funds_catalog ENABLE ROW LEVEL SECURITY;

-- นโยบายให้อ่านได้อย่างเดียวสำหรับทุกคน
DROP POLICY IF EXISTS "Allow public read on thai_funds_catalog" ON public.thai_funds_catalog;
CREATE POLICY "Allow public read on thai_funds_catalog"
  ON public.thai_funds_catalog
  FOR SELECT
  TO public
  USING (true);

-- ถอดสิทธิ์การเขียนและอนุญาตเฉพาะการอ่านแก่ผู้ใช้ทั่วไป
REVOKE INSERT, UPDATE, DELETE ON public.thai_funds_catalog FROM authenticated, anon, public;
GRANT SELECT ON public.thai_funds_catalog TO authenticated, anon;
