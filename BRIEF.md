# Project Brief: My dividend
Technical specification and system architecture document for the My dividend application, serving as the Single Source of Truth for development on ANTIGRAVITY IDE.

---

## 1. Project Overview
- **Project Name**: My dividend
- **Target Platforms**: Android Mobile (tested and previewed via Expo Go) and Web Preview
- **Core Stack**: Expo SDK 57 (React Native 0.86, React 19), TypeScript, Supabase (PostgreSQL, Row Level Security)
- **Primary Goal**: A streamlined, minimalist portfolio tracking and dividend management application categorizing 3 primary asset classes (Stocks, Mutual Funds, Cash/Fixed Income). It features 12-month net dividend and interest forecasting after withholding tax, advance ex-dividend (XD) reminders, automated US and Thai (SET) stock lookups with latest closing prices, Thai mutual fund NAV and dividend history integration via SEC Open API v2, and dual-currency purchase recording (USD to THB real-time conversion).

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
EXPO_PUBLIC_SUPABASE_URL=https://ycflookcrilaujmeillt.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# SEC_API_KEY is securely configured on Supabase Edge Function Secrets (never exposed to client bundle)
```

---

## 3. Database Architecture (Supabase PostgreSQL)
### Data Types & Constraints
- Financial figures, share quantities, and unit prices must strictly use `NUMERIC(15, 4)`. Never use `FLOAT` or `REAL` to prevent floating-point precision inaccuracies.
- The `transactions` table must include a `CHECK (shares >= 0)` constraint to prevent negative share balances.
- Soft Delete (`is_archived boolean default false`) is used instead of hard deletes to preserve historical dividend payment records.
- Every table has Row Level Security (RLS) enabled with policies supporting both Authenticated Users and Demo Sessions (`demo@mydividend.app`).

### Core Table Schemas
- `assets`: Manages asset master records
  - Fields: `id` (uuid, PK), `user_id` (uuid), `symbol` (text), `asset_type` (STOCKS | FUNDS | CASH), `current_price` (numeric(15,4)), `tax_rate` (numeric(15,4), default 0.1000), `is_archived` (boolean), `created_at` (timestamptz)
- `transactions`: Buy and deposit transaction logs
  - Fields: `id` (uuid, PK), `asset_id` (uuid, FK), `type` (BUY | SELL), `shares` (numeric(15,4)), `price_per_share` (numeric(15,4)), `transaction_date` (date), `exchange_rate` (numeric(15,4), default 1.0000)
- `dividend_schedules`: Dividend payment and projection schedules
  - Fields: `id` (uuid, PK), `asset_id` (uuid, FK), `dpu` (numeric(15,4)), `xd_date` (date), `payment_date` (date, nullable), `is_projected` (boolean)
- `view_asset_summary` (SQL View): Automatically computes net remaining shares (`net_shares`), weighted average cost (`weighted_average_cost`), total market value (`market_value`), total cost basis (`total_cost`), and Unrealized P/L directly in the database engine.

---

## 4. Key Features & Implementation Details

### 4.1 Dashboard & Navigation Structure
- **Navigation Tabs**: Standardized international naming across the bottom navigation bar:
  - `Overview` (Dashboard screen): Streamlined minimal cashflow hub containing net worth hero card, compact 3-category summary cards, upcoming payday radar, 12-month dividend/interest cashflow chart, and passive income goal card. Redundant bottom asset lists are omitted in favor of dedicated bottom tabs.
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

### 4.2 Dividend Forecasting Engine (12-Month Bar Chart)
- Visualizes 12-month net passive cashflow projections (January to December).
- **Net Dividend Formula**:
  $$\text{Net Inflow} = \text{Shares} \times \text{DPU} \times (1 - \text{tax\_rate})$$
  Taxes are calculated per asset (Thai stocks default to 10% `0.1000`, US stocks default to 15% `0.1500` under W-8BEN, Thai bank interest defaults to 0% or 15%, or custom user overrides).
- **Strict XD Cutoff Logic**: Includes only share lots acquired before the ex-dividend date (`transaction_date < xd_date`).
- Interactive monthly bar selection opens a modal detailing individual paying assets for that specific month with clear badges (`[Dividend]` vs `[Interest]`).
- **Current Month Visual Indicator**: Highlights the current calendar month with an emerald border track (`#059669`), emerald rounded month pill, and an upward caret with 'Now' badge (`▲ Now`), paired with an explicit legend row (`▲ Now = เดือนปัจจุบัน (ก.ย.)`) for instantaneous orientation.

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
- **0ms Catalog & Search**:
  - Pre-cached catalog of prominent Thai mutual funds across leading Asset Management Companies (KAsset, SCBAM, BBLAM, KSAM, UOBAM, TISCOAM, ONEAM, KTAM, Principal, etc.).
  - Full-text search by fund abbreviation (`K-USA`, `SCBDV`, `B-INNOTECH`, `KF-GTECH`), Thai name, or AMC name.
  - Distinct AMC badges: `[KAsset]`, `[SCBAM]`, `[BBLAM]`, `[KSAM]`.
