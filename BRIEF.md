# Project Brief: My dividend
Technical specification and system architecture document for the My dividend application, serving as the Single Source of Truth for development on ANTIGRAVITY IDE.

---

## 1. Project Overview
- **Project Name**: My dividend
- **Target Platforms**: Android Mobile (tested and previewed via Expo Go) and Web Preview
- **Core Stack**: Expo SDK 57 (React Native 0.86, React 19), TypeScript, Supabase (PostgreSQL, Row Level Security)
- **Primary Goal**: A streamlined, minimalist Dividend Tracker & Holding application designed specifically for Buy & Hold investors, categorizing 3 primary asset classes (Stocks, Mutual Funds, Cash/Fixed Income). It features 12-month net dividend and interest forecasting after withholding tax with automated rolling schedule renewals, advance ex-dividend (XD) reminders, real-time cross-tab state synchronization, authentic benchmark performance comparisons, automated US and Thai (SET) stock lookups with latest closing prices, Thai mutual fund NAV and dividend history integration via SEC Open API v2, and dual-currency purchase recording (USD to THB real-time conversion).

---

## 2. Dependency Audit & Environment Status
| Library | Role & Functionality | Status |
| :--- | :--- | :--- |
| `@supabase/supabase-js` | Database, Authentication, and Edge Functions connectivity | [x] Installed & Active |
| `@react-native-async-storage/async-storage` | Local client storage for Auth sessions, Privacy Mode, and Goal settings | [x] Installed & Active |
| `expo-notifications` | Local notifications on Android (XD ex-dividend reminders) | [x] Installed & Active (with Expo Go patch) |
| `react-native-gifted-charts`, `react-native-svg` & `expo-linear-gradient` | Interactive Bar Charts, Area Sparklines, and Donut Pie Charts | [x] Installed & Active |
| `react-native-safe-area-context` | Screen notch and Safe Area management for Android & iOS | [x] Installed & Active |
| `@expo/vector-icons` | UI icons and Material Floating Action Button (Ionicons) | [x] Installed & Active |
| `@expo/ngrok` | Expo Tunnel proxy for previewing over office/institutional WiFi | [x] Installed & Active |
| `expo-document-picker` | Native file picker for CSV portfolio imports (Android & Web) | [x] Installed & Active |
| `papaparse` & `@types/papaparse` | Lightweight pure-JavaScript CSV parser | [x] Installed & Active |

### Environment Variables (.env)
```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# SEC_API_KEY is securely configured on Supabase Edge Function Secrets (never exposed to client bundle)
```

---

## 3. Database Architecture (Supabase PostgreSQL)
### Data Types & Constraints
- Financial figures, share quantities, and unit prices must strictly use `NUMERIC(15, 4)`. Never use `FLOAT` or `REAL` to prevent floating-point precision inaccuracies.
- The `transactions` table must include a `CHECK (shares >= 0)` constraint to prevent negative share balances.
- Soft Delete (`is_archived boolean default false`) is used instead of hard deletes to preserve historical dividend payment records.
- Every table has Row Level Security (RLS) enabled with policies strictly enforcing user data isolation (`auth.uid() = user_id`).

### Core Table Schemas
- `assets`: Manages asset master records
  - Fields: `id` (uuid, PK), `user_id` (uuid), `symbol` (text), `asset_type` (STOCKS | FUNDS | CASH), `sector` (text, default 'Other'), `currency` (text, default 'THB'), `current_price` (numeric(15,4)), `tax_rate` (numeric(15,4), default 0.1000), `last_split_date` (text, nullable), `is_archived` (boolean), `created_at` (timestamptz)
- `transactions`: Buy and deposit transaction logs
  - Fields: `id` (uuid, PK), `asset_id` (uuid, FK), `type` (BUY | SELL), `shares` (numeric(15,4)), `price_per_share` (numeric(15,4)), `transaction_date` (date), `exchange_rate` (numeric(15,4), default 1.0000)
  - Anti-Spam Velocity Guard: Trigger `trg_check_transaction_rate_limit` (`011_anti_spam_velocity_guard.sql`) limits transactions to 500 inserts per 24 hours per user without lifetime caps, protecting Supabase storage from automated spam while preserving unlimited multi-decade Buy & Hold DCA growth. Bulk CSV imports are similarly guarded by `MAX_CSV_IMPORT_ROWS = 500`.
- `dividend_schedules`: Dividend payment and projection schedules
  - Fields: `id` (uuid, PK), `asset_id` (uuid, FK), `dpu` (numeric(15,4)), `xd_date` (date), `payment_date` (date, nullable), `is_projected` (boolean), `is_special` (boolean, default false), `received_fx_rate` (numeric(15,4), nullable)
- `thai_funds_catalog`: Master catalog of all registered Thai mutual funds and share classes (5,790+ records from SEC Open API)
  - Fields: `id` (uuid, PK), `symbol` (text, unique), `name_th` (text), `name_en` (text), `amc_name` (text), `exchange` (text), `proj_id` (text), `category` (text), `created_at` (timestamptz), `updated_at` (timestamptz)
  - Indexes: B-Tree indexes on `symbol`, `name_th`, `amc_name`, `exchange`, and `proj_id` for instant sub-20ms multi-field search.
  - RLS: Strictly read-only (`SELECT`) for all clients (public, authenticated, anon); client `INSERT`, `UPDATE`, and `DELETE` are strictly prohibited (`010_secure_thai_funds_catalog.sql`); periodic catalog sync is executed securely via Supabase Edge Function `stock-proxy` using server-side `SUPABASE_SERVICE_ROLE_KEY` to guarantee complete immunity against catalog tampering.
- `portfolio_snapshots`: Daily portfolio valuation checkpoints for authentic performance curves over time
  - Fields: `id` (uuid, PK), `user_id` (uuid, FK), `snapshot_date` (date), `total_market_value` (numeric(15,4)), `total_cost` (numeric(15,4)), `unrealized_pl` (numeric(15,4)), `unrealized_pl_percent` (numeric(15,4)), `created_at` (timestamptz)
  - Constraint: `UNIQUE (user_id, snapshot_date)`
  - RLS: Enabled for authenticated user sessions, strictly enforcing `auth.uid() = user_id` with `anon` access revoked (`009_harden_rls_policies.sql`).
- `view_asset_summary` (SQL View): Automatically computes net remaining shares (`net_shares`), weighted average cost (`weighted_average_cost`), total market value (`market_value`), total cost basis (`total_cost`), and Unrealized P/L directly in the database engine.

---

## 4. Key Features & Implementation Details

### 4.1 Dashboard & Navigation Structure
- **Navigation Tabs**: Standardized international naming across the bottom navigation bar:
  - `Overview` (Dashboard screen): Streamlined minimal cashflow hub containing net worth hero card, compact 3-category summary cards, upcoming payday radar, annual cashflow bar chart with year selector and dropdown filter, and passive income goal card. Redundant bottom asset lists are omitted in favor of dedicated bottom tabs.
  - `Portfolio`: Portfolio asset allocation donut pie chart, sector breakdown, and cumulative performance benchmark comparison.
  - `Holdings`: Dedicated dual-view screen for holdings management with sparkline charts, and transaction history timeline with minimal dropdown filters.
- **Minimal Hero Net Worth Card (`HeroNetWorthCard.tsx`)**:
  - Compact FinTech aesthetic with ~30% height reduction (~110px saved).
  - Inline cashflow header pairing a 15px cash icon with right-aligned projected annual inflow.
  - Streamlined 38px 3-column dual yield subrow (`เฉลี่ยต่อเดือน`, `Current Yield`, `Yield on Cost 🚀`).
  - Zero-jitter layout guarantees with static top row labels, frameless Privacy Mode eye toggle, and stable `minHeight` bounds.
- **Compact Category Summary Cards**: Grouped into 3 distinct asset classes:
  - Stocks (`STOCKS` - Blue theme `#3B82F6`)
  - Mutual Funds (`FUNDS` - Purple theme `#8B5CF6`)
  - Digital Savings & Fixed Income (`CASH` - Emerald theme `#10B981`)
  - **Compact 2-Row Layout (~50% Height Reduction)**:
    - **Row 1**: Category icon (24px) + title + count `(X)` + P/L badge + Allocation % + subtle `chevron-forward` tap indicator (tap to open Segment breakdown modal).
    - **Row 2**: Total market value (left) + annual inflow & YoC/Yield (right).
    - **Row 3**: Slim 3px colored progress bar.
    - **Quick Portfolio Navigation**: Section header includes `ดูพอร์ตเต็ม →` button for immediate transition to the `Portfolio` tab.

---

### 4.2 Dividend Forecasting Engine (Yearly Bar Chart & Rolling Horizon)
- **Year Selection & Rolling 12M Horizon**: Visualizes annual passive cashflow across 12 calendar months (Jan–Dec for selected calendar year), defaulting automatically to the current calendar year (`new Date().getFullYear()`) upon load with instant arrow navigation (`[ ‹ ] ปี 2026 (ปีนี้) [ › ]`) and quick modal picker, with full support for historical years, future projections, and Rolling 12-Month Forward Horizon (`Rolling 12M`).
- **Unified Single-Row Filter Bar**:
  - **Left**: Minimalist Dropdown button (`[ 🪙 ทั้งหมด ▾ ]` / `[ 📈 เฉพาะปันผล ▾ ]` / `[ 💵 เฉพาะดอกเบี้ย ▾ ]`) with bottom sheet modal picker and checkmarks.
  - **Right**: Compact Year Selector pill with prev/next arrows (`[ ‹ ]  ปี 2026 (ปีนี้)  [ › ]`) and tap-to-pick modal.
- **Cross-Year Collision & Double-Counting Elimination**: Each monthly bar maps strictly to a unique year-month key (`payoutMonthKey = YYYY-MM`), ensuring dividend distributions occurring in the same named month across different years never collide or inflate.
- **Status-Differentiated Bar Chart (ข้อ 3 แบบ A)**:
  - **Received Months (รับแล้ว)**: Deep emerald solid fill (`#059669`) for past months with actual payouts.
  - **Current Month (เดือนปัจจุบัน)**: Emerald glowing track with border (`#059669`), rounded pill label, and `▲ Now` badge.
  - **Projected Months (รอรับ/คาดการณ์)**: Soft mint emerald fill (`#6EE7B7`) for upcoming future projections.
  - **Header Metrics**: Displays full year total, monthly average (`เฉลี่ย ฿XX,XXX/ด.`), and separate breakdown of `รับแล้ว ฿XX,XXX` • `รอรับ ฿XX,XXX` for the active year.
- **Net Dividend Formula**:
  $$\text{Net Inflow} = \text{Shares} \times \text{DPU} \times (1 - \text{tax\_rate})$$
  Taxes are calculated per asset (Thai stocks default to 10% `0.1000`, US stocks default to 15% `0.1500` under W-8BEN, Thai bank interest defaults to 0% or 15%, or custom user overrides).
- **Strict XD Cutoff Logic**: Includes only share lots acquired before the ex-dividend date (`transaction_date < xd_date`).
- **Interactive Inspection Modal**: Monthly bar selection opens a modal detailing individual paying assets for that specific month with clear badges (`[Dividend]` vs `[Interest]`, `[Received]`, `[Special]`) and tap-to-adjust integration.

---

### 4.2.1 Automated Dividend Forecasting & Non-Dividend Stocks
- **Automated Historical Analysis**: When selecting a stock in the Add Asset modal, `stockService.ts` queries historical dividend distributions via the Supabase Edge Function to determine:
  - **Latest DPU**: Automatically pre-fills as the default dividend per unit.
  - **Payment Frequency**: Analyzes whether the distribution is Quarterly (4x), Semi-annual (2x), or Monthly (12x).
  - **Annual Projected DPU**: Calculated as $\text{Latest DPU} \times \text{Frequency}$ and displayed in an analytical highlight badge.
  - **Multi-Cycle Schedule Creation**: Automatically projects ex-dividend dates over the next 12 months and inserts them into `dividend_schedules`.
