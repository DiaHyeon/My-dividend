-- Migration: 011_anti_spam_velocity_guard.sql
-- คำสั่ง SQL สำหรับสร้าง Trigger จำกัดอัตราความเร็วการบันทึกธุรกรรม (Anti-Spam Velocity Guard)
-- 1. ป้องกันไม่ให้มีผู้ใช้หรือสคริปต์ยิงปั๊มข้อมูลธุรกรรมเกิน 500 รายการภายใน 24 ชั่วโมง
-- 2. ไม่มีเพดานตลอดชีพ (No Lifetime Cap) ทำให้ผู้ใช้งานทั่วไปสามารถสะสม DCA ได้ต่อเนื่อง 10-20+ ปีโดยไม่ติดขัด

-- สร้าง Function สำหรับตรวจนับจำนวนธุรกรรมในรอบ 24 ชั่วโมงของผู้ใช้งาน
CREATE OR REPLACE FUNCTION public.check_transaction_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_count INT;
BEGIN
  -- ดึง user_id ของเจ้าของสินทรัพย์
  SELECT user_id INTO v_user_id
  FROM public.assets
  WHERE id = NEW.asset_id;

  IF v_user_id IS NOT NULL THEN
    -- ตรวจสอบจำนวนธุรกรรมที่บันทึกโดยผู้ใช้รายนี้ในรอบ 24 ชั่วโมงที่ผ่านมา
    SELECT count(*) INTO v_count
    FROM public.transactions t
    JOIN public.assets a ON a.id = t.asset_id
    WHERE a.user_id = v_user_id
      AND t.created_at >= (now() - interval '24 hours');

    -- หากเกิน 500 รายการในรอบ 24 ชั่วโมง ให้ปฏิเสธการบันทึกทันทีเพื่อป้องกันสแปม
    IF v_count >= 500 THEN
      RAISE EXCEPTION 'Daily transaction limit reached (max 500 transactions per 24 hours). Please try again tomorrow.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ผูก Trigger เข้ากับตาราง transactions ก่อนการ INSERT ทุกครั้ง
DROP TRIGGER IF EXISTS trg_check_transaction_rate_limit ON public.transactions;

CREATE TRIGGER trg_check_transaction_rate_limit
  BEFORE INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_transaction_rate_limit();
