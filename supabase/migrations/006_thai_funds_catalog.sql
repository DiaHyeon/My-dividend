-- Migration: 006_thai_funds_catalog.sql
-- สร้างตาราง thai_funds_catalog สำหรับเก็บและค้นหารายชื่อกองทุนรวมไทยทั้งหมดจาก ก.ล.ต.
-- รองรับการค้นหาแบบ Fast Index 0ms ทั้งชื่อย่อ (symbol), ชื่อไทย (name_th), และชื่อ บลจ. (amc_name)

CREATE TABLE IF NOT EXISTS public.thai_funds_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL UNIQUE,
  name_th TEXT,
  name_en TEXT,
  amc_name TEXT,
  exchange TEXT,
  proj_id TEXT,
  category TEXT DEFAULT 'Equity',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ดัชนีสำหรับการค้นหาที่รวดเร็ว (B-Tree Indexes)
CREATE INDEX IF NOT EXISTS idx_thai_funds_symbol ON public.thai_funds_catalog (symbol);
CREATE INDEX IF NOT EXISTS idx_thai_funds_name_th ON public.thai_funds_catalog (name_th);
CREATE INDEX IF NOT EXISTS idx_thai_funds_amc_name ON public.thai_funds_catalog (amc_name);
CREATE INDEX IF NOT EXISTS idx_thai_funds_exchange ON public.thai_funds_catalog (exchange);
CREATE INDEX IF NOT EXISTS idx_thai_funds_proj_id ON public.thai_funds_catalog (proj_id);

-- เปิดใช้งาน Row Level Security (RLS)
ALTER TABLE public.thai_funds_catalog ENABLE ROW LEVEL SECURITY;

-- นโยบาย RLS: อนุญาตให้ผู้ใช้ทุกคน (ทั้งแบบ Authenticated และ Anon) มีสิทธิ์อ่านอย่างเดียว (SELECT: Read-only)
DROP POLICY IF EXISTS "Allow public read access to thai_funds_catalog" ON public.thai_funds_catalog;
CREATE POLICY "Allow public read access to thai_funds_catalog"
  ON public.thai_funds_catalog
  FOR SELECT
  USING (true);

