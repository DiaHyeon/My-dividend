-- Step 2: Database Migration Script for My dividend
-- Migration: 001_init.sql

-- 1. Create Assets Table
CREATE TABLE IF NOT EXISTS public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('STOCKS', 'FUNDS', 'CASH')),
  current_price NUMERIC(15, 4) NOT NULL DEFAULT 0.0000,
  tax_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.1000,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create Transactions Table
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
  shares NUMERIC(15, 4) NOT NULL CHECK (shares >= 0),
  price_per_share NUMERIC(15, 4) NOT NULL CHECK (price_per_share >= 0),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create Dividend Schedules Table
CREATE TABLE IF NOT EXISTS public.dividend_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  dpu NUMERIC(15, 4) NOT NULL DEFAULT 0.0000,
  xd_date DATE NOT NULL,
  payment_date DATE,
  is_projected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create View for Asset Summary (non-archived assets)
CREATE OR REPLACE VIEW public.view_asset_summary
WITH (security_invoker = true)
AS
WITH asset_calc AS (
  SELECT
    a.id,
    a.user_id,
    a.symbol,
    a.asset_type,
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

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dividend_schedules ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for assets (checking auth.uid() = user_id)
CREATE POLICY "Users can view their own assets"
  ON public.assets
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own assets"
  ON public.assets
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own assets"
  ON public.assets
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own assets"
  ON public.assets
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 7. RLS Policies for transactions (checking asset ownership where auth.uid() = user_id)
CREATE POLICY "Users can view their own transactions"
  ON public.transactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assets
      WHERE public.assets.id = transactions.asset_id
        AND public.assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own transactions"
  ON public.transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assets
      WHERE public.assets.id = transactions.asset_id
        AND public.assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own transactions"
  ON public.transactions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assets
      WHERE public.assets.id = transactions.asset_id
        AND public.assets.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assets
      WHERE public.assets.id = transactions.asset_id
        AND public.assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own transactions"
  ON public.transactions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assets
      WHERE public.assets.id = transactions.asset_id
        AND public.assets.user_id = auth.uid()
    )
  );

-- 8. RLS Policies for dividend_schedules (checking asset ownership where auth.uid() = user_id)
CREATE POLICY "Users can view their own dividend schedules"
  ON public.dividend_schedules
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assets
      WHERE public.assets.id = dividend_schedules.asset_id
        AND public.assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own dividend schedules"
  ON public.dividend_schedules
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assets
      WHERE public.assets.id = dividend_schedules.asset_id
        AND public.assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own dividend schedules"
  ON public.dividend_schedules
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assets
      WHERE public.assets.id = dividend_schedules.asset_id
        AND public.assets.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assets
      WHERE public.assets.id = dividend_schedules.asset_id
        AND public.assets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own dividend schedules"
  ON public.dividend_schedules
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assets
      WHERE public.assets.id = dividend_schedules.asset_id
        AND public.assets.user_id = auth.uid()
    )
  );

-- 9. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dividend_schedules TO authenticated;
GRANT SELECT ON public.view_asset_summary TO authenticated;