- **Auto NAV Fetching**:
  - Automatically fetches the latest Net Asset Value per unit from the SEC API.
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
- **Security Auth Guard**: Enforces API key / Bearer token validation on all incoming requests to reject unauthorized scrapers (HTTP 401).
- **Client Helper (`proxyClient.ts`)**: Centralized service invoking `stock-proxy` with automatic `apikey` & `Authorization: Bearer <key>` header injection, strict 8-second request timeouts, and SDK fallback.
- Deployed at Supabase Project: `ycflookcrilaujmeillt`
- Endpoint: `/functions/v1/stock-proxy`
- Supported Actions:
  1. `action: "search"`: US & Thai stock search.
  2. `action: "quote"`: Stock prices and FX rates (`USDTHB=X`).
  3. `action: "dividends"`: Stock dividend distribution history.
  4. `action: "fund-nav"`: Daily mutual fund NAV from SEC API (`/v2/fund/daily-info/nav`).
  5. `action: "fund-dividends"`: Mutual fund dividend history from SEC API (`/v2/fund/daily-info/dividend-history`).
  6. `action: "history-7d"`: 7-day historical closing prices for sparkline area charts (`range=7d&interval=1d`).

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
  - **Crisp White Callout Lines**: Elegant directional lines linking chart slices directly to percentage and name badges, preventing overlapping labels.
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
  5. **Safe Multi-DCA Asset Editing**: In `EditAssetModal.tsx`, editing an asset with multiple DCA transactions consolidates all prior records into a single consolidated record with the new shares and cost basis, preventing duplicate transaction inflation.

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
       - **Balanced Headroom Scaling (~10-15%)**: Evaluates section counts (3, 4, 5) and clean step intervals (0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 15, 20, 25...) to provide tight, natural headroom (~10-15%) above peak data points. Curves never punch through the ceiling while avoiding excessive empty space above the graph.
       - Line 1: User Portfolio (Emerald `#10B981`, with subtle gradient area fill when uncompared).
       - Line 2: Selected Benchmark (Amber/Violet/Pink).
     - **Alpha / Outperformance Banner**: Dynamic summary card (e.g., `🎉 Outperforming S&P 500 by +3.5%` or `📊 Trailing benchmark by -1.2%`).
     - **Asset Return Ranking**: Ranked leaderboard of portfolio assets sorted from highest to lowest % gain (investment assets exclusively).
     - **Investment Isolation from Cash Deposits (Option A)**: In the Performance Tab, calculations for cumulative return, total invested cost, unrealized capital gain, benchmark curves (SET, S&P 500, NASDAQ), and the asset return ranking strictly isolate investment assets (STOCKS & FUNDS) from bank deposits (CASH). This eliminates return dilution (0% cash capital gain) and ensures fair, apple-to-apple equity index comparison. The Allocation Tab continues to display 100% of all asset classes.

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
  - Symmetrical CSV format matching `parseAndValidateCsv` schema (`symbol,asset_type,shares,cost_price,currency,transaction_date,expected_dpu,tax_rate`), guaranteeing 100% full portfolio restoration via `ImportCsvModal`.
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

---

### 4.20 Enhanced 30-Day Payday Radar & 1-Click Payment Confirmation
- Handled by: `src/components/UpcomingPaydayRadar.tsx`, `src/screens/Dashboard.tsx`
- **30-Day Forward Lookahead**: Expands the upcoming events window to 30 days, capturing both upcoming Ex-Dividend dates (`[ วัน XD ]`) and Payout dates (`[ เงินเข้า ]`).
- **Estimated Payout Dates**: Displays a tilde (`~D MMM`) when payment dates are forecasted based on standard settlement intervals (14 days for US stocks, 20 days for Thai assets).
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
- **Rolling 1-Year Forward Horizon**:
  - The 12-month bar chart utilizes a rolling 365-day forward horizon, ensuring that 4-quarter forecasts crossing calendar year boundaries are never prematurely truncated.

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
  - **Offline Resilience & Network Guarding**: Detects offline/network failures during sign-in, sign-up, password reset, and demo access, displaying clear, non-technical Thai guidance alerts (`Alert.alert('โหมดออฟไลน์', ...)`) rather than generic error codes.
  - **1-Click Demo Portfolio Access**: Instant sign-in shortcut into the 10-asset demonstration portfolio (`demo@mydividend.app` / `Password123!`).
