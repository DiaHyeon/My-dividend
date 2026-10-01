-- Migration: 005_unified_schema_update.sql
-- คำสั่ง SQL รวมสำหรับอัปเดต Schema ของฐานข้อมูล Supabase Cloud ให้ครบถ้วนสมบูรณ์ 100%
-- รันคำสั่งทั้งหมดนี้ใน Supabase Dashboard > SQL Editor เพื่อรองรับทุกฟีเจอร์

-- 1. เพิ่มคอลัมน์ sector และ currency ให้กับตาราง assets
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS sector TEXT NOT NULL DEFAULT 'Other';
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'THB';

-- 2. เพิ่มคอลัมน์ exchange_rate ให้กับตาราง transactions (อัตราแลกเปลี่ยน THB=1.0000, USD=อัตราแลกเปลี่ยนจริง)
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(15, 4) NOT NULL DEFAULT 1.0000;

-- 3. เพิ่มคอลัมน์ is_special ให้กับตาราง dividend_schedules (สำหรับเงินปันผลพิเศษที่ไม่ต้องนำไป Forecast ซ้ำ)
ALTER TABLE public.dividend_schedules ADD COLUMN IF NOT EXISTS is_special BOOLEAN NOT NULL DEFAULT false;

-- 4. อัปเดต View view_asset_summary ให้ดึง sector และ currency ออกมาโดยอัตโนมัติ
-- (ต้อง DROP VIEW เดิมก่อนเพื่อป้องกัน Error 42P16 จากการแทรกคอลัมน์ใหม่ในตำแหน่งเดิม โดยข้อมูลจริงไม่สูญหาย)
DROP VIEW IF EXISTS public.view_asset_summary CASCADE;

CREATE VIEW public.view_asset_summary
WITH (security_invoker = true)
AS
WITH asset_calc AS (
  SELECT
    a.id,
    a.user_id,
    a.symbol,
    a.asset_type,
    a.sector,
    a.currency,
    a.current_price,
    a.tax_rate,
    a.is_archived,
    a.created_at,
    COALESCE(
      SUM(CASE WHEN t.type = 'BUY' THEN t.shares WHEN t.type = 'SELL' THEN -t.shares ELSE 0 END),
      0
    )::NUMERIC(15, 4) AS net_shares,
    COALESCE(
      SUM(CASE WHEN t.type = 'BUY' THEN t.shares ELSE 0 END),
      0
    )::NUMERIC(15, 4) AS total_buy_shares,
    COALESCE(
      SUM(CASE WHEN t.type = 'BUY' THEN t.shares * t.price_per_share ELSE 0 END),
      0
    )::NUMERIC(15, 4) AS total_buy_cost
  FROM public.assets a
  LEFT JOIN public.transactions t ON a.id = t.asset_id
  WHERE a.is_archived = false
  GROUP BY
    a.id,
    a.user_id,
    a.symbol,
    a.asset_type,
    a.sector,
    a.currency,
    a.current_price,
    a.tax_rate,
    a.is_archived,
    a.created_at
)
SELECT
  ac.id,
  ac.user_id,
  ac.symbol,
  ac.asset_type,
  ac.sector,
  ac.currency,
  ac.current_price,
  ac.tax_rate,
  ac.is_archived,
  ac.created_at,
  ac.net_shares,
  ac.net_shares AS net_holdings,
  CASE
    WHEN ac.total_buy_shares > 0 THEN ROUND((ac.total_buy_cost / ac.total_buy_shares), 4)
    ELSE 0.0000
  END::NUMERIC(15, 4) AS avg_cost,
  CASE
    WHEN ac.total_buy_shares > 0 THEN ROUND((ac.total_buy_cost / ac.total_buy_shares), 4)
    ELSE 0.0000
  END::NUMERIC(15, 4) AS weighted_average_cost,
  (
    ac.net_shares * CASE
      WHEN ac.total_buy_shares > 0 THEN ROUND((ac.total_buy_cost / ac.total_buy_shares), 4)
      ELSE 0.0000
    END
  )::NUMERIC(15, 4) AS total_cost,
  (ac.net_shares * ac.current_price)::NUMERIC(15, 4) AS market_value,
  (
    (ac.net_shares * ac.current_price) - (
      ac.net_shares * CASE
        WHEN ac.total_buy_shares > 0 THEN ROUND((ac.total_buy_cost / ac.total_buy_shares), 4)
        ELSE 0.0000
      END
    )
  )::NUMERIC(15, 4) AS unrealized_pl,
  CASE
    WHEN (
      ac.net_shares * CASE
        WHEN ac.total_buy_shares > 0 THEN ROUND((ac.total_buy_cost / ac.total_buy_shares), 4)
        ELSE 0.0000
      END
    ) > 0 THEN ROUND(
      (
        (
          (ac.net_shares * ac.current_price) - (
            ac.net_shares * CASE
              WHEN ac.total_buy_shares > 0 THEN ROUND((ac.total_buy_cost / ac.total_buy_shares), 4)
              ELSE 0.0000
            END
          )
        ) / (
          ac.net_shares * CASE
            WHEN ac.total_buy_shares > 0 THEN ROUND((ac.total_buy_cost / ac.total_buy_shares), 4)
            ELSE 0.0000
          END
        )
      ) * 100,
      4
    )
    ELSE 0.0000
  END::NUMERIC(15, 4) AS unrealized_pl_percent
FROM asset_calc ac;

-- ให้สิทธิ์อ่าน View แก่ผู้ใช้ที่ล็อกอินและเดโม
GRANT SELECT ON public.view_asset_summary TO authenticated, anon;