- **Purchase Date Input & Live Dividend Estimation Preview (`AddAssetModal.tsx`)**:
  - **Custom Purchase Date**: Explicit purchase date input (defaults to current date `YYYY-MM-DD`, freely editable) stored directly into `transactions.transaction_date`.
  - **Compact Minimal Form Layout (~25% Height Reduction)**:
    - **Row 1**: Shares & Cost Price in a side-by-side 50/50 split (`[จำนวนหุ้น] | [ราคาต้นทุน]`).
    - **Row 2**: Market Price & Purchase Date side-by-side (`[ราคาตลาด] | [วันที่เข้าซื้อ 📅]`).
    - **Row 3**: Expected DPU & Expected XD Date side-by-side (`[ปันผล/หุ้น] | [วัน XD คาดการณ์ 📅]`).
    - **Integrated Calendar Picker Overlay**: Built-in pure React Native modal calendar with month navigation and quick presets (`วันนี้`, `เมื่อวาน`, `ต้นเดือนนี้`, `1 สัปดาห์ก่อน` for purchases; `+30 วัน`, `+60 วัน`, `+90 วัน`, `สิ้นเดือนนี้` for XD dates).
    - **Unified Smart Dividend Card**: Merges historical analysis and forward-looking calculation into a single compact card with frequency badge, remaining payouts this year (strict XD cutoff), and full annual run-rate.
    - **Compact Withholding Tax Selector**: Inline percentage input (`[ 10 ] %`) paired with quick preset pills (`[ 10% หุ้นไทย ]  [ 15% US ]  [ 0% กองทุน/ยกเว้น ]`).
  - **Live Multiplier & Tax Deduction**: Multiplying total shares by DPU in real time, calculating gross and net payouts after withholding tax (10% Thai, 15% US, or custom).
  - **Remaining Payouts This Year (Strict XD Cutoff)**: Dynamically checks remaining projected XD dates in the purchase year that occur on or after the purchase date. Payouts whose XD occurred prior to purchase are automatically excluded from the current year's expected total.
  - **Dual Perspective**: Highlights both "Remaining Payouts This Year" (actual cashflow expected for the rest of the year) and "Full Annual Run-Rate" (for complete subsequent cycles).
  - **Minimal Review & Confirmation Step before Saving**: Prior to executing the database write, a clean 2-second confirmation overlay displays the total investment volume (highlighted boldly), asset symbol, shares/deposit amount, price, transaction date, and projected dividend, with `[กลับไปแก้ไข]` and `[ยืนยันบันทึก]` buttons to prevent careless entry errors while maintaining a fast, frictionless flow.
- **Non-Dividend Paying Stocks (Growth Stocks)**:
  - Defaults DPU to `0.0000`.
  - Displays a clean informational badge: `ℹ️ No dividend distribution history (Growth / Non-dividend)`.
  - Tracks cost, current price, and unrealized gain/loss normally without generating empty dividend schedule clutter.

### 4.2.2 Dividend Calculation Integrity, FX Locking, and Learned Payday Radar
- **Foreign Dividend Currency Locking (`received_fx_rate`)**:
  - Persists `received_fx_rate` as `NUMERIC(15, 4)` in `dividend_schedules` when a foreign dividend is confirmed or reaches payday.
  - Eliminates live exchange rate fluctuations for past realized cashflow, ensuring lifetime cumulative dividends remain permanent and stable.
- **Payday Auto-Lock for Passive Investors (`autoLockPastForeignDividendRates`)**:
  - Automatically locks `received_fx_rate` using the day's exchange rate and sets `is_projected: false` during daily price sync and dashboard load when `payment_date <= today`.
  - Guarantees authentic past cashflow retention without requiring manual confirmation clicks, while preserving full manual adjustment capabilities via `AdjustDividendModal.tsx`.
- **Adaptive Learned Payday Lag (`computeLearnedPayoutLag`)**:
  - Calculates asset-specific median lag between `xd_date` and `payment_date` (filtered to 5–45 days) from historical schedules.
  - Applies `learnedLagDays` to `estimatePayoutDate`, accurately reflecting real market behavior (e.g. Thai banks ~30 days, US ETFs ~7–14 days) instead of static hardcoded offsets.
- **Bank Deposit Interest Frequency Detection (`detectCashFrequency`)**:
  - Determines cash deposit interest frequency strictly by analyzing median month gaps between schedule dates (1mo = MONTHLY, 6mo = SEMI_ANNUAL, 12mo = ANNUAL).
  - Eliminates naive schedule row-counting bugs, preventing dividend inflation across multi-year schedules.
- **Special Dividend Forward Yield Isolation**:
  - Separates regular sustainable dividends (`projectedAnnualRegularNetDividend`) from one-off special dividends in `Dashboard.tsx` to maintain authentic forward Current Yield and Yield on Cost (YoC), while preserving total cashflow in annual forecasts.
  - Excludes `is_special: true` and AsyncStorage special IDs from rolling schedule generation (`rollExpiredDividendSchedulesIfNeeded`) and CSV representative DPU export.
- **Confirmed Dividend Fallback**:
  - Defensive fallback in `returnService.ts` and `Dashboard.tsx` when `schedule.is_projected === false` and `eligibleShares <= 0`: falls back to shares held as of `payment_date` (or `net_shares`) to prevent dropping verified lifetime payouts due to transaction date edge cases.
- **Live Market-Driven Currency Resolution & Foreign Dividend Integrity (`currencyService.ts`, `stockService.ts`)**:
  - Dynamically registers live market currency (`meta.currency === 'USD'`) directly from upstream Yahoo Finance API responses during quotes, dividend inquiries, and stock searches into a runtime symbol registry (`registerSymbolCurrency`).
  - Guarantees explicit `currency` persistence in `assets` table insert/update operations across `AddAssetModal.tsx`, `EditAssetModal.tsx`, and `csvService.ts`, preventing foreign assets from accidentally acquiring database default `'THB'`.
  - In `resolveIsUSStock`, prioritizes database-persisted `currency === 'USD'`, runtime live market metadata, international ticker conventions (no `.BK` suffix), and W-8BEN 15% tax rate fallback, eliminating reliance on static hardcoded lists while preventing stale default `'THB'` records from misclassifying foreign assets.
- **Dual-Currency Payday Radar & Confirmation Display (`UpcomingPaydayRadar.tsx`, `Dashboard.tsx`)**:
  - Upcoming Payday Radar displays foreign dividend amounts in native USD alongside estimated converted THB: `$USD (~฿THB)` (e.g. `$0.46 (~฿15.66)`), completely eliminating denomination ambiguity for global dividend investors.
  - One-click payday confirmation alerts (`handleConfirmPayment`) similarly display both native USD and estimated THB amounts.
- **Automated Regression & Security Test Suite**:
  - Automated unit, integration, and penetration test suite maintained in `scripts/test_dividend_logic.js` and `scripts/test_security_hardening.js` runnable via `npm test`, covering 48 test cases across date math, learned lag, cash accrual, cutoff fallbacks, CSV formula sanitization roundtrips, forged JWT signature detection, and master fund catalog RLS tampering protection.

---

### 4.3 Automated Stock Lookup & Closing Prices (US & Thai Stocks)
- Handled by: `src/services/stockService.ts`
- **Supported Markets**: US Exchanges (NYSE, NASDAQ, AMEX) and Stock Exchange of Thailand (SET / BKK).
- **Dual-Engine Autocomplete**:
  - Instant 0ms built-in catalog for top traded stocks (PTT, CPALL, BDMS, SCB, KBANK, AOT, ADVANC, DELTA, GULF, TSM, MCD, AAPL, MSFT, NVDA, GOOGL, META, TSLA, SCHD, SPY, etc.).
  - Real-time search query via Supabase Edge Function `stock-proxy`.
  - Clearly displays ticker symbols, company names, and market badges: `[SET]`, `[NYSE]`, `[NASDAQ]`.
- **Auto Closing Price**: Automatically populates the current market price upon selecting a stock.
- **Smart Auto Segment Badge with On-Demand Picker**: Replaced the long horizontal scrollview of 10+ sector chips with a sleek, automated badge (`[ 💻 เทคโนโลยี ▾ ]`). Sectors are auto-detected by default; tapping the badge opens a unified modal picker with checkmarks for quick overrides only when needed, saving screen space and eliminating UI clutter.
- **Quick Search Clear & Form Reset**: Search input features an inline 'X' reset button (`close-circle`) when text is present. Tapping 'X' instantly clears the search query, suggestions, auto-filled prices, DPU, and holding state, allowing a fast, one-tap reset for the next asset without leaving the active category.
- **Unlisted & Custom Assets**: Users can freely enter custom ticker symbols and manual prices.

---

### 4.3.1 Thai Mutual Funds Engine (SEC Open API v2)
- Handled by: `src/services/fundService.ts`, `src/components/AddAssetModal.tsx`, `src/components/EditAssetModal.tsx`
- **Direct Integration**: Connected to the Securities and Exchange Commission of Thailand (SEC Thailand) via API v2.
- **0ms Catalog & Fast Multi-Source Search**:
  - **Supabase Indexed Database (`thai_funds_catalog`)**: Stores and indexes Thai mutual funds with B-Tree indexes on `symbol`, `name_th`, `amc_name`, `exchange`, and `proj_id` with Row Level Security (RLS) enabled.
  - **Full-Text Multi-Field Search**: Searches by ticker symbol (`K-USA`, `SCBDV`, `B-INNOTECH`, `KF-GTECH`), Thai name (*"ทศพล"*, *"หุ้นปันผล"*, *"เวียดนาม"*), or AMC name (*"กสิกร"*, *"บัวหลวง"*, *"ไทยพาณิชย์"*, *"กรุงศรี"*, *"วรรณ"*).
  - **Silent 30-Day Periodic Sync (`syncFundsCatalogIfNeeded`)**: Runs in the background without UI blocking every 30 days (`@mydividend_last_funds_catalog_sync`), triggering silent server-side master catalog sync via Edge Function (`action: 'sync-funds'`) using service role key, consuming minimal SEC API batch requests (<0.25% of single-day quota) with zero force-sync buttons to preserve a clean, minimalist UI.
  - **Resilient Fallback**: Seamlessly falls back to an expanded built-in catalog if the database is offline, and provides flexible on-demand SEC lookup for unlisted funds.
  - Distinct AMC badges: `[KAsset]`, `[SCBAM]`, `[BBLAM]`, `[KSAM]`, `[UOBAM]`, `[TISCO]`, `[KTAM]`, `[Principal]`, `[MFC]`, `[LHFund]`.
- **Auto NAV Fetching & Dual-Layer Engine**:
  - Automatically fetches the latest Net Asset Value per unit from the official SEC Thailand Fund Check API (`web-fct-api.sec.or.th`) with smart ticker normalization and Buddhist Era date conversion to ISO (`YYYY-MM-DD`).
  - Seamless dual-layer fallback: if proxy is unreachable or pending deployment, `fundService.ts` automatically executes a resilient direct client fallback to SEC Fund Check API with smart variants (no hyphens, base ticker), ensuring zero-downtime NAV updates.
  - Dynamically updates form labels to mutual fund terminology: *"Units"*, *"Cost NAV"*, and *"Latest NAV"*.
  - Calculates market value and unrealized profit/loss via SQL View `view_asset_summary`.
- **Fund Dividend History**:
  - Fetches historical DPU and book-closing dates from the SEC API with exact symbol matching to avoid incorrect share classes.
- **Auto Sector Detection**:
  - Evaluates the fund investment policy description (`policy_desc`) to assign standard sector tags (Equity, Fixed Income, Foreign/FIF, Mixed, Property, Commodity, Money Market).
- **Share Class Disambiguation UI & Gold Token 'D'**:
  - Automatically classifies mutual fund share classes via `detectFundClass` (`fundService.ts`):
    - **Dividend Class (`-D`, `-A(D)`, `ปันผล`)**: Marked with an elevated **Gold Token 'D'** (`🟡 D`) and gold label `ปันผล` with search priority.
    - **Accumulation Class (`-A`, `-A(A)`, `สะสมมูลค่า`)**: Marked with a subtle slate **'A' Token** (`⚪ A`) and `สะสมมูลค่า` label to prevent mistaking non-dividend growth classes.
    - **Tax-Deductible Class (`SSF`, `RMF`, `TESG`)**: Marked with a violet **Token** (`🟣 SSF` / `🟣 RMF`).
    - **Auto-Redemption Class (`-R`)**: Marked with an azure **'R' Token** (`🔵 R`).
  - Search results display class tokens side-by-side with AMC badges, and selected asset notes provide instant confirmation badges (`🟡 [Class D จ่ายปันผล]` vs `⚪ [Class A สะสมมูลค่า]`) before confirming transactions.
