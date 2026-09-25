import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { G as SvgG, Rect, Text as SvgText } from 'react-native-svg';
import { PieChart, LineChart, pieDataItem } from 'react-native-gifted-charts';
import { supabase } from '../lib/supabase';
import { AssetSummary, AssetType, DividendSchedule } from '../types/database';
import { AddAssetModal } from '../components/AddAssetModal';
import { EditAssetModal } from '../components/EditAssetModal';
import { getAllAssetCurrencies, getCachedExchangeRate, isKnownUSSymbol } from '../services/currencyService';
import { getSectorsForType, getAssetSector, SectorDefinition } from '../services/sectorService';
import { THAI_SAVINGS_TAX_FREE_LIMIT } from '../services/taxService';
import { consolidateDuplicateAssets } from '../services/assetConsolidationService';
import { usePrivacyMode } from '../services/privacyService';
import { ensureAuthenticated } from '../services/authService';
import { syncDailyPricesIfNeeded } from '../services/priceSyncService';
import {
  BenchmarkType,
  TimeframeType,
  BENCHMARKS,
  TIMEFRAMES,
  getBenchmarkComparison,
  syncBenchmarkReturns,
} from '../services/benchmarkService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface PortfolioProps {
  onNavigateToDashboard?: () => void;
  onNavigateToAssets?: (view?: 'HOLDINGS' | 'TRANSACTIONS', category?: 'ALL' | AssetType) => void;
  initialCategoryFilter?: 'ALL' | AssetType;
}

