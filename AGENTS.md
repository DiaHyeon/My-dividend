# My dividend

Read BRIEF.md before doing anything. It is the single source of truth and contains all latest specifications, architecture, and features.

## Rules
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
- For Portfolio Performance and Benchmark comparisons, use `benchmarkService.ts` and always calculate dynamic scale bounds (`maxValue`, `stepValue`, `noOfSections`, `mostNegativeValue`, `overflowTop`) across both primary and secondary datasets to prevent graph overflow.
- For minimal dropdowns and filter selectors, use unified bottom sheet modal pickers with checkmarks for seamless mobile and web UX.