- **Clean State Switcher**:
  - Toggling between `STOCKS`, `FUNDS`, and `CASH` resets input fields to prevent state leakage.

---

### 4.4 USD Currency Support for Stocks
- Currency switch button (**THB / USD**) in Add and Edit Asset modals (exclusive to `STOCKS`; Thai Mutual Funds are locked strictly to `THB (฿)`).
- **USD Workflow**:
  - Real-time USD/THB exchange rate fetched via Edge Function (`USDTHB=X`).
  - Displays live conversion into Thai Baht as the user types the USD cost per share.
  - Stored in the database in Thai Baht (Base Currency) to maintain unified portfolio valuation.

---

### 4.5 Supabase Edge Function (`stock-proxy`) & Secure Proxy Client
- Resolves browser CORS limitations and acts as a hardened proxy for Yahoo Finance and SEC Open API requests.
- **Security Auth Guard**: Enforces strict API key / Bearer token validation matching server environment keys, paired with cryptographic verification of user session tokens via Supabase Auth API (`/auth/v1/user`) to reject unsigned, forged, or expired tokens (HTTP 401).
- **Client Helper (`proxyClient.ts`)**: Centralized service invoking `stock-proxy` with automatic `apikey` & `Authorization: Bearer <key>` header injection, strict 8-second request timeouts, and SDK fallback.
- Deployed as Supabase Edge Function
- Endpoint: `/functions/v1/stock-proxy`
- Supported Actions:
  1. `action: "search"`: US & Thai stock search.
  2. `action: "quote"`: Stock prices and FX rates (`USDTHB=X`).
  3. `action: "dividends"`: Stock dividend distribution history.
  4. `action: "fund-nav"`: Real-time mutual fund NAV from official SEC Thailand Fund Check API (`web-fct-api.sec.or.th`) with browser emulation headers, smart ticker normalization, BE to ISO date conversion, and SEC API v2 fallback.
  5. `action: "fund-dividends"`: Mutual fund dividend history from SEC API (`/v2/fund/daily-info/dividend-history`).
  6. `action: "history-7d"`: 7-day historical closing prices for sparkline area charts (`range=7d&interval=1d`).
  7. `action: "sync-funds"`: 30-day periodic synchronization of Thai mutual fund profiles from SEC Open API, persisting updates directly to `thai_funds_catalog` via server-side `SUPABASE_SERVICE_ROLE_KEY`.

---

### 4.6 Local Notifications (XD Ex-Dividend Reminders)
- Handled by: `src/services/notificationService.ts`
- **Zero-Configuration Full-Auto Automation**: Automatically schedules reminders 1 day prior to the ex-dividend date at 08:30 AM without manual user intervention.
- Dedicated Android Notification Channel: `xd-reminders` (High Importance, audio chime, and vibration).
- Notification message: `🔔 [Symbol] ขึ้นเครื่องหมาย XD พรุ่งนี้! ถือหุ้นไว้เพื่อรับสิทธิเงินปันผล`
- **Portfolio-wide Auto-Synchronization (`syncAllUpcomingXdReminders`)**: Automatically synchronizes and schedules unexpired upcoming XD dates for active assets on Dashboard load/pull-to-refresh and immediately after CSV bulk portfolio imports.
- **Hygiene & Single-Transaction Cleanup**: Cancels scheduled reminders on asset deletion and when archiving assets upon deleting their last transaction in `EditTransactionModal.tsx`.

---

### 4.7 Asset Editing & Soft Deletion
- Handled by: `src/components/EditAssetModal.tsx`
- Opened by tapping any holding card across the Dashboard or Holdings view.
- **Editable Parameters**:
  - Symbol and Asset Category (`STOCKS`, `FUNDS`, `CASH`).
  - Current Price with one-tap market refresh.
  - Shares held and average cost basis (adjusts transaction logs to refresh `view_asset_summary`).
  - Withholding tax rate override.
  - Projected DPU and upcoming ex-dividend date.
- **Soft Deletion**:
  - Distinct red trash icon and "Delete Asset from Portfolio" button.
  - Confirmation alert dialog to avoid accidental removals.
  - Updates `is_archived = true` in `assets`, removing it immediately from active views while preserving historical audit trails.

---

### 4.8 Segment Classification & Portfolio Allocation (Donut Pie Chart)
- Handled by: `src/components/CategoryBreakdownModal.tsx`, `src/screens/Portfolio.tsx`, `src/services/sectorService.ts`
- **Visual Presentation & White Callout Lines**:
  - High-contrast Donut Pie Chart rendered on a compact minimal dark card (`#0F172A`, ~40% height reduction) with streamlined padding and tighter callout radius.
  - **Crisp White Callout Lines & Single Minor Suppression**: Elegant directional lines linking chart slices directly to percentage and name badges with compact standard dimensions (`length: 16`, `tailLength: 10`, `extraRadius: 48`). When viewing the entire portfolio (`activeCategoryFilter === 'ALL'`) where all 3 categories exist and minor adjacent categories (`fundsPct < 10 || cashPct < 10`) occupy narrow adjacent arcs, the chart automatically applies Single Minor Callout Suppression to hide the callout line of the smaller minor category (tie-breaker: hide Cash) to guarantee zero badge collision and zero off-screen penetration, while fully displaying all categories in the legend below.
  - **Context Isolation**: The bank interest quota meter is omitted from the portfolio allocation card and maintained strictly inside `CategoryBreakdownModal` for CASH details, keeping the allocation overview focused and compact.
  - **Minor Items Grouping (Option A)**:
    - Holdings or segments representing $\ge 6\%$ receive dedicated chart slices and callouts.
    - Holdings representing $< 6\%$ are bundled into a single slate-gray (`#64748B`) slice labeled **"Others"** with a single callout line, eliminating mobile layout overcrowding.
    - The bottom legend and asset breakdown list display 100% of individual assets.
- **Sector Taxonomies**:
  - **STOCKS (10 GICS Sectors)**: Technology, Energy, Financials, Healthcare, Consumer Staples, Consumer Discretionary, Industrials, Materials, Real Estate, Telecom, Other.
  - **FUNDS (7 AIMC Categories)**: Fixed Income, Equity, Mixed, Property & Infra, Commodity, Foreign (FIF), Money Market, Other.
  - **CASH (4 Deposit Types)**: Digital Savings, Fixed Deposit, General Savings, Other Accounts.

---

### 4.9 Cash & Interest Engine (Bank Deposits & Daily Accrual)
- Handled by: `src/components/CashAssetForm.tsx`, `src/components/AddAssetModal.tsx`, `src/components/EditAssetModal.tsx`
- **Modular Sub-component**: Extracted into `CashAssetForm.tsx` to maintain clean separation from stock forms and enable instant reuse across Add and Edit modals.
- **Cash-Specific Fields**:
  - Renames ticker input to **"Account Name / Financial Institution"**.
  - Replaces share count with **"Deposit Amount (฿)"** and **"Interest Rate (% p.a.)"**.
  - **Interest Payout Frequencies**:
    1. Monthly (e.g., Dime!, Kept digital accounts)
    2. Semi-Annual (June and December - standard Thai bank cycle)
    3. Annual (December year-end)
  - **Deposit Date**: Records start date for accurate accrual calculations.
  - **Daily Accrual / Pro-Rata Calculation**:
    - First deposit period: Accrues daily interest according to standard banking formulas:
      $$\text{First Period Interest} = \frac{\text{Principal} \times \text{Rate} \times \text{Actual Days}}{365}$$
    - Subsequent periods: Seamlessly transitions to full-period cycles.
  - **Database Persistence**:
    - Principal: Recorded as `current_price = 1.0000`, `shares = principal`, `price_per_share = 1.0000`, and `transaction_date = deposit_date` in `transactions` (Unrealized P/L = 0.00%).
    - Interest: Auto-generates `dividend_schedules` records to power the 12-month projection chart.

---

### 4.10 Multi-View Inflow Toggle on 12-Month Chart
- 3-way toggle filter placed above the 12-month cashflow chart on the Dashboard:
  1. **[ All ]**: Aggregates all incoming cashflows (Stock Dividends + Fund Dividends + Bank Interest).
  2. **[ Dividends Only ]**: Filters exclusively for stock and mutual fund distributions.
  3. **[ Interest Only ]**: Filters exclusively for bank deposit interest.
- Monthly itemized breakdown cards display clear badges: green `[Dividend]` and cyan `[Interest]`.

---

### 4.11 Thai Bank Interest Tax Engine (20,000 THB / Year Threshold)
- Handled by: `src/services/taxService.ts`, `src/components/CashAssetForm.tsx`, `src/components/CategoryBreakdownModal.tsx`
- **Thai Revenue Department Regulations**:
  - **Savings & Digital Savings Accounts**:
    - Cumulative annual interest across all banks $\le 20,000$ THB $\rightarrow$ **0% Tax Exempt**.
    - Cumulative annual interest $> 20,000$ THB $\rightarrow$ **15% Withholding Tax applied from the first Baht**.
  - **Fixed Deposit Accounts**: Subject to 15% withholding tax immediately (unless tax-free 24-36 month accounts).
- **Key Capabilities**:
  1. **Smart Auto-Tax Calculation**:
     - Real-time annual interest projection when typing principal and rate.
     - Auto-selects 0% if total interest $\le 20,000$ THB, displaying remaining tax-free quota.
     - Automatically switches to 15% with a warning badge if projected interest exceeds 20,000 THB.
     - Supports manual tax rate overrides.
     - Live preview displays Gross Interest, 15% Tax, and Net Inflow per payout cycle.
  2. **Tax-Free Interest Quota Meter**:
     - Visual meter inside the CASH Category Breakdown Modal tracking portfolio-wide cumulative interest against the 20,000 THB threshold.

---

### 4.12 Holdings & Transaction History Engine
- Handled by: `src/screens/AssetsScreen.tsx`, `src/components/AssetSparklineCard.tsx`, `src/services/historyService.ts`
- Accessible via the `Holdings` tab on the bottom navigation bar, or "View All" links from Overview and Portfolio.
- **Dual-View Switcher**:
  1. **[ 📦 Holdings View ]**:
     - Consolidates all current portfolio positions into a single dedicated screen, resolving endless vertical scrolling on Dashboard.
     - **Search Bar**: Instant filtering by ticker symbol or account name.
     - **Category Filter Pills**: Filter by `All`, `Stocks`, `Funds`, or `Cash`.
     - **Sort Options**: By Market Value, Gain (% Gain), Loss (% Loss), or Alphabetical (A-Z).
     - **Live Summary Banner**: Summarizes active filtered value and aggregate gain/loss.
     - **FinTech Sparkline Area Chart Cards (`AssetSparklineCard.tsx` & `historyService.ts`)**:
       - Premium FinTech card displaying a 7-day closing price trend line drawn with `react-native-svg` monotone splines and gradient area fill.
       - **Once-a-Day EOD Caching (16-24 hour end-of-day market cycle)** paired with 0ms in-memory cache and on-demand refresh (only refreshes on pull-to-refresh), reducing external API requests by over 95%.
  2. **[ 📜 Transaction History View ]**:
     - Historical timeline of all purchases and cash deposits, sorted chronologically from newest to oldest.
     - **Minimal Single-Row Dropdown Filter Bar**:
       - **Year Chip**: Taps open a bottom sheet modal selecting specific transaction years from the database (e.g., `All Years`, `2026`, `2025`).
       - **Month Chip**: Taps open a 12-month grid picker (Jan - Dec) or `All Months`.
       - **Type Chip**: Filters between `All Types`, `Buy (STOCKS/FUNDS)`, and `Deposit (CASH)`.
       - **Reset Chip**: Automatically appears when any filter is active for one-tap clearing.
     - **Search Bar & Volume Banner**: Instant text search and aggregate transaction volume for the selected period.

---

### 4.12.1 Automated Daily Market Price Sync & On-Demand Refresh Engine
- Handled by: `src/services/priceSyncService.ts`, `src/screens/AssetsScreen.tsx`, `src/screens/Dashboard.tsx`, `src/screens/Portfolio.tsx`
- **First Open of the Day Sync**:
  - Automatically evaluates `@my_dividend_last_price_sync_date` in AsyncStorage.
  - On the first app open of each calendar day, automatically fetches the latest regular market closing prices for US/Thai stocks (`fetchStockPrice`) and latest Net Asset Values for Thai mutual funds (`fetchFundNav`).
  - Converts US stock prices to base currency THB via live exchange rate (`getCachedExchangeRate`).
