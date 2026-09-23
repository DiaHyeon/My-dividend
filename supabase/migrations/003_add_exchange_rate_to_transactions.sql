-- Migration: 003_add_exchange_rate_to_transactions.sql
-- เพิ่มคอลัมน์ exchange_rate ให้กับตาราง transactions เพื่อบันทึกอัตราแลกเปลี่ยน ณ วันที่ทำรายการ (THB=1.0000, USD=อัตราแลกเปลี่ยนจริง)

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(15, 4) NOT NULL DEFAULT 1.0000;

COMMENT ON COLUMN public.transactions.exchange_rate IS 'อัตราแลกเปลี่ยนเทียบกับเงินบาท (THB) ณ วันที่ทำรายการ (THB = 1.0000, USD = อัตราแลกเปลี่ยน USD/THB)';