- **Hygiene & Cache Clearance on Sign Out**:
  - Tapping the right-aligned exit door button (`[ 🚪 ]` `log-out-outline`) prompts native confirmation dialog.
  - On sign-out, clears local AsyncStorage portfolio cache (`clearPortfolioCache()`) and stored display names, preventing subsequent device users from viewing previous portfolio snapshots during cold-start.
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
- **DCA History Preservation in Asset Edit (`EditAssetModal.tsx`)**: When updating an asset with multiple DCA purchase records, the system preserves all historical transaction lots, dates, and recorded exchange rates intact, adjusting the primary record to reconcile the weighted cost basis and aggregate share count rather than hard-deleting prior purchases.
- **Schedule Deduplication on Position Accumulation (`AddAssetModal.tsx`, `assetConsolidationService.ts`)**: Adding to existing positions reuses existing projected dividend schedules and updates projected DPU, avoiding duplicate payment schedule rows for the same distribution cycle.
- **Full 12-Month Horizon for Monthly Dividend Stocks (`stockService.ts`)**: Monthly distribution stocks (e.g., Realty Income `O`) project across all 12 monthly distribution dates (`Math.min(frequency, 12)`), preventing the legacy 4-cycle truncation.
- **Direct Database Currency Resolution (`Dashboard.tsx`, `returnService.ts`, `currencyService.ts`)**: Currency conversion prioritizes database-persisted `item.currency === 'USD'` directly from Supabase assets, eliminating reliance on hardcoded static ticker lists and ensuring 100% accurate THB valuation for all global assets.
- **CSV Future Dividend Projection (`csvService.ts`)**: CSV imports dynamically project upcoming 12-month future ex-dividend dates based on historical payout intervals rather than back-dating `xd_date` to transaction purchase dates, ensuring imported assets immediately populate the 12-month cashflow forecast.
- **Real Benchmark Historical Return Calculation (`benchmarkService.ts`)**: Synchronizes authentic 1-year historical monthly closing data for SET (`^SET.BK`), S&P 500 (`^GSPC`), and NASDAQ (`^IXIC`) with authentic progress curves, eliminating simulated trigonometric wave jitter.
- **Dynamic Currency Resolution & Hardcoded List Elimination (`currencyService.ts`)**: Completely eliminated static ticker lists (`KNOWN_US_SYMBOLS`). Symbol currencies are determined dynamically from database persistence (`item.currency === 'USD'`), live market search metadata, and runtime symbol registry, preventing foreign assets from incorrectly falling back to THB.
- **Timezone Drift Protection (`src/utils/dateUtils.ts`)**: Standardized all date creation on `getLocalDateString()` rather than `new Date().toISOString().split('T')[0]`, preventing the 1-day date shift bug occurring across midnight (00:00–06:59 AM UTC+7) in purchase recordings, schedule generation, and calendar selections.

### 5.9 Standalone Android APK Build & EAS Configuration (`eas.json`)
- **EAS Build Architecture**: Configured via `eas.json` with a dedicated `preview` profile specifying `"buildType": "apk"` for direct installation on Android devices without Google Play Store intermediation, and a `production` profile with `"buildType": "app-bundle"` (AAB) for official store releases.
- **Dark Mode Splash Screen (`app.json`)**: Configured `"splash"` with `./assets/splash-icon.png`, `"resizeMode": "contain"`, and `#0F172A` background color, completely eliminating launch screen white flash artifacts.
- **Android 13/14+ Notification Permission & Settings Guidance**: `notificationService.ts` verifies permission status via `requestNotificationPermissions(true)`. If ungranted, provides an interactive Thai guidance alert with a direct shortcut to system settings (`Linking.openSettings()`), enabling one-tap exact alarm and unconstrained battery optimization configuration.
- **Unified Remote Database Schema (`005_unified_schema_update.sql`)**: Applied and verified on Supabase Cloud, providing native database columns for `assets.sector`, `assets.currency`, `transactions.exchange_rate`, and `dividend_schedules.is_special`, with clean `DROP VIEW IF EXISTS public.view_asset_summary CASCADE` ensuring zero schema-cache errors.

---