- **On-Demand Pull-to-Refresh Sync**:
  - When the user pulls down to refresh across `Holdings`, `Overview`, or `Portfolio`, forces a complete price re-fetch (`force = true`) and invalidates sparkline caches (`clear7DayHistoryCache`).
- **Database Persistence & Instant SQL Re-computation**:
  - Batch writes changed prices into `assets.current_price` in Supabase using `NUMERIC(15, 4)` precision.
  - SQL View `view_asset_summary` immediately recalculates `market_value`, `unrealized_pl`, and `unrealized_pl_percent` across the entire portfolio without requiring manual client recalculation.
- **Concurrency Protection**:
  - Employs an in-memory mutex lock (`isSyncInProgress`) preventing duplicate concurrent network sync executions when multiple screens load simultaneously.

---

### 4.12.2 Thai Mutual Funds & Server-Side SEC Open API Engine (สำนักงาน ก.ล.ต.)
- Handled by: `src/services/fundService.ts`, `supabase/functions/stock-proxy/index.ts`, `src/components/AddAssetModal.tsx`, `src/components/EditAssetModal.tsx`
- **Zero Client Secret Exposure (Server-Side Secrets)**:
  - `SEC_API_KEY` is hosted exclusively in **Supabase Edge Function Secrets** (`Deno.env.get("SEC_API_KEY")`).
  - No secret keys are stored in client `.env` files or compiled JavaScript bundles, eliminating all risks of credential leakage or APK reverse-engineering.
- **Fast ProjId Auto-Resolution & Timeout Guard**:
  - Automatically queries `/v2/fund/general-info/profiles` (200ms) to resolve the SEC project identifier (`proj_id`) before querying `/v2/fund/daily-info/nav`, preventing slow 15–20 second full-table scans when querying by ticker alone.
- **Instant NAV & Dividend Auto-Population**:
  - In `AddAssetModal.tsx`, selecting or typing a mutual fund automatically fetches the latest NAV (`last_val`) and update date (`nav_date`) from ก.ล.ต., pre-populating both `currentPrice` and default `costPrice`.
  - Automatically retrieves distribution events from `/v2/fund/daily-info/dividend-history`, analyzes payout frequency (Annual, Semi-Annual, Quarterly), and projects 12-month forward schedules with ex-dividend (XD) dates in `dividend_schedules`.
- **Share Class & Policy Auto-Detection**:
  - Disambiguates share classes with visual badges: Dividend (`🟡 D`), Accumulation (`⚪ A`), and Tax-Saving (`🟣 SSF/RMF/TESG`).
  - Automatically classifies investment segments (Equity, Fixed Income, Foreign, Property, Mixed) from fund policy and naming heuristics.
  - Locks currency to THB (฿) and hides redundant USD toggles, keeping the interface clean and tailored for Thai mutual fund investors.

---

### 4.13 Position Accumulation & DCA Consolidation Engine
- Handled by: `src/services/assetConsolidationService.ts`, `src/components/AddAssetModal.tsx`
- **Portfolio Model Rule**:
  - **Holdings View**: Each unique asset `(symbol, asset_type)` is displayed as **exactly 1 consolidated card**. Total units (`net_shares`) and weighted average cost (`weighted_average_cost`) are aggregated via `view_asset_summary`.
  - **Transaction History View**: Preserves individual buy orders and deposit dates separately.
- **Live DCA Detection in AddAssetModal**:
  - As the user types a symbol, the system checks for existing holdings in real time.
  - If found, displays a cyan hint banner: `💡 Position already in portfolio (X shares @ ฿Y) — This entry will be treated as an accumulation (DCA) purchase. Shares and cost basis will be automatically combined.`
  - Saves the entry under the existing `asset_id` as a new transaction row.
- **Automatic Duplicate Consolidation**:
  - `consolidateDuplicateAssets()` detects duplicate asset rows, merges transactions and dividend schedules under a primary asset, and archives duplicates. Runs automatically on screen focus.

---

### 4.13.1 Transaction Management, DCA Editing & Rubber Eraser Engine
- Handled by: `src/components/EditTransactionModal.tsx`, `src/screens/AssetsScreen.tsx`, `src/components/EditAssetModal.tsx`
- **Rationale**: While "My dividend" is intentionally designed as a Dividend & Cash Flow Holding app (not a high-frequency trading journal), investors require an intuitive "rubber eraser" to adjust DCA purchases, fix typos, modify historical buy prices/dates, and delete mistyped entries without breaking weighted average costs or dividend projections.
- **Key Features**:
  1. **Interactive Transaction Editing**: Tapping any transaction in the Transaction History tab opens `EditTransactionModal.tsx`.
  2. **Dual Currency Price Input**: For US stocks, users can enter cost prices in either USD or THB; the app automatically converts and stores in THB `NUMERIC(15, 4)` using real-time/cached exchange rates.
  3. **Built-in Pure RN Calendar**: Dates are selected via `CalendarPickerModal` with quick date presets.
  4. **Smart Single-Transaction Deletion**:
     - When deleting a transaction, the system checks whether other transactions exist for the parent asset.
     - If it is the **only remaining transaction** for that asset, deleting it automatically archives the asset (`is_archived: true`) so no empty 0-share ghost card clutters the Dashboard.
     - If multiple transactions exist, the specific transaction is deleted and `view_asset_summary` automatically recalculates `net_shares`, `total_cost`, and `weighted_average_cost`.
  5. **Safe Multi-DCA Asset Editing**: In `EditAssetModal.tsx`, when an asset contains multiple purchase transactions (`txCount > 1`), aggregate share count and cost basis inputs are strictly locked (`editable={false}` with visual lock badge `[ 🔒 DCA X ไม้ ]`) to prevent destructive lot collapsing, providing a direct 1-tap navigation row (`[ 🧾 มีประวัติซื้อสะสม X รายการ • ดูประวัติแต่ละไม้ › ]`) routing to Transaction History for safe individual lot adjustments.

---

### 4.13.2 Minimalist Asset Selling & Cash Withdrawal Engine (SELL & WITHDRAW)
- Handled by: `src/components/SellAssetModal.tsx`, `src/components/EditAssetModal.tsx`, `src/screens/AssetsScreen.tsx`, `src/components/EditTransactionModal.tsx`
- **Rationale**: To support realistic Buy & Hold portfolio rebalancing, asset trimming, and cash principal withdrawals without losing historical DCA buy records or corrupting cost basis calculations.
- **Key Features**:
  1. **Direct Access via Edit Modal**: Tapping an asset card opens `EditAssetModal.tsx`, featuring a dedicated secondary action button (`[ 📉 ขาย ]` for Stocks/Funds or `[ 💸 ถอน ]` for Cash deposits).
  2. **Minimalist Quick Presets**: Built-in 25%, 50%, 75%, and 100% (ทั้งหมด) preset pills for effortless calculation.
  3. **Strict Validation Guard**: Prevents over-selling (`sellShares <= net_shares`) with immediate red hint warnings and submit disabling.
  4. **Pro-Rata Average Cost & YoC Protection**: In accordance with SQL View `view_asset_summary`, recording a `SELL` transaction decreases `net_shares` while preserving authentic `weighted_average_cost` (`total_buy_cost / total_buy_shares`), keeping Yield on Cost (YoC) and remaining cost basis mathematically sound.
  5. **Auto-Archive on Full Exit (100%)**: Selling 100% of holdings automatically soft-deletes the asset (`is_archived: true`) and cancels pending XD reminders to prevent 0-share ghost cards.
  6. **Transparent Ledger Tracking & 100% Exit Preservation**: Records `type: 'SELL'` in `transactions`, appearing cleanly in Transaction History with `[ ขาย (SELL) ]` or `[ ถอนเงิน (WITHDRAW) ]` badges and filter support. In `AssetsScreen.tsx`, transaction history queries user transactions directly from `transactions` with joined asset metadata (`assets(id, symbol, asset_type, current_price, currency)`), ensuring that 100% sold-out or archived assets (`is_archived: true`, such as fully liquidated funds or stocks) remain permanently visible in the historical transaction timeline.
  7. **Dual-Currency USD/THB Input**: Supports minimal USD ($) and THB (฿) currency switching for US Stocks in `SellAssetModal.tsx`, providing live THB conversion preview and persisting original USD prices in transaction metadata.
  8. **Accurate Cash Withdrawal Interest**: Accounts for withdrawals by calculating subsequent period interest on net remaining principal (`eligibleShares = deposit - withdraw`) in `Dashboard.tsx` and `returnService.ts`.
  9. **Full Backup & Restore CSV Parity**: Includes `type` (BUY / SELL) in `exportPortfolioToCsv` and `parseAndValidateCsv`, ensuring 100% accurate portfolio recreation upon CSV restore.

---

### 4.14 Portfolio Performance & Benchmark Comparison Engine
- Handled by: `src/services/benchmarkService.ts`, `src/screens/Portfolio.tsx`
- **Dual Tab Switcher**:
  1. **[ 🥧 Allocation Tab ]**:
     - Features the high-contrast Donut Pie Chart prominently with asset filter buttons and top 3 holdings preview.
  2. **[ 📈 Performance Tab ]**:
     - **Performance Hero Card**: Highlights cumulative percentage return (`+14.8%`), net unrealized profit (฿), and total invested capital (หุ้น & กองทุน).
     - **Timeframe Selector**: `[ 1M | 3M | 6M | 1Y | ALL ]` positioned directly beneath the line chart card for seamless, intuitive thumb reach.
     - **TradingView / Google Finance Comparison Dropdown Pills**:
       - Replaces large separate benchmark selector boxes with minimal capsule pills directly above the chart:
         - **Primary Pill**: `[ 🟩 พอร์ตของคุณ (+X.X%) ]`
         - **Benchmark Dropdown Pill**: Defaults to `[ + เปรียบเทียบ ▾ ]`. Tapping opens a unified bottom sheet modal to select the target market index (`🇹🇭 SET Index`, `🇺🇸 S&P 500`, `🇺🇸 NASDAQ`). Once selected, cleanly transforms into `[ 🟠 ตลาด (+X.X%) ▾  ✕ ]` with one-tap clearing (`✕`) and instant switching.
      - **Google Finance Floor Timeline & Subtle Vertical Gridlines**: Month labels are placed in a dedicated floor row (`chartFloorTimelineRow`) at the bottom of the card, completely separated from the plotting canvas, with subtle vertical gridlines (`rgba(226, 232, 240, 0.75)`) rising directly from each month checkpoint across the chart.
      - **Dynamic Tight Y-Axis Bounds (Minimal Headroom ~8%)**: Automatically computes responsive headroom (~8%, min 0.5%) adapting to active timeframe data (1M, 3M, 6M, 1Y, ALL) so curves fill the chart naturally without wasteful space (e.g. for max 10%, ceiling stays at ~10-12%, never blowing up to 20%).
     - **Dual-Line Comparison Chart with Dynamic Safe Scale Bounds**:
       - Built on `react-native-gifted-charts`.
       - Real-time dynamic calculation of `maxValue`, `stepValue`, `noOfSections`, `mostNegativeValue`, and `overflowTop` across both datasets.
       - **Balanced Headroom Scaling (~8%)**: Evaluates section counts (2 to 5) and clean step intervals (0.2, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25...) to provide tight, responsive headroom (~8%, min 0.5%) above peak data points. Curves never punch through the ceiling while avoiding excessive empty space above the graph.
       - Line 1: User Portfolio (Emerald `#10B981`, with subtle gradient area fill when uncompared).
       - Line 2: Selected Benchmark (Amber/Violet/Pink).
     - **Alpha / Outperformance Banner**: Dynamic summary card (e.g., `🎉 Outperforming S&P 500 by +3.5%` or `📊 Trailing benchmark by -1.2%`).
     - **Asset Return Ranking**: Ranked leaderboard of portfolio assets sorted from highest to lowest % gain (investment assets exclusively).
     - **Investment Isolation from Cash Deposits (Option A)**: In the Performance Tab, calculations for cumulative return, total invested cost, unrealized capital gain, benchmark curves (SET, S&P 500, NASDAQ), and the asset return ranking strictly isolate investment assets (STOCKS & FUNDS) from bank deposits (CASH). This eliminates return dilution (0% cash capital gain) and ensures fair, apple-to-apple equity index comparison. The Allocation Tab continues to display 100% of all asset classes.
     - **Daily Portfolio Snapshot Tracking & Authentic Trajectory (`portfolio_snapshots`)**:
       - Automatically records daily end-of-day portfolio valuation (`recordDailyPortfolioSnapshot` in `benchmarkService.ts`) on Dashboard/Portfolio calculation, tracking `total_market_value`, `total_cost`, `unrealized_pl`, and `unrealized_pl_percent` exclusively for investment assets (STOCKS & FUNDS) to maintain pure equity index parity.
      - **Authentic Inception Date & Dynamic Timeframe Alignment (Since Inception)**:
        - Automatically detects the user's authentic inception date (`inceptionDate`) from the first BUY transaction of investment assets (`transactions.transaction_date`).
        - For Timeframe `ALL`, evaluates strictly Since Inception: slices the benchmark market curve starting from the inception date rather than a fixed 2-year lookback for 100% fair apples-to-apples comparison, dynamically adapts `floorTimelineLabels` across the active year (e.g. `มี.ค. 26`, `พ.ค. 26`, `ส.ค. 26`, `ต.ค. 26`) eliminating phantom historical years (2023–2025), and enforces snapshot span validation preventing short 2-day snapshots from stretching across multi-year spans.
       - When historical snapshots exist ($\ge 2$ points within the active timeframe), plots the user's authentic portfolio trajectory rather than synthetic straight lines, transitioning seamlessly with beta correlation fallback when snapshots are not yet populated.

