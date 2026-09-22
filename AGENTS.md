# My dividend

Read BRIEF.md before doing anything. It is the single source of truth and contains all latest specifications, architecture, and features.

## Rules
- **Scope & Communication Protocol**: Always state clearly and explicitly what you are going to do before doing it, and strictly NEVER exceed or do more than what was requested or stated (ห้ามทำเกินกว่าที่บอกโดยเด็ดขาด).
- Stack is Expo + TypeScript (Expo SDK 57).
- Read the exact versioned Expo docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.
- All monetary and share counts must be NUMERIC(15, 4) (never use FLOAT or REAL).
- Every Supabase table must have Row Level Security (RLS) enabled.
- Never commit secret keys or sensitive URLs into version control; keep them in .env.
- Explain any file you create, in one sentence.
- Always run Expo with `--tunnel` mode (`node ./node_modules/expo/bin/cli start --tunnel --go --web`) due to network AP isolation.
- Keep components modular: extract dedicated sub-components (e.g., `CashAssetForm.tsx` for bank deposits/tax) to keep components small, fast to inspect, and easy to maintain.
- For all cash/deposit interest and tax calculations, use `taxService.ts` and `CashAssetForm.tsx` as the standard components.
- Always use `SafeAreaView` and `SafeAreaProvider` from `react-native-safe-area-context` (never use the deprecated `SafeAreaView` from `react-native`).
- Charts from `react-native-gifted-charts` require `expo-linear-gradient` and `react-native-svg`.
- For Thai mutual funds (`FUNDS`), use SEC Open API (`fundService.ts`), denominate strictly in THB (no USD toggle), and preserve exact symbol matching.
- For position accumulation and buy DCA, maintain unique holdings by `(symbol, asset_type)` via `assetConsolidationService.ts` and record multi-buy details in `transactions`.
- For Portfolio Performance and Benchmark comparisons, use `benchmarkService.ts` and always calculate dynamic scale bounds (`maxValue`, `stepValue`, `noOfSections`, `mostNegativeValue`, `overflowTop`) across both primary and secondary datasets with balanced ~10-15% headroom to prevent graph overflow while avoiding excessive empty space above curves.
- For minimal dropdowns and filter selectors, use unified bottom sheet modal pickers with checkmarks for seamless mobile and web UX.
- For Add Asset Modal, maintain a compact minimal 2-column layout with built-in pure React Native CalendarPickerModal for dates, automated smart segment badge with modal override, inline search clear button (`close-circle`) for fast form reset, and a minimal review & confirmation step before submitting to prevent careless entry errors.
- For monthly passive income goals and presets, use `GoalSettingsModal.tsx` and AsyncStorage key `@mydividend_monthly_goal`.
- For Privacy Mode, format monetary values with masking (`฿••••••`) while keeping percentage and Yield on Cost ratios visible. Place the frameless eye toggle directly beside the net worth label in the Hero Card, and rely on pull-to-refresh without separate refresh buttons to maintain a clean, distraction-free interface.
- For Upcoming Payday Radar, calculate schedule differences within 14 days and sort chronologically with clear days-remaining countdowns.
- For asset holdings cards and sparkline area charts, use `AssetSparklineCard.tsx` and `historyService.ts` with Once-a-Day EOD caching and on-demand refresh to minimize external API calls.
- For CSV portfolio bulk import and export, use `csvService.ts` and `ImportCsvModal.tsx` with PapaParse, flexible auto-mapping, and NUMERIC(15, 4) sanitization.
- For bottom navigation tabs, use standardized international names: `Overview` (Dashboard), `Portfolio`, and `Holdings` (Assets) with balanced, distraction-free icons.
- For individual transaction editing, deletion, and DCA adjustments, use `EditTransactionModal.tsx` with automatic zero-share asset cleanup and `view_asset_summary` recalculation.
- For automated daily market price and NAV synchronization, use `priceSyncService.ts` with Once-a-Day caching (`@my_dividend_last_price_sync_date`), pull-to-refresh force sync, and `assets.current_price` Supabase batch updates with NUMERIC(15, 4).
- For the 12-month cashflow bar chart on Overview, highlight the current calendar month with an emerald border track, rounded month label pill, and `▲ Now` indicator badge with an explicit legend row.
- For Supabase Edge Function proxy calls, use `proxyClient.ts` with automatic `apikey`/`Authorization` headers, strict timeout control, and resilient fallback.
- For tab navigation and screen state preservation, keep `Dashboard`, `Portfolio`, and `AssetsScreen` continuously mounted in `App.tsx` using `styles.screenWrapper` with `display: 'flex' | 'none'`, ensuring zero-latency tab switching, scroll position retention, and elimination of redundant database queries on switch.
- For Hero Net Worth and Upcoming Payday Radar on Overview, use dedicated modular subcomponents `HeroNetWorthCard.tsx` and `UpcomingPaydayRadar.tsx`.
- For manual dividend payout adjustments, actual received verification, and DPU overrides, use `AdjustDividendModal.tsx` with dual-sync DPU/Net calculation and NUMERIC(15, 4) precision.
- For client-side data safety and soft deletes, always apply defensive filtering (`.filter((a) => !a.is_archived)`) across all views and screens to prevent archived records from affecting portfolio totals.
- For stock split detection and one-click share/cost adjustments, use `splitService.ts` and `EditAssetModal.tsx` with `NUMERIC(15, 4)` precision and date-based purchase filtering (`transaction_date < split.date`).
- For notification hygiene, prune scheduled XD reminders on asset deletion and run `cleanOrphanedReminders` on dashboard load.
- For Total Return and cumulative dividends, use `returnService.ts` to separate Capital Gain from cumulative cash dividends, displaying both metrics cleanly on `HeroNetWorthCard.tsx` and `AssetSparklineCard.tsx`.