## 6. Project File Structure
- `App.tsx`: Root Application Component with `RootErrorBoundary` and bottom tab navigation (`Overview`, `Portfolio`, `Holdings`)
- `index.ts`: Application entry point registering Root Component with Expo
- `app.json`: Expo configuration, Android permissions, splash screen, and plugin registry
- `eas.json`: Expo Application Services (EAS) Build configuration file for compiling standalone Android APK and AAB packages
- `src/`
  - `types/database.ts`: TypeScript Database Definitions for Supabase
  - `lib/supabase.ts`: Supabase Client initialization with AsyncStorage persistence
  - `screens/Dashboard.tsx`: Overview Dashboard with net worth hero card, category summary cards, payday radar, 12-month cashflow chart, and passive income goal card
  - `screens/Portfolio.tsx`: Portfolio view with asset allocation donut pie chart, white callout lines, sector breakdown, and cumulative performance benchmark comparison
  - `screens/AssetsScreen.tsx`: Holdings and transaction history management screen with search, sorting, sparkline cards, and single-row minimal dropdown filters
  - `screens/AuthScreen.tsx`: Modern dark mode authentication screen with sign in, sign up, password reset, and 1-click demo portfolio access
  - `components/AddAssetModal.tsx`: Bottom sheet modal for adding assets, stock lookup autocomplete, USD/THB currency toggle, and live DCA detection
  - `components/EditAssetModal.tsx`: Bottom sheet modal for editing asset parameters and soft deletion
  - `components/ImportCsvModal.tsx`: Bottom sheet modal for CSV portfolio import with file picker, direct paste, smart mapping, and live validation
  - `components/AssetSparklineCard.tsx`: FinTech asset holding card with 7-day closing price sparkline area chart and Once-a-Day EOD caching
  - `components/CashAssetForm.tsx`: Modular form component for bank deposits, interest payout cycles, and pro-rata tax calculations
  - `components/CategoryBreakdownModal.tsx`: Bottom sheet modal displaying segment breakdown donut chart and 20,000 THB tax-free interest quota meter
  - `components/GoalSettingsModal.tsx`: Minimal bottom sheet modal for configuring monthly passive income goal targets and level presets
  - `components/HeroNetWorthCard.tsx`: Zero-jitter hero card displaying total portfolio net worth, unrealized P/L, dual dividend yields (Current & YoC), YoY comparison pill, and privacy masking
  - `components/UpcomingPaydayRadar.tsx`: Compact radar ticker displaying upcoming ex-dividend dates and bank interest payout events within 30 days with 1-click payday confirmation
  - `components/AdjustDividendModal.tsx`: Minimal bottom sheet modal for manual dividend payout adjustments, actual received verification, special dividend tagging, and DPU overrides
  - `components/AnnualComparisonSheet.tsx`: Bottom sheet modal comparing current projected annual dividend against prior year with special dividend disambiguation
  - `components/OfflineNoticeToast.tsx`: Non-intrusive floating toast capsule notifying users when offline cached data is being displayed
  - `services/authService.ts`: Authentication service handling Supabase sessions, demo logins, password resets, and clean cache invalidation on sign-out
  - `services/userService.ts`: User profile service managing custom display names and dynamic English time-of-day greetings
  - `services/privacyService.ts`: Global privacy state management and cross-screen masking synchronization via AsyncStorage
  - `services/portfolioCacheService.ts`: Local offline snapshot caching and instant retrieval for portfolio assets, transactions, and dividend schedules using AsyncStorage with Stale-While-Revalidate support
  - `services/taxService.ts`: Thai bank deposit interest tax calculation engine (20,000 THB annual exemption threshold)
  - `services/sectorService.ts`: Standard GICS, AIMC, and deposit sector taxonomy classification service
  - `services/stockService.ts`: US/Thai stock search, closing price quotes, and FX rate retrieval service
  - `services/fundService.ts`: Thai mutual fund search, daily NAV quotes, and dividend history service via SEC Open API v2
  - `services/csvService.ts`: Portfolio CSV export, import parsing, column mapping, and automated asset creation service
  - `services/notificationService.ts`: Local ex-dividend (XD) notification scheduling service for Android
  - `services/assetConsolidationService.ts`: Position accumulation, duplicate asset consolidation, and schedule deduplication service
  - `services/benchmarkService.ts`: Portfolio cumulative return, alpha calculation, and market benchmark comparison service (SET, S&P 500, NASDAQ)
  - `services/historyService.ts`: 7-day historical closing price caching service with Once-a-Day EOD cache and on-demand refresh
  - `services/priceSyncService.ts`: Automated daily market price and NAV synchronization service updating Supabase database with batch throttling (HTTP 429 protection)
  - `services/proxyClient.ts`: Centralized client helper for securely invoking the stock-proxy Supabase Edge Function with automatic authentication headers and timeout control
  - `services/splitService.ts`: Automated stock split detection, market event fetching, and 1-click share & cost adjustments engine protecting historical paid DPU
  - `services/returnService.ts`: Realized dividend income calculation and Total Return engine (Capital Gain + Dividends)
  - `utils/dateUtils.ts`: Timezone-safe local date formatting and manipulation utilities preventing 1-day drift
- `scripts/`
  - `patch-expo-notifications.js`: Patch script resolving Expo Go Android notification crashes
- `supabase/migrations/`
  - `005_unified_schema_update.sql`: Idempotent migration script adding sector, currency, exchange_rate, and is_special columns
- `supabase/functions/stock-proxy/`: Supabase Edge Function source code proxying Yahoo Finance and SEC Open API requests