export const Portfolio: React.FC<PortfolioProps> = ({
  onNavigateToDashboard,
  onNavigateToAssets,
  initialCategoryFilter = 'ALL',
}) => {
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [dividendSchedules, setDividendSchedules] = useState<DividendSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAssetForEdit, setSelectedAssetForEdit] = useState<AssetSummary | null>(null);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number>(34.00);
  const [currencyMap, setCurrencyMap] = useState<Record<string, 'THB' | 'USD'>>({});
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<'ALL' | AssetType>(initialCategoryFilter);
  const [portfolioView, setPortfolioView] = useState<'ALLOCATION' | 'PERFORMANCE'>('ALLOCATION');
  const { isPrivate: isPrivateMode, toggle: togglePrivateMode } = usePrivacyMode();
  const [timeframe, setTimeframe] = useState<TimeframeType>('1Y');
  const [selectedBenchmark, setSelectedBenchmark] = useState<BenchmarkType>('NONE');
  const [isBenchmarkPickerVisible, setIsBenchmarkPickerVisible] = useState(false);

  useEffect(() => {
    if (initialCategoryFilter) {
      setActiveCategoryFilter(initialCategoryFilter);
    }
  }, [initialCategoryFilter]);

  const isUSStock = useCallback((item: AssetSummary): boolean => {
    if (item.asset_type !== 'STOCKS') return false;
    if (currencyMap[item.id] === 'USD') return true;
    if (currencyMap[item.id] === 'THB') return false;
    if (isKnownUSSymbol(item.symbol)) return true;
    if (item.tax_rate !== undefined && Math.abs(Number(item.tax_rate) - 0.15) < 0.005) return true;
    return false;
  }, [currencyMap]);

  const loadData = useCallback(async (forceSync = false) => {
    try {
      await ensureAuthenticated();

      // 0. Auto-consolidate any duplicate assets if present
      await consolidateDuplicateAssets();

      // 1. Fetch assets summary view
      const { data: summaryData, error: summaryError } = await supabase
        .from('view_asset_summary')
        .select('*')
        .order('created_at', { ascending: false });

      let loadedAssets = ((summaryData as AssetSummary[]) || []).filter((a) => !a.is_archived);

      // 1.1 Sync daily prices if new day or forced by pull-to-refresh
      if (loadedAssets.length > 0) {
        const pricesUpdated = await syncDailyPricesIfNeeded(loadedAssets, forceSync);
        if (pricesUpdated) {
          const { data: refreshedSummary, error: refreshedErr } = await supabase
            .from('view_asset_summary')
            .select('*')
            .order('created_at', { ascending: false });
          if (!refreshedErr && refreshedSummary) {
            loadedAssets = ((refreshedSummary as AssetSummary[]) || []).filter((a) => !a.is_archived);
          }
        }
      }

      if (!summaryError && summaryData) {
        setAssets(loadedAssets);
      }

      // Background sync benchmark indices (SET, S&P 500, NASDAQ) without blocking UI
      syncBenchmarkReturns(forceSync).catch(() => {});

      const activeAssetIds = loadedAssets.map((a) => a.id).filter(Boolean);

      // 2. Fetch dividend schedules only for active assets
      if (activeAssetIds.length > 0) {
        const { data: divData, error: divError } = await supabase
          .from('dividend_schedules')
          .select('id, asset_id, dpu, xd_date, payment_date, is_projected')
          .in('asset_id', activeAssetIds)
          .order('xd_date', { ascending: true });

        if (!divError && divData) {
          setDividendSchedules(divData as DividendSchedule[]);
        }
      } else {
        setDividendSchedules([]);
      }

      // 3. Fetch exchange rate & currency preferences
      const [rate, currencies] = await Promise.all([
        getCachedExchangeRate(),
        getAllAssetCurrencies(),
      ]);
      setExchangeRate(rate);
      setCurrencyMap(currencies);
    } catch (err: any) {
      console.warn('Portfolio loadData error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData(true);
  };

  // Filtered assets based on active category filter tab, sorted by highest market value first
  const filteredAssets = useMemo(() => {
    const list = activeCategoryFilter === 'ALL'
      ? assets
      : assets.filter((a) => a.asset_type === activeCategoryFilter);
    return [...list].sort(
      (a, b) => (Number(b.market_value) || 0) - (Number(a.market_value) || 0)
    );
  }, [assets, activeCategoryFilter]);

  // Overall Portfolio Metrics
  const totalMarketValue = useMemo(() => {
    return assets.reduce((sum, a) => sum + (Number(a.market_value) || 0), 0);
  }, [assets]);

  const totalCost = useMemo(() => {
    return assets.reduce((sum, a) => sum + (Number(a.total_cost) || 0), 0);
  }, [assets]);

  const totalUnrealizedPL = totalMarketValue - totalCost;
  const totalUnrealizedPLPercent = totalCost > 0 ? (totalUnrealizedPL / totalCost) * 100 : 0;

  // Investment Assets Metrics (STOCKS & FUNDS exclusively, excluding CASH deposits)
  const investmentAssets = useMemo(() => {
    return assets.filter((a) => a.asset_type !== 'CASH');
  }, [assets]);

  const investmentMarketValue = useMemo(() => {
    return investmentAssets.reduce((sum, a) => sum + (Number(a.market_value) || 0), 0);
  }, [investmentAssets]);

  const investmentCost = useMemo(() => {
    return investmentAssets.reduce((sum, a) => sum + (Number(a.total_cost) || 0), 0);
  }, [investmentAssets]);

  const investmentUnrealizedPL = investmentMarketValue - investmentCost;
  const investmentUnrealizedPLPercent = investmentCost > 0 ? (investmentUnrealizedPL / investmentCost) * 100 : 0;

  // Category values for Pie Chart
  const stocksTotal = useMemo(() => {
    return assets.filter((a) => a.asset_type === 'STOCKS').reduce((s, a) => s + (Number(a.market_value) || 0), 0);
  }, [assets]);

  const fundsTotal = useMemo(() => {
    return assets.filter((a) => a.asset_type === 'FUNDS').reduce((s, a) => s + (Number(a.market_value) || 0), 0);
  }, [assets]);

  const cashTotal = useMemo(() => {
    return assets.filter((a) => a.asset_type === 'CASH').reduce((s, a) => s + (Number(a.market_value) || 0), 0);
  }, [assets]);

  // Cash interest & tax meter
  const cashTaxSummary = useMemo(() => {
    const cashAssets = assets.filter((a) => a.asset_type === 'CASH');
    if (cashAssets.length === 0) return null;

    let totalDeposit = 0;
    let totalGrossInterest = 0;
    cashAssets.forEach((asset) => {
      const dep = Number(asset.market_value) || 0;
      totalDeposit += dep;
      const schedules = dividendSchedules.filter((s) => s.asset_id === asset.id);
      if (schedules.length > 0) {
        totalGrossInterest += schedules.reduce((acc, s) => acc + (Number(s.dpu) || 0) * (Number(asset.net_shares) || dep), 0);
      } else {
        totalGrossInterest += dep * 0.015;
      }
    });

    const isExceeded = totalGrossInterest > THAI_SAVINGS_TAX_FREE_LIMIT;
    const remainingQuota = Math.max(0, THAI_SAVINGS_TAX_FREE_LIMIT - totalGrossInterest);
    const quotaUsedPercent = (totalGrossInterest / THAI_SAVINGS_TAX_FREE_LIMIT) * 100;

    return {
      totalDeposit,
      totalGrossInterest,
      isExceeded,
      remainingQuota,
      quotaUsedPercent: Math.min(100, quotaUsedPercent),
    };
  }, [assets, dividendSchedules]);

  // Benchmark Comparison Memo: strictly calculated against investment assets (STOCKS + FUNDS) without CASH dilution
  const comparisonResult = useMemo(() => {
    return getBenchmarkComparison(
      timeframe,
      selectedBenchmark,
      investmentUnrealizedPLPercent,
      investmentAssets
    );
  }, [timeframe, selectedBenchmark, investmentUnrealizedPLPercent, investmentAssets]);

  // Dynamic Chart Y-Axis Scale Bounds: tight, natural headroom (~10-15%) so curves never punch through without excessive empty space
  const chartScale = useMemo(() => {
    const pVals = comparisonResult.portfolioData.map((d) => d.value || 0);
    const bVals =
      selectedBenchmark !== 'NONE'
        ? comparisonResult.benchmarkData.map((d) => d.value || 0)
        : [];
    const allVals = [...pVals, ...bVals];

    const maxVal = allVals.length > 0 ? Math.max(...allVals) : 5;
    const minVal = allVals.length > 0 ? Math.min(...allVals) : 0;
    const absMin = Math.abs(minVal);

    // Target peak headroom: ~12% above highest data point (min 1.0% headroom above peak, min ceiling 2%)
    const targetPeak = Math.max(maxVal * 1.12, maxVal + 1.0, 2);

    const NICE_STEPS = [
      0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100
    ];

    // Evaluate section counts [4, 5, 3] to find the tightest, most natural headroom
    let bestConfig = {
      stepValue: 5,
      noOfSections: 4,
      maxValue: 20,
    };
    let minOverheadRatio = Infinity;

    for (const sections of [4, 5, 3]) {
      // Step must accommodate both targetPeak / sections, and absMin / 3 (if negative)
      const neededForPositive = targetPeak / sections;
      const neededForNegative = minVal < 0 ? (absMin * 1.05) / 3 : 0;
      const neededStep = Math.max(neededForPositive, neededForNegative);

      const step = NICE_STEPS.find((s) => s >= neededStep) || Math.ceil(neededStep / 25) * 25;
      const candidateMax = step * sections;

      if (candidateMax >= maxVal) {
        const overhead = candidateMax / Math.max(maxVal, 1);
        if (overhead < minOverheadRatio) {
          minOverheadRatio = overhead;
          bestConfig = {
            stepValue: step,
            noOfSections: sections,
            maxValue: candidateMax,
          };
        }
      }
    }

    const { stepValue, noOfSections, maxValue } = bestConfig;

    let mostNegativeValue = 0;
    let noOfSectionsBelowXAxis = 0;
    if (minVal < 0) {
      noOfSectionsBelowXAxis = Math.max(1, Math.ceil((absMin * 1.05) / stepValue));
      mostNegativeValue = -(noOfSectionsBelowXAxis * stepValue);
    }

    return {
      maxValue,
      stepValue,
      noOfSections,
      mostNegativeValue,
      noOfSectionsBelowXAxis,
    };
  }, [comparisonResult, selectedBenchmark]);

  // Asset Performance Ranking (% Unrealized P/L descending) - investment assets only (exclude CASH)
  const performanceRanking = useMemo(() => {
    return [...investmentAssets].sort(
      (a, b) => (Number(b.unrealized_pl_percent) || 0) - (Number(a.unrealized_pl_percent) || 0)
    );
  }, [investmentAssets]);

  const selectedBenchmarkObj = useMemo(() => {
    return BENCHMARKS.find((b) => b.id === selectedBenchmark);
  }, [selectedBenchmark]);

  interface PortfolioPieDataItem extends pieDataItem {
    label: string;
    shortLabel?: string;
    percentText: string;
    isOther?: boolean;
  }

  // Donut Pie & Legend Data Generation (Option A: Major Assets with Callout Lines, Minor into Others)
  const { pieData, legendItems } = useMemo(() => {
    if (totalMarketValue <= 0) return { pieData: [] as PortfolioPieDataItem[], legendItems: [] };

    if (activeCategoryFilter === 'ALL') {
      const pData: PortfolioPieDataItem[] = [];
      const lItems: { id: string; color: string; label: string; val: number; pct: number }[] = [];

      if (stocksTotal > 0) {
        const pct = (stocksTotal / totalMarketValue) * 100;
        const rounded = Math.round(pct * 10) / 10;
        pData.push({
          value: Math.max(0.1, rounded),
          color: '#3B82F6',
          label: 'หุ้น (STOCKS)',
          shortLabel: 'หุ้น',
          percentText: `${pct.toFixed(1)}%`,
          strokeWidth: 2,
          strokeColor: '#0F172A',
        });
        lItems.push({
          id: 'stocks',
          color: '#3B82F6',
          label: `หุ้น (${pct.toFixed(1)}%)`,
          val: stocksTotal,
          pct,
        });
      }

      if (fundsTotal > 0) {
        const pct = (fundsTotal / totalMarketValue) * 100;
        const rounded = Math.round(pct * 10) / 10;
        pData.push({
          value: Math.max(0.1, rounded),
          color: '#8B5CF6',
          label: 'กองทุน (FUNDS)',
          shortLabel: 'กองทุน',
          percentText: `${pct.toFixed(1)}%`,
          strokeWidth: 2,
          strokeColor: '#0F172A',
        });
        lItems.push({
          id: 'funds',
          color: '#8B5CF6',
          label: `กองทุน (${pct.toFixed(1)}%)`,
          val: fundsTotal,
          pct,
        });
      }

      if (cashTotal > 0) {
        const pct = (cashTotal / totalMarketValue) * 100;
        const rounded = Math.round(pct * 10) / 10;
        pData.push({
          value: Math.max(0.1, rounded),
          color: '#10B981',
          label: 'เงินฝาก (CASH)',
          shortLabel: 'เงินฝาก',
          percentText: `${pct.toFixed(1)}%`,
          strokeWidth: 2,
          strokeColor: '#0F172A',
        });
        lItems.push({
          id: 'cash',
          color: '#10B981',
          label: `เงินฝาก (${pct.toFixed(1)}%)`,
          val: cashTotal,
          pct,
        });
      }

      return { pieData: pData, legendItems: lItems };
    }

    // Individual category breakdown by asset with Option A Grouping
    const categoryAssets = assets.filter((a) => a.asset_type === activeCategoryFilter);
    const catTotal = categoryAssets.reduce((s, a) => s + (Number(a.market_value) || 0), 0);
    if (catTotal <= 0) return { pieData: [] as PortfolioPieDataItem[], legendItems: [] };

    // Sort assets by market value descending
    const sorted = [...categoryAssets].sort(
      (a, b) => (Number(b.market_value) || 0) - (Number(a.market_value) || 0)
    );

    const THRESHOLD = 6.0; // Slices with < 6% are candidates for grouping into Others
    const majorAssets: AssetSummary[] = [];
    const minorAssets: AssetSummary[] = [];

    sorted.forEach((asset, idx) => {
      const val = Number(asset.market_value) || 0;
      const pct = (val / catTotal) * 100;
      // Keep top 3 or any asset >= THRESHOLD (up to top 5 major slices)
      if (idx < 5 && (pct >= THRESHOLD || idx < 3)) {
        majorAssets.push(asset);
      } else {
        minorAssets.push(asset);
      }
    });

    const PALETTE = ['#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#F97316', '#06B6D4'];
    const pData: PortfolioPieDataItem[] = [];
    const lItems: { id: string; color: string; label: string; val: number; pct: number; isOther?: boolean }[] = [];

    majorAssets.forEach((asset, idx) => {
      const val = Number(asset.market_value) || 0;
      const pct = (val / catTotal) * 100;
      const rounded = Math.round(pct * 10) / 10;
      const color = PALETTE[idx % PALETTE.length];
      const short = asset.symbol.length > 8 ? asset.symbol.substring(0, 7) + '..' : asset.symbol;

      pData.push({
        value: Math.max(0.1, rounded),
        color,
        label: asset.symbol,
        shortLabel: short,
        percentText: `${pct.toFixed(1)}%`,
        strokeWidth: 2,
        strokeColor: '#0F172A',
      });

      lItems.push({
        id: asset.id,
        color,
        label: `${asset.symbol} (${pct.toFixed(1)}%)`,
        val,
        pct,
      });
    });

    if (minorAssets.length > 0) {
      const otherVal = minorAssets.reduce((s, a) => s + (Number(a.market_value) || 0), 0);
      const otherPct = (otherVal / catTotal) * 100;
      const roundedOther = Math.round(otherPct * 10) / 10;
      const otherColor = '#64748B';

      pData.push({
        value: Math.max(0.1, roundedOther),
        color: otherColor,
        label: 'อื่นๆ (Others)',
        shortLabel: 'อื่นๆ',
        percentText: `${otherPct.toFixed(1)}%`,
        strokeWidth: 2,
        strokeColor: '#0F172A',
        isOther: true,
      });

      const minorSymbols = minorAssets.map((a) => a.symbol).join(', ');
      lItems.push({
        id: 'others_combined',
        color: otherColor,
        label: `อื่นๆ (${minorAssets.length} ตัว: ${minorSymbols}) (${otherPct.toFixed(1)}%)`,
        val: otherVal,
        pct: otherPct,
        isOther: true,
      });
    }

    return { pieData: pData, legendItems: lItems };
  }, [totalMarketValue, activeCategoryFilter, stocksTotal, fundsTotal, cashTotal, assets]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#059669" />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Bar */}
        <View style={styles.headerBar}>
          <View style={styles.headerTitleBox}>
            <Text style={styles.headerTitle}>พอร์ตการลงทุน (Portfolio)</Text>
            <Text style={styles.headerSubtitle}>
              สัดส่วนการกระจายความเสี่ยงและผลการดำเนินงาน ({assets.length} รายการ)
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.headerActionBtn, isPrivateMode && styles.headerActionBtnActive]}
            onPress={togglePrivateMode}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="โหมดความเป็นส่วนตัว"
          >
            <Ionicons
              name={isPrivateMode ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={isPrivateMode ? '#059669' : '#475569'}
            />
          </TouchableOpacity>
        </View>

        {/* Portfolio View Switcher: Allocation vs Performance */}
        <View style={styles.portfolioViewSwitcher}>
          <TouchableOpacity
            style={[styles.portfolioViewTab, portfolioView === 'ALLOCATION' && styles.portfolioViewTabActive]}
            onPress={() => setPortfolioView('ALLOCATION')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="pie-chart"
              size={15}
              color={portfolioView === 'ALLOCATION' ? '#0F172A' : '#64748B'}
            />
            <Text
              style={[
                styles.portfolioViewTabText,
                portfolioView === 'ALLOCATION' && styles.portfolioViewTabTextActive,
              ]}
            >
              สัดส่วนพอร์ต (Allocation)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.portfolioViewTab, portfolioView === 'PERFORMANCE' && styles.portfolioViewTabActive]}
            onPress={() => setPortfolioView('PERFORMANCE')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="trending-up"
              size={15}
              color={portfolioView === 'PERFORMANCE' ? '#0F172A' : '#64748B'}
            />
            <Text
              style={[
                styles.portfolioViewTabText,
                portfolioView === 'PERFORMANCE' && styles.portfolioViewTabTextActive,
              ]}
            >
              ผลงานพอร์ต (Performance)
            </Text>
          </TouchableOpacity>
        </View>

        {/* ========================================================================= */}
        {/* VIEW 1: PORTFOLIO ALLOCATION VIEW (PIE CHART & HOLDINGS PREVIEW) */}
        {/* ========================================================================= */}
        {portfolioView === 'ALLOCATION' && (
          <>
            {/* Category Filter Pills */}
        <View style={styles.filterPillsRow}>
          {[
            { key: 'ALL', label: 'ทั้งหมด' },
            { key: 'STOCKS', label: 'หุ้น (STOCKS)' },
            { key: 'FUNDS', label: 'กองทุน (FUNDS)' },
            { key: 'CASH', label: 'เงินฝาก (CASH)' },
          ].map((pill) => {
            const isActive = activeCategoryFilter === pill.key;
            return (
              <TouchableOpacity
                key={pill.key}
                style={[styles.filterPill, isActive && styles.filterPillActive]}
                onPress={() => setActiveCategoryFilter(pill.key as any)}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                  {pill.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Donut Pie Chart Card */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeaderRow}>
            <Ionicons name="pie-chart" size={18} color="#38BDF8" />
            <Text style={styles.chartCardTitle}>
              {activeCategoryFilter === 'ALL'
                ? 'สัดส่วนสินทรัพย์ตามหมวดหมู่ (Asset Allocation)'
                : `สัดส่วนสินทรัพย์ในหมวด ${activeCategoryFilter}`}
            </Text>
          </View>

          {totalMarketValue <= 0 ? (
            <View style={styles.emptyChartBox}>
              <Ionicons name="pie-chart-outline" size={40} color="#64748B" />
              <Text style={styles.emptyChartText}>ยังไม่มีสินทรัพย์ในพอร์ต</Text>
            </View>
          ) : (
            <View style={styles.chartContainer}>
              <PieChart
                data={pieData}
                donut={true}
                radius={SCREEN_WIDTH * 0.19}
                innerRadius={SCREEN_WIDTH * 0.11}
                innerCircleColor="#0F172A"
                strokeWidth={2}
                strokeColor="#0F172A"
                extraRadius={48}
                paddingHorizontal={32}
                paddingVertical={6}
                showExternalLabels={true}
                labelLineConfig={{
                  color: '#FFFFFF',
                  thickness: 1.5,
                  length: 16,
                  tailLength: 10,
                  avoidOverlappingOfLabels: true,
                  labelComponentHeight: 26,
                  labelComponentWidth: 62,
                  labelComponentMargin: 4,
                }}
                externalLabelComponent={(item?: any) => {
                  const shortLabel = item?.shortLabel || item?.label || '';
                  const percentText = item?.percentText || (item?.value !== undefined ? `${item.value}%` : '');
                  const strokeColor = item?.color || '#38BDF8';
                  return (
                    <SvgG>
                      <Rect
                        x={0}
                        y={-26}
                        width={62}
                        height={26}
                        rx={5}
                        fill="#0F172A"
                        stroke={strokeColor}
                        strokeWidth={1.5}
                      />
                      <SvgText
                        x={31}
                        y={-15}
                        fill="#94A3B8"
                        fontSize={8}
                        fontWeight="600"
                        textAnchor="middle"
                      >
                        {shortLabel}
                      </SvgText>
                      <SvgText
                        x={31}
                        y={-4}
                        fill="#FFFFFF"
                        fontSize={10}
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        {percentText}
                      </SvgText>
                    </SvgG>
                  );
                }}
                centerLabelComponent={() => (
                  <View style={styles.centerLabelBox}>
                    <Text style={styles.centerLabelText}>
                      {activeCategoryFilter === 'ALL' ? 'ทั้งพอร์ต' : activeCategoryFilter}
                    </Text>
                    <Text style={styles.centerLabelAmount}>
                      {isPrivateMode
                        ? '฿••••••'
                        : `฿${((activeCategoryFilter === 'ALL'
                            ? totalMarketValue
                            : (activeCategoryFilter === 'STOCKS' ? stocksTotal : (activeCategoryFilter === 'FUNDS' ? fundsTotal : cashTotal))) / 1000).toFixed(0)}k`}
                    </Text>
                  </View>
                )}
              />

              {/* Legends Row */}
              <View style={styles.legendContainer}>
                {legendItems.map((item) => (
                  <View key={item.id} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                    <Text style={styles.legendLabel} numberOfLines={1} ellipsizeMode="tail">
                      {item.label}
                    </Text>
                    <Text style={styles.legendVal}>
                      {isPrivateMode ? '฿••••••' : `฿${item.val.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Section Header: Holdings Preview & Link to AssetsScreen */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            สินทรัพย์หลัก ({Math.min(3, filteredAssets.length)} จาก {filteredAssets.length} รายการ)
          </Text>
          {onNavigateToAssets && (
            <TouchableOpacity
              onPress={() => onNavigateToAssets('HOLDINGS', activeCategoryFilter)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.seeAllText}>ดูทั้งหมด →</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Top 3 Preview or Empty */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#059669" />
            <Text style={styles.loadingText}>กำลังโหลดข้อมูล...</Text>
          </View>
        ) : filteredAssets.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="wallet-outline" size={48} color="#94A3B8" />
            <Text style={styles.emptyTitle}>ไม่มีสินทรัพย์ในหมวดนี้</Text>
            <Text style={styles.emptySubtitle}>แตะปุ่ม + ด้านล่างเพื่อเพิ่มสินทรัพย์ใหม่</Text>
          </View>
        ) : (
          <>
            {filteredAssets.slice(0, 3).map((item) => {
              const isUS = isUSStock(item);
              const rate = exchangeRate > 0 ? exchangeRate : 34.00;
              const currentPriceTHB = Number(item.current_price);
              const costPriceTHB = Number(item.weighted_average_cost);
              const currentPriceUSD = isUS ? currentPriceTHB / rate : 0;
              const costPriceUSD = isUS ? costPriceTHB / rate : 0;

              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.assetCard}
                  activeOpacity={0.7}
                  onPress={() => {
                    setSelectedAssetForEdit(item);
                    setIsEditModalVisible(true);
                  }}
                >
                  <View style={styles.assetHeader}>
                    <View style={styles.assetSymbolContainer}>
                      <View style={styles.assetSymbolTitleRow}>
                        <Text style={styles.assetSymbol}>{item.symbol}</Text>
                        {isUS && (
                          <View style={styles.usBadge}>
                            <Text style={styles.usBadgeText}>USD $</Text>
                          </View>
                        )}
                        <View style={styles.editBadge}>
                          <Ionicons name="pencil" size={11} color="#059669" />
                          <Text style={styles.editBadgeText}>แก้ไข</Text>
                        </View>
                      </View>
                      <View style={styles.assetTagRow}>
                        <Text style={styles.assetTypeTag}>{item.asset_type}</Text>
                        <Text style={styles.assetSharesTag}>
                          {item.asset_type === 'CASH'
                            ? (isPrivateMode ? 'เงินต้น ฿••••••' : `เงินต้น ฿${Number(item.market_value).toLocaleString()}`)
                            : isPrivateMode
                            ? (item.asset_type === 'FUNDS' ? '•••• หน่วย' : '•••• หุ้น')
                            : (item.asset_type === 'FUNDS'
                              ? `${Number(item.net_shares).toLocaleString('th-TH', { maximumFractionDigits: 4 })} หน่วย`
                              : `${Number(item.net_shares).toLocaleString('th-TH', { maximumFractionDigits: 4 })} หุ้น`)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.assetValueCol}>
                      <Text style={styles.assetMarketValue}>
                        {isPrivateMode
                          ? '฿••••••'
                          : `฿${Number(item.market_value).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </Text>
                      <Text
                        style={[
                          styles.assetPL,
                          Number(item.unrealized_pl) >= 0 ? styles.profitColor : styles.lossColor,
                        ]}
                      >
                        {isPrivateMode
                          ? `(${Number(item.unrealized_pl) >= 0 ? '+' : ''}${Number(item.unrealized_pl_percent).toFixed(2)}%)`
                          : `${Number(item.unrealized_pl) >= 0 ? '+' : ''}${Number(item.unrealized_pl).toLocaleString('th-TH', { minimumFractionDigits: 2 })} (${Number(item.unrealized_pl_percent).toFixed(2)}%)`}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}

            {onNavigateToAssets && (
              <TouchableOpacity
                style={styles.viewAllAssetsBtn}
                onPress={() => onNavigateToAssets('HOLDINGS', activeCategoryFilter)}
                activeOpacity={0.8}
              >
                <Ionicons name="receipt-outline" size={18} color="#059669" />
                <Text style={styles.viewAllAssetsBtnText}>
                  {filteredAssets.length > 3
                    ? `ดูสินทรัพย์ทั้งหมดอีก ${filteredAssets.length - 3} รายการ & ประวัติ ในแท็บสินทรัพย์ →`
                    : 'เปิดดูรายละเอียดและประวัติในแท็บสินทรัพย์ & ธุรกรรม →'}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </>
    )}

        {/* ========================================================================= */}
        {/* VIEW 2: PORTFOLIO PERFORMANCE VIEW (BENCHMARK COMPARISON & RANKINGS) */}
        {/* ========================================================================= */}
        {portfolioView === 'PERFORMANCE' && (
          <>
            {/* Performance Hero Card (Focus on Return %, not nominal net worth) */}
            <View style={styles.perfHeroCard}>
              <View style={styles.perfHeroTop}>
                <Text style={styles.perfHeroLabel}>ผลตอบแทนสะสม (หุ้น & กองทุน)</Text>
                <View style={styles.perfPeriodBadge}>
                  <Text style={styles.perfPeriodBadgeText}>
                    {TIMEFRAMES.find((t) => t.id === timeframe)?.label || timeframe}
                  </Text>
                </View>
              </View>

              <Text
                style={[
                  styles.perfHeroReturn,
                  comparisonResult.portfolioReturnPct >= 0 ? styles.profitColor : styles.lossColor,
                ]}
              >
                {comparisonResult.portfolioReturnPct >= 0 ? '+' : ''}
                {comparisonResult.portfolioReturnPct.toFixed(1)}%
              </Text>

              <View style={styles.perfHeroBottom}>
                <View
                  style={[
                    styles.perfHeroBadge,
                    investmentUnrealizedPL >= 0 ? styles.perfHeroBadgeProfit : styles.perfHeroBadgeLoss,
                  ]}
                >
                  <Ionicons
                    name={investmentUnrealizedPL >= 0 ? 'trending-up' : 'trending-down'}
                    size={12}
                    color={investmentUnrealizedPL >= 0 ? '#059669' : '#DC2626'}
                  />
                  <Text
                    style={[
                      styles.perfHeroBadgeText,
                      investmentUnrealizedPL >= 0 ? styles.profitColor : styles.lossColor,
                    ]}
                  >
                    {investmentUnrealizedPL >= 0 ? 'กำไร ' : 'ขาดทุน '}
                    {isPrivateMode
                      ? '฿••••••'
                      : `${investmentUnrealizedPL >= 0 ? '+' : ''}฿${Math.abs(investmentUnrealizedPL).toLocaleString('th-TH', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`}
                  </Text>
                </View>
                <Text style={styles.perfHeroCostText}>
                  เทียบกับเงินต้นลงทุน {isPrivateMode ? '฿••••••' : `฿${investmentCost.toLocaleString('th-TH', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}`}
                </Text>
              </View>
            </View>

            {/* Performance Comparison Line Chart Card */}
            <View style={styles.perfChartCard}>
              <View style={styles.perfChartHeader}>
                {/* Outperformance / Alpha Badge */}
                {selectedBenchmark !== 'NONE' ? (
                  <View
                    style={[
                      styles.perfAlphaBanner,
                      comparisonResult.outperforming
                        ? styles.perfAlphaBannerOutperform
                        : styles.perfAlphaBannerUnderperform,
                    ]}
                  >
                    <Ionicons
                      name={comparisonResult.outperforming ? 'trophy' : 'analytics'}
                      size={14}
                      color={comparisonResult.outperforming ? '#059669' : '#D97706'}
                    />
                    <Text
                      style={[
                        styles.perfAlphaText,
                        { color: comparisonResult.outperforming ? '#065F46' : '#B45309' },
                      ]}
                    >
                      {comparisonResult.outperforming
                        ? `พอร์ตของคุณชนะ ${selectedBenchmarkObj?.label} อยู่ +${comparisonResult.alphaPct.toFixed(1)}% (Outperforming)`
                        : `พอร์ตของคุณตามหลัง ${selectedBenchmarkObj?.label} อยู่ ${comparisonResult.alphaPct.toFixed(1)}%`}
                    </Text>
                  </View>
                ) : null}

                {/* Interactive Comparison Chips / Dropdown Header (Style reference like TradingView / Google Finance) */}
                <View style={styles.perfChartLegends}>
                  {/* Portfolio Legend Chip */}
                  <View style={styles.perfPortfolioChip}>
                    <View style={styles.perfPortfolioChipSquare} />
                    <Text style={styles.perfPortfolioChipText}>
                      พอร์ตของคุณ ({comparisonResult.portfolioReturnPct >= 0 ? '+' : ''}
                      {comparisonResult.portfolioReturnPct.toFixed(1)}%)
                    </Text>
                  </View>

                  {/* Benchmark Dropdown Chip */}
                  {selectedBenchmark !== 'NONE' ? (
                    <View style={styles.perfBenchmarkChip}>
                      <TouchableOpacity
                        style={styles.perfBenchmarkChipMain}
                        onPress={() => setIsBenchmarkPickerVisible(true)}
                        activeOpacity={0.7}
                      >
                        <View
                          style={[
                            styles.perfLegendDot,
                            { backgroundColor: selectedBenchmarkObj?.color || '#F59E0B' },
                          ]}
                        />
                        <Text style={styles.perfBenchmarkChipText} numberOfLines={1}>
                          {selectedBenchmarkObj?.shortLabel || selectedBenchmarkObj?.label} ({comparisonResult.benchmarkReturnPct >= 0 ? '+' : ''}
                          {comparisonResult.benchmarkReturnPct.toFixed(1)}%)
                        </Text>
                        <Ionicons
                          name="chevron-down"
                          size={11}
                          color="#64748B"
                        />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.perfBenchmarkChipCloseBtn}
                        onPress={() => setSelectedBenchmark('NONE')}
                        activeOpacity={0.6}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 8 }}
                      >
                        <Ionicons name="close" size={13} color="#64748B" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.perfAddBenchmarkChip}
                      onPress={() => setIsBenchmarkPickerVisible(true)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="add" size={13} color="#475569" />
                      <Text style={styles.perfAddBenchmarkText}>เปรียบเทียบ</Text>
                      <Ionicons name="chevron-down" size={11} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Line Chart with Dynamic Safe Scale Bounds */}
              {loading ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="small" color="#10B981" />
                </View>
              ) : (
                <View style={styles.lineChartBox}>
                  <LineChart
                    data={comparisonResult.portfolioData}
                    {...(selectedBenchmark !== 'NONE' ? { data2: comparisonResult.benchmarkData } : {})}
                    color="#10B981"
                    color2={selectedBenchmarkObj?.color || '#8B5CF6'}
                    thickness={2.8}
                    thickness2={2.2}
                    curved
                    isAnimated
                    rulesType="dashed"
                    rulesColor="#E2E8F0"
                    yAxisTextStyle={styles.chartAxisText}
                    xAxisLabelTextStyle={styles.chartAxisText}
                    yAxisLabelSuffix="%"
                    maxValue={chartScale.maxValue}
                    stepValue={chartScale.stepValue}
                    noOfSections={chartScale.noOfSections}
                    {...(chartScale.mostNegativeValue < 0
                      ? {
                          mostNegativeValue: chartScale.mostNegativeValue,
                          noOfSectionsBelowXAxis: chartScale.noOfSectionsBelowXAxis,
                        }
                      : {})}
                    overflowTop={10}
                    height={185}
                    width={SCREEN_WIDTH - 84}
                    initialSpacing={15}
                    spacing={(SCREEN_WIDTH - 110) / (comparisonResult.portfolioData.length || 6)}
                    {...(selectedBenchmark === 'NONE'
                      ? {
                          areaChart: true,
                          startFillColor: '#10B981',
                          endFillColor: '#10B981',
                          startOpacity: 0.2,
                          endOpacity: 0.02,
                        }
                      : {})}
                  />
                </View>
              )}
            </View>

            {/* Timeframe Bar (Located below the chart) */}
            <View style={styles.timeframeBar}>
              {TIMEFRAMES.map((tf) => {
                const isActive = timeframe === tf.id;
                return (
                  <TouchableOpacity
                    key={tf.id}
                    style={[styles.timeframeChip, isActive && styles.timeframeChipActive]}
                    onPress={() => setTimeframe(tf.id)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[styles.timeframeChipText, isActive && styles.timeframeChipTextActive]}
                    >
                      {tf.id}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Asset Performance Ranking List */}
            <View style={styles.rankingSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.rankingSectionTitle}>
                  จัดอันดับผลตอบแทนรายสินทรัพย์ลงทุน ({performanceRanking.length} รายการ)
                </Text>
              </View>

              {performanceRanking.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptySubtitle}>ยังไม่มีรายการสินทรัพย์</Text>
                </View>
              ) : (
                performanceRanking.map((item, idx) => {
                  const plPct = Number(item.unrealized_pl_percent) || 0;
                  const isProfit = plPct >= 0;
                  const plAmount = Number(item.unrealized_pl) || 0;
                  const mVal = Number(item.market_value) || 0;

                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.rankingCard}
                      activeOpacity={0.7}
                      onPress={() => {
                        setSelectedAssetForEdit(item);
                        setIsEditModalVisible(true);
                      }}
                    >
                      <View style={styles.rankingLeft}>
                        <View style={styles.rankingRankBadge}>
                          <Text style={styles.rankingRankText}>#{idx + 1}</Text>
                        </View>
                        <View>
                          <View style={styles.rankingSymbolRow}>
                            <Text style={styles.rankingSymbol}>{item.symbol}</Text>
                            <Text style={styles.rankingTypeTag}>{item.asset_type}</Text>
                          </View>
                          <Text style={styles.rankingValue}>
                            มูลค่า {isPrivateMode ? '฿••••••' : `฿${mVal.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.rankingRight}>
                        <View
                          style={[
                            styles.rankingBadge,
                            isProfit ? styles.rankingBadgeProfit : styles.rankingBadgeLoss,
                          ]}
                        >
                          <Ionicons
                            name={isProfit ? 'arrow-up' : 'arrow-down'}
                            size={11}
                            color={isProfit ? '#059669' : '#EF4444'}
                          />
                          <Text
                            style={[
                              styles.rankingBadgeText,
                              isProfit ? styles.profitColor : styles.lossColor,
                            ]}
                          >
                            {isProfit ? '+' : ''}
                            {plPct.toFixed(2)}%
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.rankingPLAmount,
                            isProfit ? styles.profitColor : styles.lossColor,
                          ]}
                        >
                          {isPrivateMode
                            ? '฿••••••'
                            : `${isProfit ? '+' : ''}฿${plAmount.toLocaleString('th-TH', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Add Asset FAB Modal */}
      <AddAssetModal onSuccess={loadData} />

      {/* Edit Asset Modal */}
      <EditAssetModal
        visible={isEditModalVisible}
        asset={selectedAssetForEdit}
        onClose={() => setIsEditModalVisible(false)}
        onSuccess={() => {
          loadData();
          setIsEditModalVisible(false);
        }}
      />

      {/* Benchmark Dropdown Picker Modal */}
      <Modal
        visible={isBenchmarkPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsBenchmarkPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsBenchmarkPickerVisible(false)}
        >
          <TouchableOpacity
            style={styles.benchmarkModalContainer}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <View style={styles.benchmarkModalHeader}>
              <View style={styles.benchmarkModalHeaderLeft}>
                <Ionicons name="stats-chart" size={18} color="#0F172A" />
                <Text style={styles.benchmarkModalTitle}>เลือกดัชนีตลาดเปรียบเทียบ</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsBenchmarkPickerVisible(false)}
                style={styles.benchmarkModalCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.benchmarkModalHint}>
              เลือกดัชนีตลาดเพื่อเปรียบเทียบผลตอบแทนและวิเคราะห์ค่า Alpha ของพอร์ตคุณ
            </Text>

            {/* Benchmark Options */}
            <View style={styles.benchmarkModalList}>
              {BENCHMARKS.map((b) => {
                const isSelected = selectedBenchmark === b.id;
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={[
                      styles.benchmarkModalItem,
                      isSelected && styles.benchmarkModalItemSelected,
                    ]}
                    onPress={() => {
                      setSelectedBenchmark(b.id);
                      setIsBenchmarkPickerVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.benchmarkModalItemLeft}>
                      <View
                        style={[
                          styles.benchmarkModalIconCircle,
                          {
                            backgroundColor:
                              b.id !== 'NONE' ? `${b.color}18` : '#F1F5F9',
                          },
                        ]}
                      >
                        <Ionicons
                          name={b.icon as any}
                          size={18}
                          color={b.id !== 'NONE' ? b.color : '#64748B'}
                        />
                      </View>
                      <View style={styles.benchmarkModalItemTextWrap}>
                        <Text
                          style={[
                            styles.benchmarkModalItemTitle,
                            isSelected && styles.benchmarkModalItemTitleSelected,
                          ]}
                        >
                          {b.label}
                        </Text>
                        <Text style={styles.benchmarkModalItemSubtitle}>
                          {b.name}
                        </Text>
                      </View>
                    </View>

                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={20} color="#059669" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerTitleBox: {
    flex: 1,
  },
  headerActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  headerActionBtnActive: {
    backgroundColor: 'rgba(5, 150, 105, 0.1)',
    borderColor: '#A7F3D0',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  portfolioViewSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
  },
  portfolioViewTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
  },
  portfolioViewTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  portfolioViewTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  portfolioViewTabTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  perfHeroCard: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    padding: 18,
    marginBottom: 12,
  },
  perfHeroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  perfHeroLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  perfPeriodBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  perfPeriodBadgeText: {
    fontSize: 11,
    color: '#E2E8F0',
    fontWeight: '700',
  },
  perfHeroReturn: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginVertical: 4,
  },
  perfHeroBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  perfHeroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  perfHeroBadgeProfit: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  perfHeroBadgeLoss: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  perfHeroBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  perfHeroCostText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  timeframeBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  timeframeChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 7,
  },
  timeframeChipActive: {
    backgroundColor: '#0F172A',
  },
  timeframeChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  timeframeChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  perfPortfolioChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  perfPortfolioChipSquare: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: '#10B981',
  },
  perfPortfolioChipText: {
    fontSize: 11.5,
    color: '#0F172A',
    fontWeight: '700',
  },
  perfBenchmarkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 4.5,
  },
  perfBenchmarkChipMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  perfBenchmarkChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  perfBenchmarkChipCloseBtn: {
    marginLeft: 6,
    padding: 2,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perfAddBenchmarkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  perfAddBenchmarkText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  benchmarkModalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 36,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 12,
  },
  benchmarkModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  benchmarkModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  benchmarkModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  benchmarkModalCloseBtn: {
    padding: 4,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
  },
  benchmarkModalHint: {
    fontSize: 11.5,
    color: '#64748B',
    marginBottom: 14,
  },
  benchmarkModalList: {
    gap: 8,
  },
  benchmarkModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  benchmarkModalItemSelected: {
    backgroundColor: '#F0FDF4',
    borderColor: '#10B981',
    borderWidth: 1.5,
  },
  benchmarkModalItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  benchmarkModalIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benchmarkModalItemTextWrap: {
    flex: 1,
  },
  benchmarkModalItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  benchmarkModalItemTitleSelected: {
    color: '#065F46',
  },
  benchmarkModalItemSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  perfChartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  perfChartHeader: {
    marginBottom: 10,
  },
  perfAlphaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    marginBottom: 8,
  },
  perfAlphaBannerOutperform: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  perfAlphaBannerUnderperform: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  perfAlphaText: {
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 1,
  },
  perfChartLegends: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  perfLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  lineChartBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginLeft: -16,
    overflow: 'hidden',
  },
  chartAxisText: {
    fontSize: 9,
    color: '#94A3B8',
  },
  rankingSection: {
    marginBottom: 16,
  },
  rankingSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  rankingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rankingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rankingRankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankingRankText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  rankingSymbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rankingSymbol: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  rankingTypeTag: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  rankingValue: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  rankingRight: {
    alignItems: 'flex-end',
  },
  rankingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 2,
  },
  rankingBadgeProfit: {
    backgroundColor: '#ECFDF5',
  },
  rankingBadgeLoss: {
    backgroundColor: '#FEF2F2',
  },
  rankingBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  rankingPLAmount: {
    fontSize: 10,
    fontWeight: '600',
  },
  profitColor: {
    color: '#10B981',
  },
  lossColor: {
    color: '#EF4444',
  },
  filterPillsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  filterPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  chartCard: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'center',
  },
  chartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  chartCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  chartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    width: '100%',
  },
  centerLabelBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabelText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
  },
  centerLabelAmount: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    minHeight: 17,
  },
  legendContainer: {
    width: '100%',
    marginTop: 10,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 20,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  legendLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: '#CBD5E1',
    flex: 1,
  },
  legendVal: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    minHeight: 16,
  },
  emptyChartBox: {
    paddingVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyChartText: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 8,
  },
  taxQuotaBox: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    width: '100%',
  },
  taxQuotaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  taxQuotaTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#34D399',
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: '#334155',
    borderRadius: 3,
    overflow: 'hidden',
    marginVertical: 4,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  taxQuotaFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  taxQuotaText: {
    fontSize: 10,
    color: '#64748B',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  viewAllAssetsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginTop: 8,
    gap: 8,
  },
  viewAllAssetsBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
    textAlign: 'center',
  },
  sectionHint: {
    fontSize: 11,
    color: '#94A3B8',
  },
  loadingBox: {
    paddingVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 8,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
  },
  assetCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  assetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  assetSymbolContainer: {
    flex: 1,
  },
  assetSymbolTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  assetSymbol: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  usBadge: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  usBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  editBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  editBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  assetTagRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  assetTypeTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  assetSharesTag: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  assetValueCol: {
    alignItems: 'flex-end',
  },
  assetMarketValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  assetPL: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  assetFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  assetFooterText: {
    fontSize: 11,
    color: '#64748B',
  },
  bottomSpacer: {
    height: 30,
  },
});