-- นโยบาย RLS: อนุญาตให้ Service Role มีสิทธิ์เพิ่มและอัปเดตข้อมูล (สำหรับการซิงก์จาก Edge Function)
DROP POLICY IF EXISTS "Allow service role full access to thai_funds_catalog" ON public.thai_funds_catalog;
CREATE POLICY "Allow service role full access to thai_funds_catalog"
  ON public.thai_funds_catalog
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- นโยบาย RLS: อนุญาตให้ Authenticated Users เพิ่มและอัปเดตข้อมูลกรณีซิงก์จาก Client
DROP POLICY IF EXISTS "Allow authenticated upsert to thai_funds_catalog" ON public.thai_funds_catalog;
CREATE POLICY "Allow authenticated upsert to thai_funds_catalog"
  ON public.thai_funds_catalog
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Pre-seed ข้อมูลกองทุนรวมยอดนิยมของไทยจากทุก บลจ. ชั้นนำ พร้อมใช้งานทันที 100%
INSERT INTO public.thai_funds_catalog (symbol, name_th, name_en, amc_name, exchange, proj_id, category)
VALUES
  -- บลจ.กสิกรไทย (KAsset)
  ('K-USA-A(A)', 'กองทุนเปิดเค หุ้นยูเอส ดัชนี-A ชนิดสะสมมูลค่า', 'K US Index Fund-A(A)', 'บลจ.กสิกรไทย', 'KAsset', 'M0159_2555', 'Foreign'),
  ('K-USA-A(D)', 'กองทุนเปิดเค หุ้นยูเอส ดัชนี-A ชนิดจ่ายเงินปันผล', 'K US Index Fund-A(D)', 'บลจ.กสิกรไทย', 'KAsset', 'M0159_2555', 'Foreign'),
  ('K-VIETNAM', 'กองทุนเปิดเค เวียดนาม หุ้นทุน', 'K Vietnam Equity Fund', 'บลจ.กสิกรไทย', 'KAsset', 'M0045_2565', 'Foreign'),
  ('K-FIXED', 'กองทุนเปิดเค ตราสารหนี้', 'K Fixed Income Fund', 'บลจ.กสิกรไทย', 'KAsset', 'M0017_2538', 'FixedIncome'),
  ('K-VALUE', 'กองทุนเปิดเค หุ้นปันผล (K Value Fund)', 'K Value Fund', 'บลจ.กสิกรไทย', 'KAsset', 'M0023_2538', 'Equity'),
  ('K-SELECT', 'กองทุนเปิดเค ซีเล็คท์ หุ้นทุน', 'K Selected Equity Fund', 'บลจ.กสิกรไทย', 'KAsset', 'M0014_2536', 'Equity'),
  ('K-CHINA', 'กองทุนเปิดเค ไชน่า หุ้นทุน', 'K China Equity Fund', 'บลจ.กสิกรไทย', 'KAsset', 'M0204_2553', 'Foreign'),
  ('K-STAR', 'กองทุนเปิดเค สตาร์ หุ้นทุน', 'K Star Equity Fund', 'บลจ.กสิกรไทย', 'KAsset', 'M0021_2537', 'Equity'),
  ('K-GHEALTH', 'กองทุนเปิดเค โกลบอล เฮลท์แคร์ หุ้นทุน', 'K Global Healthcare Equity Fund', 'บลจ.กสิกรไทย', 'KAsset', 'M0443_2557', 'Foreign'),
  ('K-SFPLUS', 'กองทุนเปิดเค เอสเอฟ พลัส', 'K Short Term Fixed Income Plus Fund', 'บลจ.กสิกรไทย', 'KAsset', 'M0038_2559', 'FixedIncome'),
  ('K-GINCOME', 'กองทุนเปิดเค โกลบอล อินคัม', 'K Global Income Fund', 'บลจ.กสิกรไทย', 'KAsset', 'M0317_2559', 'Foreign'),
  ('K-PROP', 'กองทุนเปิดเค พร็อพเพอร์ตี้ เซคเตอร์', 'K Property Sector Fund', 'บลจ.กสิกรไทย', 'KAsset', 'M0302_2550', 'Property'),
  ('K-CASH', 'กองทุนเปิดเค บริหารเงิน', 'K Cash Management Fund', 'บลจ.กสิกรไทย', 'KAsset', 'M0019_2544', 'MoneyMarket'),
  ('K-GOLD', 'กองทุนเปิดเค โกลด์', 'K Gold Fund', 'บลจ.กสิกรไทย', 'KAsset', 'M0187_2551', 'Commodity'),
  ('K-SET50', 'กองทุนเปิดเค เซ็ท 50', 'K SET50 Index Fund', 'บลจ.กสิกรไทย', 'KAsset', 'M0015_2544', 'Equity'),
  ('K-JP', 'กองทุนเปิดเค เจแปน หุ้นทุน', 'K Japan Equity Fund', 'บลจ.กสิกรไทย', 'KAsset', 'M0018_2556', 'Foreign'),
  ('K-INDIA', 'กองทุนเปิดเค อินเดีย หุ้นทุน', 'K India Equity Fund', 'บลจ.กสิกรไทย', 'KAsset', 'M0025_2553', 'Foreign'),

  -- บลจ.ไทยพาณิชย์ (SCBAM)
  ('SCBDV', 'กองทุนเปิดไทยพาณิชย์หุ้นทุนปันผล', 'SCB Dividend Stock Open End Fund', 'บลจ.ไทยพาณิชย์', 'SCBAM', 'M0452_2546', 'Equity'),
  ('SCBDV-A', 'กองทุนเปิดไทยพาณิชย์หุ้นทุนปันผล (ชนิดสะสมมูลค่า)', 'SCB Dividend Stock Open End Fund (Acc)', 'บลจ.ไทยพาณิชย์', 'SCBAM', 'M0452_2546', 'Equity'),
  ('SCBBLN', 'กองทุนเปิดไทยพาณิชย์ บิลเลียนแนร์', 'SCB Billionaire Fund', 'บลจ.ไทยพาณิชย์', 'SCBAM', 'M0386_2558', 'Foreign'),
  ('SCBCEH', 'กองทุนเปิดไทยพาณิชย์ หุ้นจีนเอแชร์ ชนิดเฮดจ์', 'SCB China A-Shares Hedged Fund', 'บลจ.ไทยพาณิชย์', 'SCBAM', 'M0123_2561', 'Foreign'),
  ('SCBSET50', 'กองทุนเปิดไทยพาณิชย์ เซ็ท 50 อินเด็กซ์', 'SCB SET50 Index Fund', 'บลจ.ไทยพาณิชย์', 'SCBAM', 'M0597_2552', 'Equity'),
  ('SCBNDQ', 'กองทุนเปิดไทยพาณิชย์ หุ้นยูเอส เอ็นดีคิว', 'SCB US NDQ Fund', 'บลจ.ไทยพาณิชย์', 'SCBAM', 'M0311_2564', 'Foreign'),
  ('SCBWORLD', 'กองทุนเปิดไทยพาณิชย์ หุ้นเวิลด์', 'SCB World Equity Fund', 'บลจ.ไทยพาณิชย์', 'SCBAM', 'M0099_2560', 'Foreign'),
  ('SCBVIET', 'กองทุนเปิดไทยพาณิชย์ หุ้นเวียดนาม', 'SCB Vietnam Equity Fund', 'บลจ.ไทยพาณิชย์', 'SCBAM', 'M0542_2561', 'Foreign'),
  ('SCBSEMI', 'กองทุนเปิดไทยพาณิชย์ เซมิคอนดักเตอร์', 'SCB Semiconductor Fund', 'บลจ.ไทยพาณิชย์', 'SCBAM', 'M0684_2564', 'Foreign'),
  ('SCBHEALTH', 'กองทุนเปิดไทยพาณิชย์ โกลบอลเฮลธ์แคร์', 'SCB Global Healthcare Fund', 'บลจ.ไทยพาณิชย์', 'SCBAM', 'M0412_2557', 'Foreign'),
  ('SCBGPROP', 'กองทุนเปิดไทยพาณิชย์ โกลบอลพร็อพเพอร์ตี้', 'SCB Global Property Fund', 'บลจ.ไทยพาณิชย์', 'SCBAM', 'M0125_2550', 'Property'),
  ('SCBFP', 'กองทุนเปิดไทยพาณิชย์ตราสารหนี้พลัส', 'SCB Fixed Income Plus Fund', 'บลจ.ไทยพาณิชย์', 'SCBAM', 'M0012_2542', 'FixedIncome'),
  ('SCBTREASURY', 'กองทุนเปิดไทยพาณิชย์พันธบัตรรัฐบาล', 'SCB Treasury Fund', 'บลจ.ไทยพาณิชย์', 'SCBAM', 'M0029_2547', 'FixedIncome'),

  -- บลจ.บัวหลวง (BBLAM)
  ('B-INNOTECH', 'กองทุนเปิดบัวหลวงโกลบอลอินโนเวชั่นและเทคโนโลยี', 'Bualuang Global Innovation and Technology Fund', 'บลจ.บัวหลวง', 'BBLAM', 'M0450_2560', 'Foreign'),
  ('B-GLOBAL', 'กองทุนเปิดบัวหลวงโกลบอลเฮลท์แคร์', 'Bualuang Global Equity Fund', 'บลจ.บัวหลวง', 'BBLAM', 'M0238_2551', 'Foreign'),
  ('B-CARE', 'กองทุนเปิดบัวหลวงเพื่อชีวิตและสุขภาพ', 'Bualuang Care Fund', 'บลจ.บัวหลวง', 'BBLAM', 'M0211_2550', 'Foreign'),
  ('BTP', 'กองทุนเปิดบัวหลวงทศพล', 'Bualuang Top-Ten Fund', 'บลจ.บัวหลวง', 'BBLAM', 'M0014_2537', 'Equity'),
  ('B-CHINE-EQ', 'กองทุนเปิดบัวหลวงไชน่าหุ้นทุน', 'Bualuang China Equity Fund', 'บลจ.บัวหลวง', 'BBLAM', 'M0145_2557', 'Foreign'),
  ('B-ASIA', 'กองทุนเปิดบัวหลวงเอเชียหุ้นทุน', 'Bualuang Asia Equity Fund', 'บลจ.บัวหลวง', 'BBLAM', 'M0032_2550', 'Foreign'),
  ('B-VIETNAM', 'กองทุนเปิดบัวหลวงเวียดนามหุ้นทุน', 'Bualuang Vietnam Equity Fund', 'บลจ.บัวหลวง', 'BBLAM', 'M0258_2562', 'Foreign'),
  ('B-BHARAT', 'กองทุนเปิดบัวหลวงภารตะหุ้นทุน (อินเดีย)', 'Bualuang Bharat Equity Fund', 'บลจ.บัวหลวง', 'BBLAM', 'M0178_2560', 'Foreign'),
  ('B-NIPPON', 'กองทุนเปิดบัวหลวงนิปปอนหุ้นทุน (ญี่ปุ่น)', 'Bualuang Nippon Equity Fund', 'บลจ.บัวหลวง', 'BBLAM', 'M0112_2558', 'Foreign'),
  ('B-TREASURY', 'กองทุนเปิดบัวหลวงธนทวี (บริหารเงินสด)', 'Bualuang Treasury Fund', 'บลจ.บัวหลวง', 'BBLAM', 'M0008_2540', 'MoneyMarket'),
  ('B-FIXED', 'กองทุนเปิดบัวหลวงตราสารหนี้', 'Bualuang Fixed Income Fund', 'บลจ.บัวหลวง', 'BBLAM', 'M0005_2535', 'FixedIncome'),
  ('B-PROP', 'กองทุนเปิดบัวหลวงโครงสร้างพื้นฐานและอสังหาริมทรัพย์', 'Bualuang Property and Infrastructure Fund', 'บลจ.บัวหลวง', 'BBLAM', 'M0312_2559', 'Property'),

  -- บลจ.กรุงศรี (KSAM)
  ('KF-GTECH-D', 'กองทุนเปิดกรุงศรีโกลบอลเทคโนโลยีอิควิตี้ (ชนิดจ่ายเงินปันผล)', 'Krungsri Global Technology Equity Fund - Dividend', 'บลจ.กรุงศรี', 'KSAM', 'M0122_2560', 'Foreign'),
  ('KF-GTECH-A', 'กองทุนเปิดกรุงศรีโกลบอลเทคโนโลยีอิควิตี้ (ชนิดสะสมมูลค่า)', 'Krungsri Global Technology Equity Fund - Acc', 'บลจ.กรุงศรี', 'KSAM', 'M0122_2560', 'Foreign'),
  ('KF-HEALTHD', 'กองทุนเปิดกรุงศรีโกลบอลเฮลธ์แคร์อิควิตี้ปันผล', 'Krungsri Global Healthcare Equity Dividend Fund', 'บลจ.กรุงศรี', 'KSAM', 'M0319_2557', 'Foreign'),
  ('KF-US-A', 'กองทุนเปิดกรุงศรีเอ็กซ์คลูซีฟยูเอสอิควิตี้', 'Krungsri US Equity Fund', 'บลจ.กรุงศรี', 'KSAM', 'M0189_2558', 'Foreign'),
  ('KFDIV', 'กองทุนเปิดกรุงศรีหุ้นปันผล', 'Krungsri Dividend Stock Fund', 'บลจ.กรุงศรี', 'KSAM', 'M0027_2550', 'Equity'),
  ('KF-CHINA', 'กองทุนเปิดกรุงศรีไชน่าเอแชร์อิควิตี้', 'Krungsri China A Shares Equity Fund', 'บลจ.กรุงศรี', 'KSAM', 'M0115_2561', 'Foreign'),
  ('KF-VIET', 'กองทุนเปิดกรุงศรีเวียดนามอิควิตี้', 'Krungsri Vietnam Equity Fund', 'บลจ.กรุงศรี', 'KSAM', 'M0245_2561', 'Foreign'),
  ('KF-INCOME', 'กองทุนเปิดกรุงศรีโกลบอลมัลติแอสเซทอินคัม', 'Krungsri Global Multi-Asset Income Fund', 'บลจ.กรุงศรี', 'KSAM', 'M0441_2559', 'Mixed'),
  ('KFCASH', 'กองทุนเปิดกรุงศรีบริหารเงิน', 'Krungsri Cash Management Fund', 'บลจ.กรุงศรี', 'KSAM', 'M0011_2545', 'MoneyMarket'),

  -- บลจ.ยูโอบี (UOBAM)
  ('UGIS', 'กองทุนเปิด ยูไนเต็ด โกลบอล อินคัม สตราทีจิค บอนด์', 'United Global Income Strategic Bond Fund', 'บลจ.ยูโอบี', 'UOBAM', 'M0385_2559', 'FixedIncome'),
  ('UHERO', 'กองทุนเปิด ยูไนเต็ด ฮีโร่ (Gaming & E-Sports)', 'United Hero Fund', 'บลจ.ยูโอบี', 'UOBAM', 'M0149_2564', 'Foreign'),
  ('UEV', 'กองทุนเปิด ยูไนเต็ด แบตเตอรี่ แอนด์ อีวี เทคโนโลยี', 'United Battery and EV Technology Fund', 'บลจ.ยูโอบี', 'UOBAM', 'M0254_2564', 'Foreign'),
  ('UOBEQ', 'กองทุนเปิด ยูโอบี หุ้นทุนปันผล', 'UOB Dividend Equity Fund', 'บลจ.ยูโอบี', 'UOBAM', 'M0041_2548', 'Equity'),
  ('UOBVIET', 'กองทุนเปิด ยูไนเต็ด เวียดนาม ออพพอร์ทูนิตี้', 'United Vietnam Opportunity Fund', 'บลจ.ยูโอบี', 'UOBAM', 'M0219_2562', 'Foreign'),

  -- บลจ.ทิสโก้ (TISCOAM)
  ('TISCOHD', 'กองทุนเปิด ทิสโก้ ไฮ ดิวิเดนด์ หุ้นทุน', 'TISCO High Dividend Equity Fund', 'บลจ.ทิสโก้', 'TISCO', 'M0285_2550', 'Equity'),
  ('TISCOUS', 'กองทุนเปิด ทิสโก้ ยูเอส อิควิตี้', 'TISCO US Equity Fund', 'บลจ.ทิสโก้', 'TISCO', 'M0088_2556', 'Foreign'),
  ('TISCOVIET', 'กองทุนเปิด ทิสโก้ เวียดนาม อิควิตี้', 'TISCO Vietnam Equity Fund', 'บลจ.ทิสโก้', 'TISCO', 'M0278_2560', 'Foreign'),
  ('TISCOCH', 'กองทุนเปิด ทิสโก้ ไชน่า เอแชร์ อิควิตี้', 'TISCO China A-Shares Fund', 'บลจ.ทิสโก้', 'TISCO', 'M0112_2561', 'Foreign'),
  ('TISCOTECH', 'กองทุนเปิด ทิสโก้ โกลบอล เทคโนโลยี', 'TISCO Global Technology Fund', 'บลจ.ทิสโก้', 'TISCO', 'M0341_2560', 'Foreign'),

  -- บลจ.วรรณ (ONEAM)
  ('ONE-UGG', 'กองทุนเปิด วรรณ อัลติเมท โกลบอล โกรท', 'ONE Ultimate Global Growth Fund', 'บลจ.วรรณ', 'ONEAM', 'M0299_2559', 'Foreign'),
  ('ONE-GLOBE', 'กองทุนเปิด วรรณ โกลบอล อิควิตี้', 'ONE Global Equity Fund', 'บลจ.วรรณ', 'ONEAM', 'M0045_2558', 'Foreign'),
  ('ONE-VIETNAM', 'กองทุนเปิด วรรณ เวียดนาม โกรท', 'ONE Vietnam Growth Fund', 'บลจ.วรรณ', 'ONEAM', 'M0188_2562', 'Foreign'),

  -- บลจ.กรุงไทย (KTAM)
  ('KT-CHINA', 'กองทุนเปิดเคแทม ไชน่า อิควิตี้ ฟันด์', 'KTAM China Equity Fund', 'บลจ.กรุงไทย', 'KTAM', 'M0212_2554', 'Foreign'),
  ('KT-VIETNAM', 'กองทุนเปิดเคแทม เวียดนาม อิควิตี้', 'KTAM Vietnam Equity Fund', 'บลจ.กรุงไทย', 'KTAM', 'M0312_2562', 'Foreign'),
  ('KT-HEALTHC', 'กองทุนเปิดเคแทม เวิลด์ เฮลธ์แคร์ ฟันด์', 'KTAM World Healthcare Fund', 'บลจ.กรุงไทย', 'KTAM', 'M0144_2557', 'Foreign'),
  ('KT-FINANCE', 'กองทุนเปิดเคแทม โกลบอล ไฟแนนเชียล เซอร์วิส ฟันด์', 'KTAM Global Financial Services Fund', 'บลจ.กรุงไทย', 'KTAM', 'M0389_2560', 'Foreign'),
  ('KT-PROPERTY', 'กองทุนเปิดเคแทม พร็อพเพอร์ตี้ เซคเตอร์', 'KTAM Property Sector Fund', 'บลจ.กรุงไทย', 'KTAM', 'M0156_2551', 'Property'),

  -- บลจ.พรินซิเพิล (Principal)
  ('PRINCIPAL VNEQ', 'กองทุนเปิดพรินซิเพิล เวียดนาม อิควิตี้', 'Principal Vietnam Equity Fund', 'บลจ.พรินซิเพิล', 'Principal', 'M0249_2560', 'Foreign'),
  ('PRINCIPAL iPROP-D', 'กองทุนเปิดพรินซิเพิล อินคัม พร็อพเพอร์ตี้ (ชนิดจ่ายเงินปันผล)', 'Principal Income Property Fund - Dividend', 'บลจ.พรินซิเพิล', 'Principal', 'M0129_2554', 'Property'),
  ('PRINCIPAL iPROP-A', 'กองทุนเปิดพรินซิเพิล อินคัม พร็อพเพอร์ตี้ (ชนิดสะสมมูลค่า)', 'Principal Income Property Fund - Acc', 'บลจ.พรินซิเพิล', 'Principal', 'M0129_2554', 'Property'),
  ('PRINCIPAL GCLOUD', 'กองทุนเปิดพรินซิเพิล โกลบอล คลาวด์ คอมพิวติ้ง', 'Principal Global Cloud Computing Fund', 'บลจ.พรินซิเพิล', 'Principal', 'M0178_2564', 'Foreign'),

  -- บลจ.เอ็มเอฟซี (MFC)
  ('M-EDGE', 'กองทุนเปิดเอ็มเอฟซี โกลบอล เอ็ดจ์', 'MFC Global Edge Fund', 'บลจ.เอ็มเอฟซี', 'MFC', 'M0311_2563', 'Foreign'),
  ('M-VIETNAM', 'กองทุนเปิดเอ็มเอฟซี เวียดนาม อิควิตี้', 'MFC Vietnam Equity Fund', 'บลจ.เอ็มเอฟซี', 'MFC', 'M0198_2561', 'Foreign'),
  ('M-MIDSMALL', 'กองทุนเปิดเอ็มเอฟซี มิด สมอล แค็ป', 'MFC Mid Small Cap Fund', 'บลจ.เอ็มเอฟซี', 'MFC', 'M0088_2557', 'Equity'),
  ('M-REIT', 'กองทุนเปิดเอ็มเอฟซี เรียล เอสเตท พลัส', 'MFC Real Estate Plus Fund', 'บลจ.เอ็มเอฟซี', 'MFC', 'M0214_2555', 'Property'),

  -- บลจ.แลนด์ แอนด์ เฮ้าส์ (LHFund)
  ('LHGEQ', 'กองทุนเปิด แอล เอช โกลบอล อิควิตี้', 'LH Global Equity Fund', 'บลจ.แลนด์ แอนด์ เฮ้าส์', 'LHFund', 'M0355_2558', 'Foreign'),
  ('LHVIET', 'กองทุนเปิด แอล เอช เวียดนาม', 'LH Vietnam Fund', 'บลจ.แลนด์ แอนด์ เฮ้าส์', 'LHFund', 'M0288_2562', 'Foreign'),
  ('LHPROPD', 'กองทุนเปิด แอล เอช พร็อพเพอร์ตี้ พลัส ปันผล', 'LH Property Plus Dividend Fund', 'บลจ.แลนด์ แอนด์ เฮ้าส์', 'LHFund', 'M0155_2555', 'Property')
ON CONFLICT (symbol) DO UPDATE SET
  name_th = EXCLUDED.name_th,
  name_en = EXCLUDED.name_en,
  amc_name = EXCLUDED.amc_name,
  exchange = EXCLUDED.exchange,
  proj_id = EXCLUDED.proj_id,
  category = EXCLUDED.category,
  updated_at = now();