---

### 4.15 Minimal Hybrid Dashboard, Zero-Jitter Hero Card & Global Privacy Mode
- Handled by: `src/screens/Dashboard.tsx`, `src/services/privacyService.ts`, `src/components/GoalSettingsModal.tsx`
- **Dual Yield & Monthly Average**:
  - **Current Dividend Yield**: $\frac{\text{Projected Annual Net Inflow}}{\text{Total Market Value}} \times 100$
  - **Yield on Cost (YoC)**: $\frac{\text{Projected Annual Net Inflow}}{\text{Total Cost Basis}} \times 100$
  - **Monthly Average Inflow**: Displays estimated monthly net passive income (`~฿X/mo`).
- **Zero-Jitter Hero Card Architecture**:
  - Structured into 2 permanently stable rows:
    - **Top Row**: Static label `"Total Net Worth"` paired with a frameless eye toggle icon on the left, and the profit/loss badge `[ ▲ +12.34% ]` on the right. Anchoring the eye icon beside static text guarantees **0px horizontal shift under the user's finger during toggle**.
    - **Value Row**: 32px full-width Net Worth value with `numberOfLines={1}` and `minHeight: 40`.
    - **Dual Yield Subvalue**: Formatted strictly as `฿••••••` under Privacy Mode with `numberOfLines={1}` and `minHeight: 52` to eliminate text wrapping into 2 rows.
  - Replaces separate refresh buttons with standard mobile **Pull-to-Refresh**, keeping the header clean and uncluttered.
- **Global Privacy Mode & Comprehensive Masking**:
  - Persisted in AsyncStorage (`@my_dividend_privacy_mode`) and broadcasted via `privacyService.ts`.
  - Masks monetary values (`฿••••••`), deposit principals, and shares/units held (`•••• หุ้น` / `•••• หน่วย`) across all screens (Overview, Portfolio, Holdings, CategoryBreakdownModal, and Transaction History) to eliminate indirect net worth estimation via share counts, while keeping percentage and Yield on Cost ratios visible.
  - Interactive eye toggle buttons are consistently placed across Overview, Portfolio, and Holdings headers.
- **Upcoming Payday Radar**:
  - 30-day forward horizon radar banner positioned above the 12-month chart, tracking upcoming ex-dividend or payment events with distinct `[ วัน XD ]` and `[ เงินเข้า ]` badges, countdowns, and 1-click payment confirmation.
- **Minimal Passive Income Goal Card**:
  - Tracks monthly passive income progress against target levels (Level 1: Coffee ฿1,000, Level 2: Utilities ฿3,000, Level 3: Living ฿10,000, Level 4: Lean FIRE ฿30,000, or Custom).
  - Elegant progress bar with remaining shortfall calculator, managed via `GoalSettingsModal.tsx`.

---

### 4.16 CSV Bulk Portfolio Import & Full Backup Export Engine
- Handled by: `src/services/csvService.ts`, `src/components/ImportCsvModal.tsx`, `src/screens/AssetsScreen.tsx`
- **Access**: `[ 📥 Import CSV ]` and `[ 📤 Export ]` buttons in the header of the `Holdings` screen.
- **Portfolio CSV Full Backup & Restore Export**:
  - Exports portfolio at granular transaction level (`transactions`) preserving individual DCA purchase batches, transaction dates, and original native currency purchase prices (USD for US stocks, THB for Thai assets).
  - Preserves projected or adjusted `expected_dpu` and `tax_rate` per asset.
  - Symmetrical CSV format matching `parseAndValidateCsv` schema (`symbol,asset_type,shares,cost_price,currency,transaction_date,expected_dpu,tax_rate,type`), guaranteeing 100% full portfolio restoration via `ImportCsvModal`.
  - **OWASP CSV Formula Injection Sanitization**: Sanitizes exported fields (`sanitizeCsvField`) by prepending single quotes (`'`) to values starting with formula control characters (`=`, `+`, `-`, `@`, `\t`, `\r`), and safely unescapes them during import (`cleanSymbol`) to guarantee 100% roundtrip data fidelity while eliminating spreadsheet formula execution vulnerabilities.
  - **CSV Payload & Symbol Length Bounds**: Enforces `MAX_CSV_IMPORT_ROWS = 500` to prevent UI thread freezing and memory exhaustion during large file uploads, and truncates symbol names to 30 characters (`cleanSymbol.slice(0, 30)`) to guard against database text flooding attacks.
  - Supports automated web file download (`Blob` + auto-click) and native mobile sharing (`Share.share`).
- **Portfolio CSV Bulk Import**:
  - **Dual Import Modes**:
    1. File Picker: Upload `.csv` or `.txt` via `expo-document-picker`.
    2. Direct Text Paste: Paste CSV text copied from spreadsheets or notes.
  - **Smart Column Auto-Mapper**:
    - Flexible column name aliases (`symbol`/`หลักทรัพย์`, `shares`/`จำนวนหุ้น`, `cost_price`/`ต้นทุน`, `currency`, `transaction_date`).
    - Auto-detects asset types (`STOCKS`, `FUNDS`, `CASH`) and currency (`THB`/`USD`).
  - **Validation & Live Preview**:
    - Previews parsed rows with asset badges and line-number error validation.
  - **Automated Price & Dividend Creation**:
    - Automatically fetches latest closing prices and NAVs for imported assets lacking current price.
    - Automatically converts USD costs to THB.
    - Automatically generates 12-month dividend schedules and runs duplicate DCA consolidation.
  - **Template Download**: Sample CSV template download and copy option with clear column specifications.

---

### 4.17 Defensive Soft Delete & Data Safety Architecture
- Handled by: `src/screens/Dashboard.tsx`, `src/screens/Portfolio.tsx`, `src/screens/AssetsScreen.tsx`
- **Zero Data Leakage**: In addition to backend SQL view filtering, all client-side queries against `view_asset_summary` strictly enforce `.filter((a) => !a.is_archived)`.
- Prevents soft-deleted or archived assets and their historical records from inadvertently influencing net worth calculations, dividend projections, or visual listings.

---

### 4.18 Resilient Database Schema Fallback Architecture
- Handled by: `src/components/AddAssetModal.tsx`, `src/components/EditTransactionModal.tsx`, `src/components/AdjustDividendModal.tsx`, `src/services/csvService.ts`, `src/screens/Dashboard.tsx`
- **Graceful Zero-Crash Fallback**:
  - In environments where remote Supabase migrations (`002` through `005`) have not yet been applied, the application automatically catches missing column schema cache errors (e.g. `exchange_rate`, `is_special`, `currency`, `sector`) and retries the mutation or query instantly without the missing column.
  - For local UI states like special dividends (`is_special`), the app seamlessly pairs Supabase persistence with local `AsyncStorage` caching (`@my_dividend_special_schedules`), ensuring 100% feature availability and zero user-facing errors regardless of database migration status.
  - Provided idempotent migration script `supabase/migrations/005_unified_schema_update.sql` to cleanly add all required columns (`sector`, `currency`, `exchange_rate`, `is_special`) whenever database access is available.

---

### 4.19 Stock Split Adjustment Engine & Historical DPU Protection
- Handled by: `src/services/splitService.ts`, `src/components/EditAssetModal.tsx`
- **Strict Rule for Historical Dividends**:
  - Historical paid dividends must **NEVER** have their DPU divided retroactively by stock split ratios!
  - When applying a split adjustment (e.g., 1:10), the split ratio only divides future or projected payout cycles (`is_projected === true || payment_date >= split.date || xd_date >= split.date`).
  - Past completed dividend distributions maintain their authentic, un-diluted historical DPU, guaranteeing that cumulative received dividend records (`returnService.ts`) remain 100% accurate and mathematically sound.
  - All share calculations and cost adjustments maintain strict `NUMERIC(15, 4)` precision.
- **Cloud Persistence & Multi-Device Split Synchronization (`assets.last_split_date`)**:
  - Applied stock split dates are persisted directly to Supabase Cloud via `assets.last_split_date` alongside local `AsyncStorage` caching.
  - Queries `last_split_date` from Cloud before prompting user, completely preventing re-prompting or duplicate split execution across multiple devices, Expo Go, or Web preview sessions.

---

### 4.20 Enhanced 30-Day Payday Radar & 1-Click Payment Confirmation
- Handled by: `src/components/UpcomingPaydayRadar.tsx`, `src/screens/Dashboard.tsx`
- **30-Day Forward Lookahead**: Expands the upcoming events window to 30 days, capturing both upcoming Ex-Dividend dates (`[ วัน XD ]`) and Payout dates (`[ เงินเข้า ]`).
- **Estimated Payout Dates**: Displays a tilde (`~D MMM`) when payment dates are forecasted based on asset-specific `computeLearnedPayoutLag` (5–45 days), falling back cleanly to standard settlement intervals (14 days for US stocks, 20 days for Thai assets) only when historical distribution schedules are not yet populated.
- **1-Click Payday Button (`[ ✓ เงินเข้าแล้ว ]`)**:
  - Automatically activates on the payment date (`diffDays <= 0`).
  - Tapping prompts a clean native confirmation dialog displaying the exact net inflow.
  - Upon confirmation, updates the schedule to `payment_date = today` and `is_projected = false` on Supabase, instantaneously converting projected cashflow into verified received dividends.

---

### 4.21 Annual YoY Dividend Comparison & Special Dividend Engine
- Handled by: `src/components/AnnualComparisonSheet.tsx`, `src/components/HeroNetWorthCard.tsx`, `src/components/AdjustDividendModal.tsx`, `src/screens/Dashboard.tsx`
- **Year-over-Year (YoY) Growth Highlight**:
  - Hero card displays a tappable pill badge (`+X.X% YoY` or `[ ✦ ปีแรก ]` if no prior history).
  - Tapping opens the `AnnualComparisonSheet` comparing projected annual income against the prior calendar year.
- **Special Dividend Disambiguation**:
  - Payouts can be marked as "Special Dividend" (`is_special: true`) in `AdjustDividendModal`.
  - The Annual Comparison Sheet cleanly separates Regular Dividends from Special Dividends, explaining natural annual income fluctuations and preventing misleading yield distortions.
- **Calendar Year & Rolling 12M Dual Horizon**:
  - The 12-month bar chart defaults to the active calendar year (Jan–Dec) with full support for historical/future years, and provides a selectable `Rolling 12M` option in the Year Selector dropdown to ensure 4-quarter forecasts crossing calendar year boundaries can be inspected without premature truncation.

---

### 4.22 Offline-First Read Snapshot & Stale-While-Revalidate Engine
- Handled by: `src/services/portfolioCacheService.ts`, `src/components/OfflineNoticeToast.tsx`, `src/screens/Dashboard.tsx`, `src/screens/Portfolio.tsx`, `src/screens/AssetsScreen.tsx`
- **0ms Instant Cold-Start**:
  - On app launch, immediately loads the most recent portfolio snapshot (`assets`, `transactions`, `dividendSchedules`, `exchangeRate`) from local `AsyncStorage` (`@my_dividend_portfolio_cache_v1`).
  - Dashboard hero net worth, 12-month dividend cashflow chart, upcoming payday radar, and portfolio allocation render instantly at 0ms without blank loading spinners or network delays.
