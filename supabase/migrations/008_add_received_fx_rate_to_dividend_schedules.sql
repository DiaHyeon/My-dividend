-- Migration: 008_add_received_fx_rate_to_dividend_schedules.sql
-- เพิ่มคอลัมน์ received_fx_rate ให้กับตาราง dividend_schedules เพื่อบันทึกอัตราแลกเปลี่ยนจริง ณ วันที่ยืนยันรับเงินปันผล ป้องกันยอดปันผลสะสมผันผวนตามเรทปัจจุบัน

ALTER TABLE public.dividend_schedules
  ADD COLUMN IF NOT EXISTS received_fx_rate NUMERIC(15, 4);

COMMENT ON COLUMN public.dividend_schedules.received_fx_rate IS 'อัตราแลกเปลี่ยน USD/THB จริง ณ วันที่ผู้ใช้กดยืนยันรับเงินปันผลเข้าบัญชี (NULL สำหรับงวดที่ยังเป็นประมาณการ)';