- **Stale-While-Revalidate (SWR)**:
  - While displaying cached data, the app silently re-queries Supabase in the background. Upon successful fetch, state is seamlessly refreshed and a new local snapshot is saved with defensive soft-delete filtering (`.filter((a) => !a.is_archived)`).
- **Subtle Contextual Offline Notice Toast (`OfflineNoticeToast.tsx`)**:
  - If a network failure occurs during initial load or pull-to-refresh, existing cached state is defensively preserved (never wiped or set to empty).
  - Displays a non-intrusive floating toast capsule above the bottom navigation bar with Ionicons `information-circle-outline`: `[ ⓘ ] เชื่อมต่อไม่ได้ · แสดงข้อมูลล่าสุดในเครื่อง`.
  - Automatically dismisses after 2.6 seconds with zero layout shifting (Zero-Jitter).
- **Offline Write Protection**:
  - In `AddAssetModal.tsx`, network connection failures during save attempts trigger an explicit Thai guidance alert (`Alert.alert('โหมดออฟไลน์', 'ไม่สามารถเชื่อมต่ออินเทอร์เน็ตได้ กรุณาเชื่อมต่อเครือข่ายก่อนบันทึกข้อมูล')`), preventing inconsistent partial offline records.

---

### 4.23 User Authentication, Portfolio Isolation & Dynamic Time-of-Day Greeting
- Handled by: `src/screens/AuthScreen.tsx`, `src/services/authService.ts`, `src/services/userService.ts`, `App.tsx`, `src/screens/Dashboard.tsx`
- **Absolute Portfolio Data Isolation (RLS)**:
  - Backed by Supabase PostgreSQL Row Level Security (RLS) policies checking `auth.uid() = user_id` across `assets`, `transactions`, and `dividend_schedules`.
  - Views (`view_asset_summary`) run with `security_invoker = true`, ensuring users can never inspect or modify assets belonging to other users.
- **Modern Authentication Flow (`AuthScreen.tsx`)**:
  - Dark mode FinTech UI matching `#0F172A` theme.
  - **Sign In**: Email & Password validation with password visibility toggle.
  - **Sign Up**: Custom Display Name input (`user_metadata.display_name`) + Email + Password.
  - **Forgot Password & 60s Anti-Spam Cooldown**: One-tap password reset request dispatching verification links to user's email via Supabase Auth (`resetPasswordForEmail`) with a 60-second client countdown timer disabling the submit button to prevent spam and rate-limit exhaustion.
  - **Smart Duplicate Email Guidance**: When sign-up detects an existing registered email, displays an interactive Thai alert dialog with a 1-tap "กู้คืนบัญชีนี้" action button that automatically switches to the recovery tab and pre-fills the email address for seamless account reclaiming.
  - **Keyboard Avoidance Architecture**: Eliminates vertical centering (`justifyContent: 'center'`) inside the ScrollView, applies a generous `paddingBottom: 160` scroll buffer, integrates `TouchableWithoutFeedback` for tap-outside keyboard dismissal, and sets `behavior="height"` with `keyboardVerticalOffset={24}` on Android, ensuring password fields and action buttons are never obscured.
  - **Offline Resilience & Network Guarding**: Detects offline/network failures during sign-in, sign-up, and password reset, displaying clear, non-technical Thai guidance alerts (`Alert.alert('โหมดออฟไลน์', ...)`) rather than generic error codes.
- **Hygiene & Cache Clearance on Sign Out**:
  - Tapping the right-aligned exit door button (`[ 🚪 ]` `log-out-outline`) prompts native confirmation dialog.
  - On sign-out, clears local AsyncStorage portfolio cache (`clearPortfolioCache()`), snapshot trajectory cache (`clearPortfolioSnapshotsCache()`), and stored display names, preventing subsequent device users from viewing previous portfolio snapshots during cold-start.
- **Dynamic English Time-of-Day Greeting (`userService.ts`)**:
  - Overview screen subtitle dynamically displays device time-based greetings:
    - `Good morning, [Name] ☀️` (05:00–11:59)
    - `Good afternoon, [Name] 🌤️` (12:00–16:59)
    - `Good evening, [Name] 🌙` (17:00–04:59)
  - Automatically loads custom display name, falling back to capitalized email prefix (e.g. `Somchai`) or `Investor`.

---

## 5. Mobile & Network Operational Guidelines

### 5.1 Resolving Expo Go Android Runtime Crashes
- **Root Cause**:
  1. `expo-notifications` invokes `warnOfExpoGoPushUsage` which throws an uncaught error in Android Expo Go (Expo SDK 53+ removed remote push from Expo Go).
  2. `TopicSubscriptionModule.android.js` calls `requireNativeModule('ExpoTopicSubscriptionModule')` which is absent in Expo Go Android binaries.
- **Integrated Solution & Environment Isolation**:
  - `scripts/patch-expo-notifications.js` automatically patches `warnOfExpoGoPushUsage` to `console.warn` and injects a fallback dummy for `TopicSubscriptionModule`.
  - Configured as `"postinstall": "node ./scripts/patch-expo-notifications.js"` in `package.json`.
  - `notificationService.ts` dynamically evaluates `isRunningInExpoGo` via `expo-constants`:
    - **In Expo Go**: Safely bypasses native Android notification channel creation and notification scheduling, logging schedules in `AsyncStorage` registry to guarantee zero-crash execution during development.
    - **In Standalone Builds (Google Play Store)**: Activates native Android Notification Channel (`xd-reminders`, High Importance, audio chime) and native scheduling 1 day prior to XD at 08:30 AM.
  - Root error boundary `RootErrorBoundary` in `App.tsx` catches unexpected runtime errors gracefully.

### 5.2 Safe Area & Native UI Graphics Standards
- **Safe Area**: Uses `SafeAreaProvider` and `SafeAreaView` from `react-native-safe-area-context` (never deprecated React Native `SafeAreaView`).
- **Gradients**: `expo-linear-gradient` powers charts and card overlays.
- **LogBox Cleanup**: Configured in `App.tsx` to suppress known benign Expo Go push notifications warnings.

### 5.3 Network Environment & Expo Tunnel Mode
- **Network Constraint**: Office and institutional WiFi networks (e.g., `CAMT`) enforce AP/Client Isolation, blocking direct LAN IP connections to the dev server.
- **Mandatory Launch Command**:
  ```bash
  node ./node_modules/expo/bin/cli start --tunnel --go --web
  ```
  *(or `npx expo start --tunnel --go --web`)*
- Tunnel mode via `@expo/ngrok` provides a public `.exp.direct` proxy enabling instant QR code scanning and bundle loading across any network.

### 5.4 Google Play Store Configuration & Compliance (`app.json`)
- **Package Name**: Enforces official unique Android application ID `"package": "com.mydividend.app"`.
- **Version Code**: Managed as integer `versionCode: 1` for Android App Bundle (AAB) store releases.
- **Deep Linking Scheme**: Configured with `"scheme": "mydividend"` for authentication callbacks.
- **Visual Branding**: `userInterfaceStyle` set to `"dark"`, with `#0F172A` dark slate adaptive icon background and `#10B981` emerald notification accents to eliminate bright flashes upon app launch.
- **Permissions**: Declares `POST_NOTIFICATIONS` (Android 13+), `SCHEDULE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`, and `VIBRATE`.

### 5.5 Upstream Network Resilience & Offline Sync Safety
- **Timeout Guards**: Direct Yahoo Finance quote and dividend fetch fallbacks in `stockService.ts` employ 5,000ms–6,000ms `AbortController` timeout guards, preventing connection hanging and eliminating Android Application Not Responding (ANR) risks.
- **Offline Sync Resilience**: `priceSyncService.ts` tracks `successfulFetchCount`, ensuring that complete network offline periods do not prematurely lock today's sync date (`LAST_SYNC_DATE_KEY`), allowing seamless on-demand sync once internet connectivity resumes.

### 5.6 Holdings Visual Performance Architecture
- **Zero Pop-in Experience**: In `AssetsScreen.tsx`, holding cards are rendered using `ScrollView` paired with `React.memo` in `AssetSparklineCard.tsx` and Once-a-Day EOD caching (`historyService.ts`). For typical dividend portfolios (10–50 assets), this architecture delivers instantaneous 60 FPS scrolling without the visual blank spaces or delayed pop-in flickers inherent in aggressive lazy rendering.

### 5.7 Agent Operation & Scope Discipline (กฎเหล็กการทำงานของ AI Agent)
- **Explicit Declaration (ต้องบอกก่อนทำ)**: ก่อนลงมือแก้ไขโค้ดหรือดำเนินการใดๆ ต้องอธิบายให้ผู้ใช้ทราบล่วงหน้าอย่างชัดเจนเสมอ
- **Strict Scope Boundaries (ห้ามทำเกินกว่าที่บอก)**: ต้องปฏิบัติตามขอบเขตที่ได้แจ้งและที่ได้รับมอบหมายเท่านั้น ห้ามแก้ไข เพิ่มเติม หรือดัดแปลงส่วนอื่นนอกเหนือจากที่บอกไว้โดยเด็ดขาด

### 5.8 Data Integrity & Engine Accuracy Standards
- **DCA History Preservation in Asset Edit (`EditAssetModal.tsx`)**: When updating an asset with multiple DCA purchase records, the system preserves all historical transaction lots, dates, and recorded exchange rates intact; aggregate shares and cost basis inputs are strictly locked (`editable={false}` with `[ 🔒 DCA X ไม้ ]` badge) with a minimal navigation row (`[ 🧾 มีประวัติซื้อสะสม X รายการ • ดูประวัติแต่ละไม้ › ]`) routing directly to transaction history for individual lot adjustments to prevent destructive lot collapsing.
- **Schedule Deduplication on Position Accumulation (`AddAssetModal.tsx`, `assetConsolidationService.ts`)**: Adding to existing positions reuses existing projected dividend schedules and updates projected DPU, avoiding duplicate payment schedule rows for the same distribution cycle.
- **Full 12-Month Horizon for Monthly Dividend Stocks (`stockService.ts`)**: Monthly distribution stocks (e.g., Realty Income `O`) project across all 12 monthly distribution dates (`Math.min(frequency, 12)`), preventing the legacy 4-cycle truncation.
- **Direct Database Currency Resolution (`Dashboard.tsx`, `returnService.ts`, `currencyService.ts`)**: Currency conversion prioritizes database-persisted `item.currency === 'USD'` directly from Supabase assets, eliminating reliance on hardcoded static ticker lists and ensuring 100% accurate THB valuation for all global assets.
- **CSV Future Dividend Projection (`csvService.ts`)**: CSV imports dynamically project upcoming 12-month future ex-dividend dates based on historical payout intervals rather than back-dating `xd_date` to transaction purchase dates, ensuring imported assets immediately populate the 12-month cashflow forecast.
- **Real Benchmark Historical Return Calculation & Authentic Curves (`benchmarkService.ts`)**: Synchronizes authentic 1-year historical monthly closing data for SET (`^SET.BK`), S&P 500 (`^GSPC`), and NASDAQ (`^IXIC`) via Supabase Edge Function to avoid web CORS issues, plotting authentic historical monthly curves rather than straight lines, and models realistic market-beta trajectory for portfolio comparison.
- **Cross-Tab Real-time Event Bus (`eventService.ts`)**: Provides lightweight pub-sub event distribution (`portfolioEvents.emitRefresh()` / `subscribe()`) that automatically and silently refreshes all permanently mounted screens (`Dashboard`, `Portfolio`, `AssetsScreen`) whenever an asset, transaction, or schedule is modified, preserving zero-latency tab switching and scroll positions.
- **Rolling Dividend Schedule Auto-Renewal (`priceSyncService.ts`)**: Evaluates active holdings during daily sync and automatically rolls forward the next 12 months of projected dividend schedules whenever upcoming schedules drop below 2 cycles, preventing the 12-month cashflow chart from ever drying up to 0 over multi-year holding.
- **Dynamic Currency Resolution & Hardcoded List Elimination (`currencyService.ts`)**: Completely eliminated static ticker lists (`KNOWN_US_SYMBOLS`). Symbol currencies are determined dynamically from database persistence (`item.currency === 'USD'`), live market search metadata, and runtime symbol registry, preventing foreign assets from incorrectly falling back to THB.
- **Timezone Drift Protection (`src/utils/dateUtils.ts`)**: Standardized all date creation on `getLocalDateString()` rather than `new Date().toISOString().split('T')[0]`, preventing the 1-day date shift bug occurring across midnight (00:00–06:59 AM UTC+7) in purchase recordings, schedule generation, and calendar selections.

### 5.9 Standalone Android APK Build & EAS Configuration (`eas.json`)
- **EAS Build Architecture**: Configured via `eas.json` with a dedicated `preview` profile specifying `"buildType": "apk"` for direct installation on Android devices without Google Play Store intermediation, and a `production` profile with `"buildType": "app-bundle"` (AAB) for official store releases.
- **Dark Mode Splash Screen (`app.json`)**: Configured `"splash"` with `./assets/splash-icon.png`, `"resizeMode": "contain"`, and `#0F172A` background color, completely eliminating launch screen white flash artifacts.
- **Android 13/14+ Notification Permission & Settings Guidance**: `notificationService.ts` verifies permission status via `requestNotificationPermissions(true)`. If ungranted, provides an interactive Thai guidance alert with a direct shortcut to system settings (`Linking.openSettings()`), enabling one-tap exact alarm and unconstrained battery optimization configuration.
- **Unified Remote Database Schema (`005_unified_schema_update.sql`)**: Applied and verified on Supabase Cloud, providing native database columns for `assets.sector`, `assets.currency`, `transactions.exchange_rate`, and `dividend_schedules.is_special`, with clean `DROP VIEW IF EXISTS public.view_asset_summary CASCADE` ensuring zero schema-cache errors.

### 5.10 Security, Key Hygiene & Edge Function Auth Guard Architecture
- **Zero Client Credential Leakage**:
  - Eliminated all hardcoded Supabase URLs and Anon Keys from `src/lib/supabase.ts` and `src/services/proxyClient.ts`.
  - Removed plaintext environment blocks from `eas.json` and eliminated demo credentials from code and `.env`. All credentials are read strictly from local `.env` (client) or Supabase Secrets (server).
  - SEC Thailand API Key (`SEC_API_KEY`) is stored strictly in Supabase Edge Function Secrets and never exposed in client bundles.
- **Edge Function Auth Guard Hardening**:
  - In `supabase/functions/stock-proxy/index.ts`, closed the dummy JWT token bypass and implemented strict **Fail-Closed** security architecture (immediately rejects requests with HTTP 401 if credentials are missing or invalid, completely eliminating fail-open bypass risks).
  - Auth Guard strictly validates incoming `apikey` and `Authorization` headers against server-side `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and cryptographically signed Supabase Auth user JWT sessions (`role: 'authenticated'`), ensuring legitimate authenticated app users and client requests seamlessly access upstream Yahoo Finance and SEC APIs while blocking all unauthorized traffic.
- **Database RLS Hardening (`009_harden_rls_policies.sql`)**:
  - Restricted `thai_funds_catalog` RLS for authenticated users strictly to `INSERT` and `UPDATE`, eliminating unauthorized `DELETE` capabilities and protecting the 5,790+ fund catalog from malicious deletion.
  - Hardened `portfolio_snapshots` RLS by removing legacy `anon` grants and `user_id IS NULL` loopholes, strictly enforcing `auth.uid() = user_id`.
- **Client Cache Privacy on Sign-Out & CSV Sanitization**:
  - `signOut()` in `src/services/authService.ts` clears both offline portfolio snapshot cache and benchmark valuation checkpoints (`clearPortfolioSnapshotsCache()`), preventing cross-user chart leakage on shared devices.
  - Implemented OWASP CSV Formula Injection sanitization (`sanitizeCsvField`) in `src/services/csvService.ts` by escaping formula prefixes (`=`, `+`, `-`, `@`) with single quotes upon export.

### 5.11 Multi-DCA Preservation & Transaction Integrity Architecture
- **Non-destructive Purchase Lot Preservation**: In `EditAssetModal.tsx`, when an asset contains multiple purchase transactions (`txCount > 1`), aggregate share count and cost basis inputs are strictly locked (`editable={false}` with visual lock badge `[ 🔒 DCA X ไม้ ]`).
- **Elimination of Destructive Transaction Collapsing**: Prevents user edits from inadvertently collapsing, aggregating, or overwriting individual historical purchase lots, ensuring purchase dates, historical FX rates, and lots remain authentic.
- **1-Tap Lot History Navigation**: Displays a minimal interactive navigation row (`[ 🧾 มีประวัติซื้อสะสม X รายการ • ดูประวัติแต่ละไม้ › ]`), allowing users to smoothly jump directly to the transaction history screen (`AssetsScreen.tsx`) to inspect, edit, or adjust specific purchase lots individually.

### 5.12 DPU Native Currency Standard & Payday Multi-Currency Support
- **Native Currency Storage**: The `dividend_schedules.dpu` column strictly stores values in the asset's native currency (USD for US stocks, THB for Thai stocks, mutual funds, and bank deposits). Redundant client-side FX pre-conversions are eliminated to prevent double currency conversion errors.
- **Multi-Currency Payday Confirmation**: The 1-click payday confirmation flow (`handleConfirmPayment`) checks asset currency. For USD assets, the confirmation prompt displays the net amount in `$USD` alongside the estimated THB equivalent (`$X.XX (~฿YY.YY)`), preventing user confusion while leaving `dpu` unaltered in the database (`payment_date` and `is_projected: false` updated only).

### 5.13 Rolling 12-Month Forward Horizon Architecture (Option 1)
- **12 Consecutive Forward Buckets**: Dynamically generates 12 consecutive monthly forecast buckets starting from the active calendar month (e.g., ต.ค. 2026 to ก.ย. 2027) via `new Date(currentYear, currentCalMonth + i, 1)`.
- **Elimination of Cross-Year Collision & Double Counting**: Dividend schedules map strictly by unique year-month key (`payoutMonthKey = YYYY-MM`). Past distributions in earlier years are excluded from the forward 12M window, and next year's same-named month (e.g. May 2027) occupies its own dedicated forward bucket (`พ.ค. '27`), completely preventing duplicate accumulation.
- **Minimal Aesthetic**: Features an emerald `Rolling 12M` pill badge, month span subtitle, and `▲ Now` marker on the current month bar.

### 5.14 Daily Portfolio Valuation Snapshots & Authentic Performance Tracking (`portfolio_snapshots`)
- **Daily Portfolio Snapshot Persistence**: The `portfolio_snapshots` table records daily portfolio valuation checkpoints (`total_market_value`, `total_cost`, `unrealized_pl`, `unrealized_pl_percent`) via `recordDailyPortfolioSnapshot` in `benchmarkService.ts` upon computing portfolio totals.
- **Authentic Performance Trajectory**: In `benchmarkService.ts`, when $\ge 2$ historical snapshots exist within the selected timeframe (1M, 3M, 6M, 1Y, ALL), plots authentic portfolio valuation points rather than synthetic straight lines, transitioning seamlessly with beta correlation fallback when snapshots are not yet populated.

### 5.15 Cloud-Persisted Stock Split Protection (`assets.last_split_date`)
- **Cloud-Persisted Split Status**: Persists applied stock split execution dates directly to Supabase Cloud via `assets.last_split_date` (TEXT, nullable) alongside local `AsyncStorage` caching.
- **Multi-Device Synchronization**: `detectPendingSplits` checks `last_split_date` from Cloud first, permanently preventing duplicate split prompts or double-split executions across different devices, Expo Go, and Web sessions.

### 5.16 Same-Month Next-Year (+1 Year Roll) & Trailing 365-Day Frequency Architecture
- **Elimination of Multi-Year Frequency Distortion**: In `priceSyncService.ts`, replaces cumulative lifetime count (`existingList.length`) with the Same-Month Next-Year (+1 Year Roll) strategy, rolling past schedules directly into the matching calendar month next year (`addMonthsSafe(xd_date, 12)`). This preserves authentic corporate distribution cycles (e.g. April & August for SET stocks) without requiring artificial frequency guessing.
- **Trailing 365-Day Frequency Guard**: For newly added assets with < 2 future schedules, evaluates schedule counts strictly within the trailing 365-day window (`countInLastYear`) rather than lifetime totals, guaranteeing frequency stability across decades of app usage.

### 5.17 Lifetime Cumulative Dividend Preservation for Liquidated Holdings
- **Preservation across 100% Exits**: In `returnService.ts` and `Dashboard.tsx`, received dividends from archived/liquidated assets (`is_archived: true`) remain permanently counted in `totalCumulativeDividends` and `totalReturn`.
- **Authentic Wealth Tracking**: Prevents historical cash dividends received in reality from vanishing from portfolio totals when a user trims or completely sells out of an asset position.

### 5.18 Foreign Dividend Exchange Rate Locking & Payday Auto-Lock (`received_fx_rate`, `autoLockPastForeignDividendRates`)
- **Realized Currency Freezing**: Persists `received_fx_rate` as `NUMERIC(15, 4)` in `dividend_schedules` upon user payday confirmation (`handleConfirmPayment`) or automated payday lock, freezing the THB valuation permanently and eliminating live FX volatility for past realized cashflow.
- **Automated Payday Lock for Passive Investors**: When daily price synchronization or dashboard load detects foreign dividend schedules where `payment_date <= today` that have not yet been manually locked, `autoLockPastForeignDividendRates` automatically locks the current exchange rate and transitions `is_projected = false`.

### 5.19 Adaptive Learned Payday Lag (`computeLearnedPayoutLag`) & Confirmed Payout Fallbacks
- **Market-Learned Settlement Lag**: Rather than assuming static settlement offsets, `computeLearnedPayoutLag` calculates asset-specific median lags between `xd_date` and `payment_date` (constrained to 5–45 days) from historical schedules, passing `learnedLagDays` into `estimatePayoutDate` for realistic cashflow calendarization.
- **Confirmed Dividend Fallback**: In `returnService.ts` and `Dashboard.tsx`, when a dividend is confirmed as received (`is_projected === false`) but purchase date recorded by the user overlaps with or falls after `xd_date` (`eligibleShares <= 0`), applies defensive fallback to shares held as of `payment_date` (or `net_shares`) so authentic verified cashflows are never discarded.

### 5.20 Median-Gap Bank Deposit Frequency Engine (`detectCashFrequency`)
- **Median Gap Analysis**: Analyzes median month intervals between scheduled interest dates (1 month = `MONTHLY`, 6 months = `SEMI_ANNUAL`, 12 months = `ANNUAL`) rather than naive schedule row counting, preventing interest compounding/divisor bugs across multi-year bank deposit schedules.

### 5.21 Automated Regression Test Suite (`scripts/test_dividend_logic.js`)
- **Continuous Logic Verification**: Suite of 33 automated unit and integration tests runnable via `npm test`, validating date parsing, learned lag calculation, cash deposit interest accrual, strict XD cutoff enforcement, confirmed payout fallbacks, foreign FX locking, CSV import/export roundtrips with formula injection protection, dynamic currency ticker routing, and single-gap annual dividend frequency detection.

### 5.22 Dual-Layer Thai Mutual Fund NAV Architecture & Real-Time SEC Engine (`web-fct-api.sec.or.th`)
- **Real-Time SEC Thailand Fund Check Integration**: Automatically queries the official SEC Thailand Fund Check API (`web-fct-api.sec.or.th`), providing real-time latest NAV per unit in ~200ms with Buddhist Era (`2569`) to ISO Gregorian date conversion (`YYYY-MM-DD`). In `stock-proxy`, requests pass full browser emulation headers (`User-Agent: Chrome`, `Referer`, `Origin: https://fundcheck.sec.or.th`) to completely bypass Akamai Bot Manager blocking (HTTP 403) from cloud serverless environments.
- **Resilient Direct Client Fallback**: Implements a zero-downtime direct client fallback in `fundService.ts` to `web-fct-api.sec.or.th` if the Supabase Edge Function is unreachable or pending deployment, mirroring the Yahoo Finance fallback in `stockService.ts`.
- **Smart Symbol Normalization**: Intelligently handles symbol variations (with and without hyphens, share class suffix variations like `SCBDVA` vs `SCBDV-A`, `KFGTECH` vs `KF-GTECH-A`, `KFHEALTH-D` vs `KF-HEALTHD`), ensuring accurate quote resolution across all asset management companies (AMCs).
- **Secondary SEC Open API v2 Fallback**: Retains the registered SEC Open API v2 (`daily-info/nav`) as an auxiliary backend fallback with `proj_id` lookup via `thai_funds_catalog`.
- **CSV Portfolio Import Parameter Integrity**: Standardizes parameter ordering in `csvService.ts` on `fetchFundNav(undefined, item.symbol)`, ensuring mutual fund NAV quotes are automatically pre-populated on CSV bulk uploads.

### 5.23 Dynamic Currency-First Stock Architecture & Payout Interval Engine
- **Decoupling from Hardcoded Static Lists**: Completely eliminates static `POPULAR_STOCKS` dependency for market routing. If asset `currency === 'THB'` or symbol ends with `.BK`, the ticker is dynamically mapped to the Thai SET exchange (`${symbol}.BK`) on Yahoo Finance, preserving native THB valuation and avoiding false FX conversions.
- **Database-First Currency Authority**: In `currencyService.ts` (`resolveIsUSStock`), database-persisted `currency === 'THB'` strictly takes precedence over in-memory dynamic registry caches, permanently guarding against symbol collisions between Thai and US equities (`AP`, `SC`, `EA`, `M`, `TRUE`).
- **Single-Interval Frequency Detection**: In `stockService.ts` (`fetchDividendAnalysis`), evaluates intervals when `gapsInMonths.length >= 1`, ensuring that annual dividend payers with trailing 12-month gaps are cleanly identified as `frequency = 1` (Annual) rather than falling into naively guessed semi-annual counts. Expands historical analysis window to 5 years (`range=5y`) for deep corporate payout tracking.

### 5.24 Multi-Decade DCA Scalability & Anti-Spam Velocity Protection (`011_anti_spam_velocity_guard.sql`, `csvService.ts`)
- **No Lifetime Cap for Buy & Hold DCA Investors**: Dividend investors holding assets over 10–30+ years should never be constrained by arbitrary lifetime transaction limits. Normal monthly DCA accumulation (~5–10 transactions/month) generates only ~1,200 rows in 20 years (~0.2 MB), comfortably within Supabase storage boundaries.
- **Rolling Anti-Spam Velocity Check (500 Tx / 24h)**: PostgreSQL trigger `trg_check_transaction_rate_limit` on `transactions` restricts inserts to 500 per 24 hours per user (`created_at >= NOW() - INTERVAL '24 hours'`). This completely neutralizes automated script flooding and disk space exhaustion attacks while leaving legitimate long-term accumulation completely unhindered.
- **CSV Import Flood Safeguard**: `csvService.ts` limits bulk file uploads to `MAX_CSV_IMPORT_ROWS = 500` and clips ticker symbols to 30 characters (`cleanSymbol.slice(0, 30)`), preventing device UI thread freezing and payload memory overflow.

### 5.25 PostgREST Query Hardening, Edge Function Rate Limiting & Backup Security (`stock-proxy`, `app.json`)
- **PostgREST Wildcard Injection Protection**: Replaced `.ilike('symbol', ...)` with exact `.eq('symbol', ...)` across `AddAssetModal.tsx` and `csvService.ts`. This eliminates PostgreSQL query hijacking or unintended pattern matching via `%` and `_` wildcards in user input or imported CSV files.
- **Edge Function Sliding-Window Rate Limiting**: In `supabase/functions/stock-proxy/index.ts`, implemented an in-memory sliding window rate limiter allowing up to 100 requests per minute per client IP/token. Exceeding requests are rejected immediately with HTTP 429 and `Retry-After: 60` headers, preventing external quote API quota exhaustion.
- **5-Minute Master Catalog Sync Cooldown**: Applied a 5-minute memory cooldown on `action === 'sync-funds'`, preventing repeated concurrent triggering of full 5,790+ fund catalog synchronization from exhausting server resources.
- **Android ADB Backup Mitigation**: Configured `"allowBackup": false` under `"android"` in `app.json` to prevent local device data extraction via ADB backup commands on unlocked devices.

---

## 6. Project File Structure
- `App.tsx`: Root Application Component with `RootErrorBoundary` and bottom tab navigation (`Overview`, `Portfolio`, `Holdings`)
- `index.ts`: Application entry point registering Root Component with Expo
- `app.json`: Expo configuration, Android permissions, splash screen, and plugin registry
- `eas.json`: Expo Application Services (EAS) Build configuration file for compiling standalone Android APK and AAB packages
- `src/`
  - `types/database.ts`: TypeScript Database Definitions for Supabase
  - `lib/supabase.ts`: Supabase Client initialization with AsyncStorage persistence
  - `screens/Dashboard.tsx`: Overview Dashboard with net worth hero card, category summary cards, payday radar, annual cashflow bar chart with year selector and dropdown filter, and passive income goal card
  - `screens/Portfolio.tsx`: Portfolio view with asset allocation donut pie chart, white callout lines, sector breakdown, and cumulative performance benchmark comparison
  - `screens/AssetsScreen.tsx`: Holdings and transaction history management screen with search, sorting, sparkline cards, and single-row minimal dropdown filters
  - `screens/AuthScreen.tsx`: Modern dark mode authentication screen with sign in, sign up, and password reset
  - `components/AddAssetModal.tsx`: Bottom sheet modal for adding assets, stock lookup autocomplete, USD/THB currency toggle, and live DCA detection
  - `components/EditAssetModal.tsx`: Bottom sheet modal for editing asset parameters, soft deletion, and stock split handling, with strict multi-DCA transaction locking and 1-tap navigation to individual lot history
  - `components/SellAssetModal.tsx`: Minimal bottom sheet modal for recording asset sales (SELL) and cash principal withdrawals (WITHDRAW) with 25-100% presets, over-sell validation, and automatic soft deletion upon 100% exit
  - `components/ImportCsvModal.tsx`: Bottom sheet modal for CSV portfolio import with file picker, direct paste, smart mapping, and live validation
  - `components/CalendarPickerModal.tsx`: Pure React Native modal calendar picker with month navigation and quick presets for purchase and XD dates
  - `components/SectorPickerModal.tsx`: Minimal bottom sheet modal picker for selecting GICS, AIMC, and deposit sector taxonomy
  - `components/AssetSparklineCard.tsx`: FinTech asset holding card with 7-day closing price sparkline area chart and Once-a-Day EOD caching
  - `components/CashAssetForm.tsx`: Modular form component for bank deposits, interest payout cycles, and pro-rata tax calculations
  - `components/CategoryBreakdownModal.tsx`: Bottom sheet modal displaying segment breakdown donut chart and 20,000 THB tax-free interest quota meter
  - `components/GoalSettingsModal.tsx`: Minimal bottom sheet modal for configuring monthly passive income goal targets and level presets
  - `components/HeroNetWorthCard.tsx`: Zero-jitter hero card displaying total portfolio net worth, unrealized P/L, dual dividend yields (Current & YoC), YoY comparison pill, and privacy masking
  - `components/UpcomingPaydayRadar.tsx`: Compact radar ticker displaying upcoming ex-dividend dates and bank interest payout events within 30 days with 1-click payday confirmation
  - `components/AdjustDividendModal.tsx`: Minimal bottom sheet modal for manual dividend payout adjustments, actual received verification, special dividend tagging, and DPU overrides
  - `components/AnnualComparisonSheet.tsx`: Bottom sheet modal comparing current projected annual dividend against prior year with special dividend disambiguation
  - `components/OfflineNoticeToast.tsx`: Non-intrusive floating toast capsule notifying users when offline cached data is being displayed
  - `services/authService.ts`: Authentication service handling Supabase sessions, password resets, and clean cache invalidation on sign-out
  - `services/userService.ts`: User profile service managing custom display names and dynamic English time-of-day greetings
  - `services/privacyService.ts`: Global privacy state management and cross-screen masking synchronization via AsyncStorage
  - `services/portfolioCacheService.ts`: Local offline snapshot caching and instant retrieval for portfolio assets, transactions, and dividend schedules using AsyncStorage with Stale-While-Revalidate support
  - `services/taxService.ts`: Thai bank deposit interest tax calculation engine (20,000 THB annual exemption threshold)
  - `services/currencyService.ts`: Dynamic multi-currency detection and runtime currency registry without static ticker lists (`resolveIsUSStock`, `registerSymbolCurrency`)
  - `services/sectorService.ts`: Standard GICS, AIMC, and deposit sector taxonomy classification service
  - `services/stockService.ts`: US/Thai stock search, closing price quotes, and FX rate retrieval service
  - `services/fundService.ts`: Thai mutual fund search, daily NAV quotes, and dividend history service via SEC Fund Check API & SEC Open API v2 with direct client fallback
  - `services/csvService.ts`: Portfolio CSV export, import parsing, column mapping, and automated asset creation service
  - `services/notificationService.ts`: Local ex-dividend (XD) notification scheduling service for Android
  - `services/assetConsolidationService.ts`: Position accumulation, duplicate asset consolidation, and schedule deduplication service
  - `services/benchmarkService.ts`: Portfolio cumulative return, alpha calculation, market benchmark comparison service (SET, S&P 500, NASDAQ) with Once-a-Day Caching, and daily portfolio snapshot trajectory plotting
  - `services/historyService.ts`: 7-day historical closing price caching service with Once-a-Day EOD cache and on-demand refresh
  - `services/priceSyncService.ts`: Automated daily market price and NAV synchronization service updating Supabase database with Same-Month Next-Year (+1 Year Roll) schedule generation and trailing 365-day frequency guards
  - `services/proxyClient.ts`: Centralized client helper for securely invoking the stock-proxy Supabase Edge Function with automatic authentication headers and timeout control
  - `services/splitService.ts`: Automated stock split detection, market event fetching, and 1-click share & cost adjustments engine with Supabase Cloud persistence (`assets.last_split_date`)
  - `services/returnService.ts`: Realized dividend income calculation and Total Return engine (Capital Gain + Dividends), permanently preserving received dividends from archived/liquidated holdings
  - `services/eventService.ts`: Lightweight pub-sub event emitter for real-time cross-tab portfolio synchronization without unmounting screens
  - `utils/dateUtils.ts`: Timezone-safe local date formatting and manipulation utilities preventing 1-day drift
- `scripts/`
  - `patch-expo-notifications.js`: Patch script resolving Expo Go Android notification crashes
  - `test_dividend_logic.js`: Comprehensive automated unit & integration test suite (39 test cases) runnable via `npm test`
  - `test_security_hardening.js`: Automated security hardening and penetration test suite (27 test cases) verifying auth guards, catalog write revocation, sliding window rate limits, cooldowns, and velocity guards
  - `test_performance_scenarios.js`: Scenario-based portfolio simulation runner (9 test cases) validating inception scaling, timeline axis generation, timeframe Baht/percentage harmony, alpha formatting, cash exclusion, and daily caching (total 75 automated tests across suites)
- `supabase/migrations/`
  - `005_unified_schema_update.sql`: Idempotent migration script adding sector, currency, exchange_rate, and is_special columns
  - `006_thai_funds_catalog.sql`: Master catalog table for 5,790+ registered Thai mutual funds with multi-column B-Tree indexes and public read access
  - `007_portfolio_snapshots_and_splits.sql`: Migration adding `assets.last_split_date` column and creating `portfolio_snapshots` table with RLS for authentic daily portfolio valuation history
  - `008_add_received_fx_rate_to_dividend_schedules.sql`: Migration script adding `received_fx_rate` column to `dividend_schedules` to freeze historical USD/THB exchange rates upon payout confirmation
  - `009_harden_rls_policies.sql`: Migration script hardening RLS policies on thai_funds_catalog (no DELETE for authenticated) and portfolio_snapshots (revoking anon, enforcing auth.uid() = user_id)
  - `010_secure_thai_funds_catalog.sql`: Migration script permanently revoking INSERT, UPDATE, DELETE permissions from public and authenticated on thai_funds_catalog, enforcing strict SELECT read-only access with server-side service role sync
  - `011_anti_spam_velocity_guard.sql`: Migration script creating PostgreSQL trigger `trg_check_transaction_rate_limit` on `transactions` table enforcing rolling velocity limit of 500 inserts per 24 hours per user without lifetime caps
- `supabase/functions/stock-proxy/`: Supabase Edge Function proxying Yahoo Finance and SEC Open API requests with cryptographic JWT verification, sliding window rate limiter (100 req/min), and 5-minute cooldown on sync-funds
