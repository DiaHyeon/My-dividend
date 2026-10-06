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
  Alert,
  Modal,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AssetSummary, Transaction, DividendSchedule, AssetType } from '../types/database';
import { AddAssetModal } from '../components/AddAssetModal';
import { EditAssetModal } from '../components/EditAssetModal';
import { CategoryBreakdownModal } from '../components/CategoryBreakdownModal';
import { GoalSettingsModal, GOAL_STORAGE_KEY, GOAL_PRESETS } from '../components/GoalSettingsModal';
import { UpcomingPaydayRadar, UpcomingSchedule, ClosestSchedule } from '../components/UpcomingPaydayRadar';
import { HeroNetWorthCard } from '../components/HeroNetWorthCard';
import { AdjustDividendModal, AdjustDividendTarget, getSpecialScheduleIds } from '../components/AdjustDividendModal';
import { AnnualComparisonSheet, PriorYearDividendItem } from '../components/AnnualComparisonSheet';

import { getAllAssetCurrencies, getCachedExchangeRate, resolveIsUSStock } from '../services/currencyService';
import { calculateScheduleCashPayout, detectCashFrequency } from '../services/taxService';
import { consolidateDuplicateAssets } from '../services/assetConsolidationService';
import { usePrivacyMode } from '../services/privacyService';
import { ensureAuthenticated, signOut } from '../services/authService';
import { getTimeGreeting, getUserDisplayName } from '../services/userService';
import { syncDailyPricesIfNeeded, autoLockPastForeignDividendRates } from '../services/priceSyncService';
import { cleanOrphanedReminders, syncAllUpcomingXdReminders, checkAndPromptNotificationPermission } from '../services/notificationService';
import { calculatePortfolioReturns } from '../services/returnService';
import { getCachedPortfolio, savePortfolioCache, notifyOffline } from '../services/portfolioCacheService';
import { getLocalDateString, parseLocalDateParts, estimatePayoutDate, computeLearnedPayoutLag } from '../utils/dateUtils';
import { portfolioEvents } from '../services/eventService';
import { recordDailyPortfolioSnapshot } from '../services/benchmarkService';

const MONTH_NAMES = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

interface MonthlyPayoutItem {
  monthIndex: number;
  monthName: string;
  amount: number;
  isPast?: boolean;
  isCurrent?: boolean;
  details: {
    scheduleId: string;
    assetId: string;
    symbol: string;
    dpu: number;
    currency?: 'THB' | 'USD';
    shares: number;
    netAmount: number;
    xdDate: string;
    paymentDate?: string;
    isInterest: boolean;
    taxRate: number;
    isProjected: boolean;
    isSpecial?: boolean;
    daysInfo?: string;
    isPartialCycle?: boolean;
  }[];
}

interface CategoryStats {
  type: 'STOCKS' | 'FUNDS' | 'CASH';
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bgColor: string;
  marketValue: number;
  totalCost: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  count: number;
  allocationPercent: number;
}

interface DashboardProps {
  onNavigateToPortfolio?: (category?: 'ALL' | AssetType) => void;
  onNavigateToAssets?: (view?: 'HOLDINGS' | 'TRANSACTIONS', category?: 'ALL' | AssetType) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  onNavigateToPortfolio,
  onNavigateToAssets,
}) => {
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dividendSchedules, setDividendSchedules] = useState<DividendSchedule[]>([]);
  const [archivedAssets, setArchivedAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedAssetForEdit, setSelectedAssetForEdit] = useState<AssetSummary | null>(null);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [selectedCategoryForBreakdown, setSelectedCategoryForBreakdown] = useState<CategoryStats | null>(null);
  const [isCategoryModalVisible, setIsCategoryModalVisible] = useState(false);
  const [inflowFilter, setInflowFilter] = useState<'ALL' | 'DIVIDENDS' | 'INTEREST'>('ALL');
  const [selectedYear, setSelectedYear] = useState<number | 'ROLLING'>(new Date().getFullYear());
  const [isInflowFilterModalVisible, setIsInflowFilterModalVisible] = useState<boolean>(false);
  const [isYearPickerModalVisible, setIsYearPickerModalVisible] = useState<boolean>(false);
  const [exchangeRate, setExchangeRate] = useState<number>(34.00);
  const [currencyMap, setCurrencyMap] = useState<Record<string, 'THB' | 'USD'>>({});
  const { isPrivate: isPrivateMode, toggle: togglePrivateMode } = usePrivacyMode();
  const [monthlyGoal, setMonthlyGoal] = useState<number>(3000);
  const [isGoalModalVisible, setIsGoalModalVisible] = useState<boolean>(false);
  const [selectedScheduleForAdjust, setSelectedScheduleForAdjust] = useState<AdjustDividendTarget | null>(null);
  const [isAdjustModalVisible, setIsAdjustModalVisible] = useState<boolean>(false);
  const [specialScheduleIds, setSpecialScheduleIds] = useState<Set<string>>(new Set());
  const [isAnnualComparisonVisible, setIsAnnualComparisonVisible] = useState<boolean>(false);
  const [userDisplayName, setUserDisplayName] = useState<string>('Investor');

  const timeGreeting = getTimeGreeting();

  const handleSignOut = useCallback(() => {
    Alert.alert(
      'ออกจากระบบ',
      'คุณต้องการออกจากระบบและสลับบัญชีพอร์ตใช่หรือไม่?',
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ออกจากระบบ',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
            } catch (err: any) {
              Alert.alert('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถออกจากระบบได้');
            }
          },
        },
      ]
    );
  }, []);

  const isUSStock = useCallback((item: AssetSummary): boolean => {
    return resolveIsUSStock(item, currencyMap);
  }, [currencyMap]);

  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>();
    const cYear = new Date().getFullYear();
    yearsSet.add(cYear - 1);
    yearsSet.add(cYear);
    yearsSet.add(cYear + 1);

    dividendSchedules.forEach((s) => {
      if (s.payment_date) {
        const y = parseInt(s.payment_date.slice(0, 4), 10);
        if (!isNaN(y) && y >= 2000 && y <= 2100) yearsSet.add(y);
      }
      if (s.xd_date) {
        const y = parseInt(s.xd_date.slice(0, 4), 10);
        if (!isNaN(y) && y >= 2000 && y <= 2100) yearsSet.add(y);
      }
    });

    transactions.forEach((t) => {
      if (t.transaction_date) {
        const y = parseInt(t.transaction_date.slice(0, 4), 10);
        if (!isNaN(y) && y >= 2000 && y <= 2100) yearsSet.add(y);
      }
    });

    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [dividendSchedules, transactions]);

  const handlePrevYear = useCallback(() => {
    const cYear = new Date().getFullYear();
    setSelectedYear((prev) => {
      if (prev === 'ROLLING') return cYear - 1;
      return prev - 1;
    });
    setSelectedMonth(null);
  }, []);

  const handleNextYear = useCallback(() => {
    const cYear = new Date().getFullYear();
    setSelectedYear((prev) => {
      if (prev === 'ROLLING') return cYear + 1;
      return prev + 1;
    });
    setSelectedMonth(null);
  }, []);

  const loadData = useCallback(async (forceSync = false) => {
    try {
      // 0. Fetch user display name
      getUserDisplayName().then((name) => setUserDisplayName(name));

      // 0. Instant offline cache restore for 0ms cold-start display
      const cached = await getCachedPortfolio();
      if (cached && cached.assets.length > 0) {
        setAssets(cached.assets);
        if (cached.transactions && cached.transactions.length > 0) {
          setTransactions(cached.transactions);
        }
        if (cached.dividendSchedules && cached.dividendSchedules.length > 0) {
          setDividendSchedules(cached.dividendSchedules);
        }
        if (cached.exchangeRate > 0) {
          setExchangeRate(cached.exchangeRate);
        }
        setLoading(false);
      }

      await ensureAuthenticated();

      // 0.1 Auto-consolidate any duplicate assets if present
      await consolidateDuplicateAssets();

      // 1. Fetch assets summary view
      const { data: summaryData, error: summaryError } = await supabase
        .from('view_asset_summary')
        .select('*')
        .order('created_at', { ascending: false });

      if (summaryError) {
        throw summaryError;
      }

      let loadedAssets = ((summaryData as AssetSummary[]) || []).filter((a) => !a.is_archived);

      // 1.1 Sync daily prices if new day or forced by pull-to-refresh
      if (loadedAssets.length > 0) {
        try {
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
        } catch (syncErr) {
          console.warn('Sync prices failed, continuing with loaded assets:', syncErr);
        }
      }

      setAssets(loadedAssets);

      // 1.2 Fetch archived assets to ensure lifetime cumulative dividends remain preserved
      let archivedAssetsList: any[] = [];
      try {
        const { data: archivedData } = await supabase
          .from('assets')
          .select('id, symbol, asset_type, currency, tax_rate, is_archived')
          .eq('is_archived', true);
        if (archivedData && Array.isArray(archivedData)) {
          archivedAssetsList = archivedData;
        }
      } catch {
        // ignore
      }
      setArchivedAssets(archivedAssetsList);

      const activeAssetIds = loadedAssets.map((a) => a.id).filter(Boolean);
      const allAssetIds = [...activeAssetIds, ...archivedAssetsList.map((a) => a.id).filter(Boolean)];
      let txDataResult: Transaction[] = [];
      let schedulesData: DividendSchedule[] = [];

      if (allAssetIds.length > 0) {
        // 2. Fetch transactions for active & archived assets for accurate XD cutoff calculations
        const { data: txData, error: txError } = await supabase
          .from('transactions')
          .select('id, asset_id, type, shares, price_per_share, transaction_date')
          .in('asset_id', allAssetIds)
          .order('transaction_date', { ascending: true });

        if (!txError && txData) {
          txDataResult = txData as Transaction[];
          setTransactions(txDataResult);
        }

        // 3. Fetch dividend schedules for active assets (with resilient fallback)
        if (activeAssetIds.length > 0) {
          const { data: divData, error: divError } = await supabase
            .from('dividend_schedules')
            .select('*')
            .in('asset_id', activeAssetIds)
            .order('xd_date', { ascending: true });

          if (!divError && divData) {
            schedulesData = divData as DividendSchedule[];
          } else {
            const { data: fallbackDiv } = await supabase
              .from('dividend_schedules')
              .select('id, asset_id, dpu, xd_date, payment_date, is_projected')
              .in('asset_id', activeAssetIds)
              .order('xd_date', { ascending: true });

            if (fallbackDiv) {
              schedulesData = (fallbackDiv as DividendSchedule[]) || [];
            }
          }
        }

        // Fetch past received schedules for archived assets to preserve lifetime cumulative dividends
        if (archivedAssetsList.length > 0) {
          try {
            const archivedIds = archivedAssetsList.map((a) => a.id);
            const { data: archivedSchedules } = await supabase
              .from('dividend_schedules')
              .select('*')
              .in('asset_id', archivedIds)
              .or('is_projected.eq.false,payment_date.not.is.null');

            if (archivedSchedules && archivedSchedules.length > 0) {
              schedulesData = [...schedulesData, ...(archivedSchedules as DividendSchedule[])];
            }
          } catch {
            // ignore
          }
        }
        setDividendSchedules(schedulesData);

      } else {
        setTransactions([]);
        setDividendSchedules([]);
      }

      // 4. Fetch live exchange rate, local currency settings, and special schedules
      const [rate, currencies, specialIds] = await Promise.all([
        getCachedExchangeRate(),
        getAllAssetCurrencies(),
        getSpecialScheduleIds(),
      ]);
      setExchangeRate(rate);
      setCurrencyMap(currencies);
      setSpecialScheduleIds(specialIds);

      // Auto-lock past foreign dividend schedules if any reached payday
      if (loadedAssets.length > 0 && schedulesData.length > 0 && rate > 0) {
        autoLockPastForeignDividendRates(loadedAssets, schedulesData, rate).catch(() => {});
      }

      // Save fresh snapshot into local cache for offline viewing
      await savePortfolioCache({
        assets: loadedAssets,
        transactions: txDataResult,
        dividendSchedules: schedulesData,
        exchangeRate: rate,
      });

      // Clean orphaned reminders for archived/deleted assets and sync upcoming XD reminders
      cleanOrphanedReminders(loadedAssets)
        .then(() => syncAllUpcomingXdReminders())
        .then(() => checkAndPromptNotificationPermission())
        .catch(() => {});
    } catch (err: any) {
      console.warn('Dashboard loadData catch:', err?.message || err);
      // Notify user via offline toast if network request failed
      notifyOffline('เชื่อมต่อไม่ได้ · แสดงข้อมูลล่าสุดในเครื่อง');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Load monthly passive income goal
    const loadGoal = async () => {
      try {
        const saved = await AsyncStorage.getItem(GOAL_STORAGE_KEY);
        if (saved) {
          const val = parseFloat(saved);
          if (!isNaN(val) && val > 0) {
            setMonthlyGoal(val);
          }
        }
      } catch (e) {
        console.warn('Failed to load goal from AsyncStorage', e);
      }
    };
    loadGoal();

    const unsubscribe = portfolioEvents.subscribe(() => {
      loadData();
    });
    return () => {
      unsubscribe();
    };
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData(true);
  };

  // --- Calculations ---

  // Portfolio Totals
  const totalMarketValue = assets.reduce((sum, item) => sum + (Number(item.market_value) || 0), 0);
  const totalCost = assets.reduce((sum, item) => sum + (Number(item.total_cost) || 0), 0);
  const totalUnrealizedPL = totalMarketValue - totalCost;
  const totalUnrealizedPLPercent = totalCost > 0 ? (totalUnrealizedPL / totalCost) * 100 : 0;

  // บันทึก Snapshot มูลค่าและผลตอบแทนพอร์ตประจำวันลงตาราง portfolio_snapshots บน Cloud
  useEffect(() => {
    if (totalCost > 0 || totalMarketValue > 0) {
      recordDailyPortfolioSnapshot(totalMarketValue, totalCost, totalUnrealizedPL, totalUnrealizedPLPercent);
    }
  }, [totalMarketValue, totalCost, totalUnrealizedPL, totalUnrealizedPLPercent]);

  // Realized Dividends & Total Return Metrics
  const returnMetrics = calculatePortfolioReturns(
    assets,
    transactions,
    dividendSchedules,
    exchangeRate,
    archivedAssets,
    currencyMap
  );

  // Category Breakdown
  const categories: CategoryStats[] = [
    {
      type: 'STOCKS',
      label: 'หุ้น (Stocks)',
      icon: 'trending-up',
      color: '#2563EB',
      bgColor: '#EFF6FF',
      marketValue: 0,
      totalCost: 0,
      unrealizedPL: 0,
      unrealizedPLPercent: 0,
      count: 0,
      allocationPercent: 0,
    },
    {
      type: 'FUNDS',
      label: 'กองทุน (Funds)',
      icon: 'pie-chart',
      color: '#7C3AED',
      bgColor: '#F5F3FF',
      marketValue: 0,
      totalCost: 0,
      unrealizedPL: 0,
      unrealizedPLPercent: 0,
      count: 0,
      allocationPercent: 0,
    },
    {
      type: 'CASH',
      label: 'เงินฝาก (Cash & Savings)',
      icon: 'wallet',
      color: '#059669',
      bgColor: '#ECFDF5',
      marketValue: 0,
      totalCost: 0,
      unrealizedPL: 0,
      unrealizedPLPercent: 0,
      count: 0,
      allocationPercent: 0,
    },
  ];

  assets.forEach((asset) => {
    const cat = categories.find((c) => c.type === asset.asset_type);
    if (cat) {
      cat.marketValue += Number(asset.market_value) || 0;
      cat.totalCost += Number(asset.total_cost) || 0;
      cat.unrealizedPL += Number(asset.unrealized_pl) || 0;
      cat.count += 1;
    }
  });

  categories.forEach((cat) => {
    cat.allocationPercent = totalMarketValue > 0 ? (cat.marketValue / totalMarketValue) * 100 : 0;
    cat.unrealizedPLPercent = cat.totalCost > 0 ? (cat.unrealizedPL / cat.totalCost) * 100 : 0;
  });

  // Dividend Forecasting Engine (Rolling 12-Month & Selected Year Horizon) with Strict XD Cutoff Logic
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentYear = today.getFullYear();
  const currentCalMonth = today.getMonth();

  // 1. Rolling 12M index map (Strict forward horizon for HeroNetWorthCard & Category run-rate)
  const rollingMonthKeyToIndex = new Map<string, number>();
  for (let i = 0; i < 12; i++) {
    const bucketDate = new Date(currentYear, currentCalMonth + i, 1);
    const bYear = bucketDate.getFullYear();
    const bMonth = bucketDate.getMonth();
    const bKey = `${bYear}-${String(bMonth + 1).padStart(2, '0')}`;
    rollingMonthKeyToIndex.set(bKey, i);
  }

  // 2. Active Forecast index map (Selected Calendar Year Jan-Dec or Rolling 12M)
  const isRollingView = selectedYear === 'ROLLING';
  const targetYearNum = typeof selectedYear === 'number' ? selectedYear : currentYear;

  const monthlyForecasts: MonthlyPayoutItem[] = [];
  const forecastMonthKeyToIndex = new Map<string, number>();

  for (let i = 0; i < 12; i++) {
    let bYear: number;
    let bMonth: number;
    let displayName: string;
    let isPast = false;
    let isCurrent = false;

    if (isRollingView) {
      const bucketDate = new Date(currentYear, currentCalMonth + i, 1);
      bYear = bucketDate.getFullYear();
      bMonth = bucketDate.getMonth();
      const baseName = MONTH_NAMES[bMonth];
      displayName = bYear !== currentYear ? `${baseName} '${String(bYear).slice(-2)}` : baseName;
      isCurrent = i === 0;
      isPast = false;
    } else {
      bYear = targetYearNum;
      bMonth = i;
      displayName = MONTH_NAMES[bMonth];
      if (targetYearNum < currentYear) {
        isPast = true;
      } else if (targetYearNum === currentYear) {
        if (bMonth < currentCalMonth) isPast = true;
        else if (bMonth === currentCalMonth) isCurrent = true;
      }
    }

    const bKey = `${bYear}-${String(bMonth + 1).padStart(2, '0')}`;
    forecastMonthKeyToIndex.set(bKey, i);
    monthlyForecasts.push({
      monthIndex: i,
      monthName: displayName,
      amount: 0,
      isPast,
      isCurrent,
      details: [],
    });
  }

  let projectedAnnualNetDividend = 0;
  let projectedAnnualRegularNetDividend = 0;
  const annualInflowByCategory: Record<AssetType, number> = {
    STOCKS: 0,
    FUNDS: 0,
    CASH: 0,
  };
  const annualInflowByAsset: Record<string, number> = {};

  // Upcoming Paydays Radar & Annual Dividend Tracking
  let priorYearTotalNetDividend = 0;
  const priorYearDetails: PriorYearDividendItem[] = [];

  const upcomingList: UpcomingSchedule[] = [];
  let nextClosestSchedule: ClosestSchedule | null = null;
  let minFutureDiffDays = Infinity;
  const seenScheduleKeys = new Set<string>();
  const learnedLagByAsset = new Map<string, number | null>();

  dividendSchedules.forEach((schedule) => {
    // Deduplicate identical schedules if any
    const schedKey = `${schedule.asset_id}_${schedule.xd_date}_${schedule.payment_date || ''}`;
    if (seenScheduleKeys.has(schedKey)) return;
    seenScheduleKeys.add(schedKey);

    const parentAsset = assets.find((a) => a.id === schedule.asset_id);
    if (!parentAsset) return;

    const isCashAsset = parentAsset.asset_type === 'CASH';
    const isUS = isUSStock(parentAsset);

    // Strict XD Cutoff:
    // For CASH: include deposits made on or before the period cutoff date (<= schedule.xd_date)
    // For STOCKS / FUNDS: strictly include lots acquired BEFORE the Ex-Dividend date (< schedule.xd_date)
    const eligibleTxs = transactions.filter((t) => {
      if (t.asset_id !== schedule.asset_id) return false;
      return isCashAsset
        ? t.transaction_date <= schedule.xd_date
        : t.transaction_date < schedule.xd_date;
    });
    let eligibleShares = eligibleTxs.reduce(
      (sum, t) => sum + (t.type === 'BUY' ? Number(t.shares) : -Number(t.shares)),
      0
    );

    // Fallback สำหรับเงินปันผล/ดอกเบี้ยที่ยืนยันว่าได้รับแล้ว (is_projected === false)
    // ป้องกันยอดเงินปันผลที่ได้รับจริงหายไป หากผู้ใช้บันทึกวันที่ซื้อคาบเกี่ยวกับวัน XD
    let effectiveTxs = eligibleTxs;
    if (eligibleShares <= 0 && schedule.is_projected === false) {
      const cutoff = schedule.payment_date || schedule.xd_date;
      const fallbackTxs = transactions.filter((t) => {
        if (t.asset_id !== schedule.asset_id) return false;
        return t.transaction_date <= cutoff;
      });
      const fallbackShares = fallbackTxs.reduce(
        (sum, t) => sum + (t.type === 'BUY' ? Number(t.shares) : -Number(t.shares)),
        0
      );
      if (fallbackShares > 0) {
        eligibleShares = fallbackShares;
        effectiveTxs = fallbackTxs;
      } else if (Number(parentAsset.net_shares) > 0) {
        eligibleShares = Number(parentAsset.net_shares);
      }
    }

    if (eligibleShares <= 0) return;

    const taxRate = parentAsset.tax_rate !== undefined && parentAsset.tax_rate !== null
      ? Number(parentAsset.tax_rate)
      : (isCashAsset ? 0 : isUS ? 0.1500 : 0.1000);
    const dpu = Number(schedule.dpu) || 0;

    let netDividend = 0;
    let daysInfo: string | undefined = undefined;
    let isPartialCycle = false;

    if (isCashAsset) {
      // Find interest frequency by schedule dates
      const assetSchedules = dividendSchedules.filter((s) => s.asset_id === schedule.asset_id);
      const freq = detectCashFrequency(assetSchedules.map((s) => s.xd_date));
      const divisor = freq === 'MONTHLY' ? 12 : freq === 'SEMI_ANNUAL' ? 2 : 1;
      const annualRatePct = dpu * divisor * 100;

      let totalCashNet = 0;
      let hasPartial = false;
      let partialLabel = '';

      const hasWithdrawals = effectiveTxs.some((t) => t.type === 'SELL');
      if (hasWithdrawals) {
        // เมื่อมีการถอนเงินต้น ให้คิดดอกเบี้ยจากยอดเงินต้นคงเหลือสุทธิ (eligibleShares)
        const firstDepDate = effectiveTxs.find((t) => t.type === 'BUY')?.transaction_date || schedule.xd_date;
        const res = calculateScheduleCashPayout(
          eligibleShares,
          annualRatePct,
          taxRate,
          firstDepDate,
          schedule.xd_date,
          freq
        );
        totalCashNet = res.netInterest;
        if (res.isPartialCycle) {
          hasPartial = true;
          partialLabel = res.daysLabel;
        }
      } else {
        effectiveTxs.forEach((t) => {
          if (t.type !== 'BUY') return;
          const txAmount = Number(t.shares) || 0;
          if (txAmount <= 0) return;
          const res = calculateScheduleCashPayout(
            txAmount,
            annualRatePct,
            taxRate,
            t.transaction_date,
            schedule.xd_date,
            freq
          );
          totalCashNet += res.netInterest;
          if (res.isPartialCycle) {
            hasPartial = true;
            partialLabel = res.daysLabel;
          }
        });
      }

      if (totalCashNet <= 0) return;
      netDividend = totalCashNet;
      isPartialCycle = hasPartial;
      daysInfo = hasPartial ? partialLabel : 'เต็มงวด';
    } else {
      // Live Floating FX for foreign assets: convert native DPU to current THB
      // If payment has already been confirmed and has a locked received_fx_rate, use it!
      const isConfirmed = schedule.is_projected === false;
      const effectiveRate = isUS
        ? isConfirmed && Number(schedule.received_fx_rate) > 0
          ? Number(schedule.received_fx_rate)
          : exchangeRate > 0
          ? exchangeRate
          : 1.0
        : 1.0;
      netDividend = eligibleShares * dpu * effectiveRate * (1 - taxRate);
    }

    if (netDividend <= 0) return;

    const isSpecialItem = schedule.is_special || specialScheduleIds.has(schedule.id);

    let learnedLag = learnedLagByAsset.get(schedule.asset_id);
    if (learnedLag === undefined) {
      const assetScheds = dividendSchedules.filter((s) => s.asset_id === schedule.asset_id);
      learnedLag = isCashAsset ? null : computeLearnedPayoutLag(assetScheds);
      learnedLagByAsset.set(schedule.asset_id, learnedLag);
    }

    const xdDateObj = parseLocalDateParts(schedule.xd_date);
    const payoutDateObj = estimatePayoutDate(schedule.xd_date, schedule.payment_date, {
      isCash: isCashAsset,
      isUS,
      learnedLagDays: learnedLag,
    });
    if (!payoutDateObj) return;

    const isEstimatedPayout = !schedule.payment_date && !isCashAsset;

    const itemYear = payoutDateObj.getFullYear();
    const targetMonth = payoutDateObj.getMonth();
    const diffPay = Math.ceil((payoutDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // 1. Prior Year Accumulation for Historical Comparison & Special Dividend Inspection
    if (itemYear === currentYear - 1 || diffPay < -365) {
      priorYearTotalNetDividend += netDividend;
      priorYearDetails.push({
        scheduleId: schedule.id,
        assetId: schedule.asset_id,
        symbol: parentAsset.symbol,
        dpu,
        currency: isCashAsset ? 'THB' : isUS ? 'USD' : 'THB',
        shares: eligibleShares,
        netAmount: netDividend,
        xdDate: schedule.xd_date,
        paymentDate: schedule.payment_date || getLocalDateString(payoutDateObj),
        isInterest: isCashAsset,
        taxRate,
        isSpecial: isSpecialItem,
      });
    }

    const payoutMonthKey = `${payoutDateObj.getFullYear()}-${String(payoutDateObj.getMonth() + 1).padStart(2, '0')}`;

    // 2. Rolling 12-Month Inflow for Portfolio Hero Net Worth & Category Cards (Strict XD Cutoff)
    const rollingIndex = rollingMonthKeyToIndex.get(payoutMonthKey);
    if (rollingIndex !== undefined) {
      annualInflowByCategory[parentAsset.asset_type] += netDividend;
      annualInflowByAsset[parentAsset.id] = (annualInflowByAsset[parentAsset.id] || 0) + netDividend;
      projectedAnnualNetDividend += netDividend;
      if (!isSpecialItem) {
        projectedAnnualRegularNetDividend += netDividend;
      }
    }

    // 3. Active Cashflow Forecast Chart Data (Selected Calendar Year Jan-Dec or Rolling 12M)
    const forecastIndex = forecastMonthKeyToIndex.get(payoutMonthKey);
    if (forecastIndex !== undefined) {
      const matchesFilter =
        inflowFilter === 'ALL' ||
        (inflowFilter === 'DIVIDENDS' && !isCashAsset) ||
        (inflowFilter === 'INTEREST' && isCashAsset);

      if (matchesFilter) {
        monthlyForecasts[forecastIndex].amount += netDividend;
        monthlyForecasts[forecastIndex].details.push({
          scheduleId: schedule.id,
          assetId: schedule.asset_id,
          symbol: parentAsset.symbol,
          dpu,
          currency: isCashAsset ? 'THB' : isUS ? 'USD' : 'THB',
          shares: eligibleShares,
          netAmount: netDividend,
          xdDate: schedule.xd_date,
          paymentDate: schedule.payment_date || getLocalDateString(payoutDateObj),
          isInterest: isCashAsset,
          taxRate,
          isProjected: schedule.is_projected !== false,
          isSpecial: isSpecialItem,
          daysInfo,
          isPartialCycle,
        });
      }
    }

    // 3. Upcoming Payday Radar (Events in next 30 days)
    // Check XD Event (if upcoming in next 30 days and not yet passed)
    if (xdDateObj) {
      const diffXd = Math.ceil((xdDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffXd >= 0 && diffXd <= 30) {
        upcomingList.push({
          scheduleId: schedule.id,
          assetId: schedule.asset_id,
          symbol: parentAsset.symbol,
          assetType: parentAsset.asset_type,
          dateStr: schedule.xd_date,
          diffDays: diffXd,
          amount: netDividend,
          isInterest: isCashAsset,
          typeLabel: 'XD',
          dpu,
          shares: eligibleShares,
          currency: isCashAsset ? 'THB' : isUS ? 'USD' : 'THB',
          taxRate,
          isProjected: schedule.is_projected !== false,
          isSpecial: isSpecialItem,
          dateDisplay: `${xdDateObj.getDate()} ${MONTH_NAMES[xdDateObj.getMonth()]}`,
        });
      }
    }

    // Check Payout Event (Payment date or estimated payout in next 30 days or recent 1 day past)
    if (diffPay >= -1 && diffPay <= 30) {
      const pDay = payoutDateObj.getDate();
      const pMonth = MONTH_NAMES[payoutDateObj.getMonth()];
      const dateDisplay = isEstimatedPayout ? `~${pDay} ${pMonth}` : `${pDay} ${pMonth}`;

      upcomingList.push({
        scheduleId: schedule.id,
        assetId: schedule.asset_id,
        symbol: parentAsset.symbol,
        assetType: parentAsset.asset_type,
        dateStr: schedule.payment_date || getLocalDateString(payoutDateObj),
        diffDays: diffPay,
        amount: netDividend,
        isInterest: isCashAsset,
        typeLabel: 'PAY',
        dpu,
        shares: eligibleShares,
        currency: isCashAsset ? 'THB' : isUS ? 'USD' : 'THB',
        taxRate,
        isProjected: schedule.is_projected !== false,
        isSpecial: isSpecialItem,
        isEstimatedDate: isEstimatedPayout,
        dateDisplay,
      });
    } else if (diffPay > 30 && diffPay < minFutureDiffDays) {
      minFutureDiffDays = diffPay;
      nextClosestSchedule = {
        symbol: parentAsset.symbol,
        daysText: `อีก ${diffPay} วัน`,
        amount: netDividend,
      };
    }
  });

  upcomingList.sort((a, b) => a.diffDays - b.diffDays);

  // Dual Yield & Inflow Metrics (Using regular sustainable dividends for accurate Yield & YoC)
  const portfolioCurrentYield = totalMarketValue > 0 ? (projectedAnnualRegularNetDividend / totalMarketValue) * 100 : 0;
  const portfolioYoC = totalCost > 0 ? (projectedAnnualRegularNetDividend / totalCost) * 100 : 0;
  const monthlyAvgInflow = projectedAnnualNetDividend / 12;

  // Passive Income Goal Calculations
  const goalProgressPercent = monthlyGoal > 0 ? Math.min(100, (monthlyAvgInflow / monthlyGoal) * 100) : 0;
  const goalRemaining = Math.max(0, monthlyGoal - monthlyAvgInflow);
  const currentGoalPreset = GOAL_PRESETS.find((p) => p.amount === monthlyGoal);

  // Privacy Mode Money Formatter Helper
  const formatMoney = (amount: number, digits: number = 2): string => {
    if (isPrivateMode) return '฿••••••';
    return `฿${amount.toLocaleString('th-TH', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  };

  // 1-Click Payday Confirmation Handler
  const handleConfirmPayment = (item: UpcomingSchedule) => {
    const scheduleId = item.scheduleId;
    if (!scheduleId) return;
    const amountStr =
      item.currency === 'USD' && item.shares && item.dpu !== undefined
        ? `$${(item.shares * item.dpu * (1 - (item.taxRate || 0))).toFixed(2)} (~${formatMoney(item.amount)})`
        : formatMoney(item.amount);
    Alert.alert(
      'ยืนยันเงินปันผลเข้าบัญชี',
      `ยืนยันว่าได้รับเงินปันผลสุทธิ ${amountStr} (${item.symbol}) เข้าบัญชีเรียบร้อยแล้วใช่หรือไม่?`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ยืนยันเงินเข้าแล้ว',
          onPress: async () => {
            try {
              const todayStr = getLocalDateString();
              const updatePayload: any = {
                payment_date: todayStr,
                is_projected: false,
              };
              if (item.currency === 'USD' && exchangeRate > 0) {
                updatePayload.received_fx_rate = exchangeRate;
              }
              let { error } = await supabase
                .from('dividend_schedules')
                .update(updatePayload)
                .eq('id', scheduleId);

              if (error && (error.message?.includes('received_fx_rate') || error.code === '42703' || error.message?.includes('schema cache'))) {
                delete updatePayload.received_fx_rate;
                const retry = await supabase
                  .from('dividend_schedules')
                  .update(updatePayload)
                  .eq('id', scheduleId);
                error = retry.error;
              }

              if (error) throw error;
              loadData(true);
            } catch (err: any) {
              Alert.alert('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถยืนยันได้');
            }
          },
        },
      ]
    );
  };

  // Max value for bar chart normalization
  const maxMonthlyAmount = Math.max(...monthlyForecasts.map((m) => m.amount), 1);

  // Selected Forecast Year Summary Metrics
  const forecastYearTotal = monthlyForecasts.reduce((sum, m) => sum + m.amount, 0);
  const forecastYearReceived = monthlyForecasts
    .filter((m) => m.isPast)
    .reduce((sum, m) => sum + m.amount, 0);
  const forecastYearPending = monthlyForecasts
    .filter((m) => !m.isPast)
    .reduce((sum, m) => sum + m.amount, 0);
  const forecastMonthlyAvg = forecastYearTotal / 12;

  // Current month index (0 = Jan, 11 = Dec)
  const currentMonthIndex = new Date().getMonth();

  // Active selected month details
  const activeMonthData = selectedMonth !== null ? monthlyForecasts[selectedMonth] : null;

  const fallbackClosest: ClosestSchedule | null = nextClosestSchedule;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#059669" />
        }
      >
        {/* Header Title & Sign Out Door Icon */}
        <View style={styles.topHeader}>
          <View style={styles.headerTitleCol}>
            <Text style={styles.screenTitle}>My Dividend</Text>
            <Text style={styles.screenSubtitle}>
              {timeGreeting.greeting}, {userDisplayName} {timeGreeting.icon}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.headerExitBtn}
            onPress={handleSignOut}
            activeOpacity={0.7}
            accessibilityLabel="ออกจากระบบ"
          >
            <Ionicons name="log-out-outline" size={22} color="#DC2626" />
          </TouchableOpacity>
        </View>

        {/* 1. Header: Total Portfolio Value & Dual Yield Highlight */}
        <HeroNetWorthCard
          totalMarketValue={totalMarketValue}
          totalCost={totalCost}
          totalUnrealizedPL={totalUnrealizedPL}
          totalUnrealizedPLPercent={totalUnrealizedPLPercent}
          totalDividendsReceived={returnMetrics.totalCumulativeDividends}
          totalReturn={returnMetrics.totalReturn}
          totalReturnPercent={returnMetrics.totalReturnPercent}
          projectedAnnualNetDividend={projectedAnnualNetDividend}
          portfolioCurrentYield={portfolioCurrentYield}
          portfolioYoC={portfolioYoC}
          monthlyAvgInflow={monthlyAvgInflow}
          inflowFilter={inflowFilter}
          isPrivateMode={isPrivateMode}
          onTogglePrivateMode={togglePrivateMode}
          priorYearAnnualNetDividend={priorYearTotalNetDividend}
          onOpenAnnualComparison={() => setIsAnnualComparisonVisible(true)}
          formatMoney={formatMoney}
        />

        {/* 2. Category Cards: Stocks, Funds, Cash/Savings */}
        {/* 2. Category Cards: Stocks, Funds, Cash/Savings */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>สัดส่วนสินทรัพย์ตามหมวดหมู่</Text>
            <Text style={styles.sectionSubtitle}>3 หมวดหมู่หลัก</Text>
          </View>
          {onNavigateToPortfolio && (
            <TouchableOpacity
              onPress={() => onNavigateToPortfolio('ALL')}
              style={styles.seeAllBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.seeAllBtnText}>ดูพอร์ตเต็ม →</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.categoryCardsContainer}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.type}
              style={styles.categoryCard}
              activeOpacity={0.7}
              onPress={() => {
                setSelectedCategoryForBreakdown(cat);
                setIsCategoryModalVisible(true);
              }}
            >
              {/* Row 1: Left has Icon + Title + Count. Right has P/L badge + Allocation % + Chevron */}
              <View style={styles.categoryHeader}>
                <View style={styles.categoryHeaderLeft}>
                  <View style={[styles.categoryIconCircle, { backgroundColor: cat.bgColor }]}>
                    <Ionicons name={cat.icon} size={14} color={cat.color} />
                  </View>
                  <Text style={styles.categoryTitle} numberOfLines={1}>{cat.label}</Text>
                  <Text style={styles.categoryAssetCount}>({cat.count})</Text>
                </View>
                <View style={styles.categoryHeaderRightRow}>
                  <Text style={[styles.categoryPL, cat.unrealizedPL >= 0 ? styles.profitText : styles.lossText]}>
                    {cat.unrealizedPL >= 0 ? '+' : ''}
                    {cat.unrealizedPLPercent.toFixed(1)}%
                  </Text>
                  <View style={styles.categoryHeaderRight}>
                    <Text style={styles.categoryAllocationText}>{cat.allocationPercent.toFixed(1)}%</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={13} color="#94A3B8" />
                </View>
              </View>

              {/* Row 2: Left has Market Value. Right has Inflow / Yield */}
              <View style={styles.categoryValueRow}>
                <Text style={styles.categoryValue}>
                  {formatMoney(cat.marketValue)}
                </Text>
                <View style={styles.categoryInflowRow}>
                  <Ionicons
                    name={cat.type === 'CASH' ? 'wallet-outline' : 'leaf-outline'}
                    size={11}
                    color={cat.color}
                  />
                  <Text
                    style={[styles.categoryInflowText, { color: cat.color }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {cat.type === 'CASH'
                      ? `ดอกเบี้ย ${formatMoney(annualInflowByCategory.CASH, 0)}/ปี`
                      : cat.type === 'STOCKS'
                      ? `ปันผล ${formatMoney(annualInflowByCategory.STOCKS, 0)}/ปี (YoC ${cat.totalCost > 0 ? ((annualInflowByCategory.STOCKS / cat.totalCost) * 100).toFixed(1) : '0.0'}%)`
                      : `ปันผล ${formatMoney(annualInflowByCategory.FUNDS, 0)}/ปี (Yield ${cat.marketValue > 0 ? ((annualInflowByCategory.FUNDS / cat.marketValue) * 100).toFixed(1) : '0.0'}%)`}
                  </Text>
                </View>
              </View>

              {/* Progress bar */}
              <View style={styles.progressBarBackground}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${Math.min(100, Math.max(0, cat.allocationPercent))}%`, backgroundColor: cat.color },
                  ]}
                />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* 3. Dividend & Interest Forecast Chart: Monthly Bar Chart (Jan - Dec) */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              {inflowFilter === 'ALL'
                ? 'กระแสเงินปันผลและดอกเบี้ย 12 เดือน'
                : inflowFilter === 'DIVIDENDS'
                ? 'กระแสเงินปันผล 12 เดือน (หุ้น & กองทุน)'
                : 'ดอกเบี้ยเงินฝากรับ 12 เดือน'}
            </Text>
            <Text style={styles.sectionSubtitle}>คำนวณสุทธิหลังหักภาษี (ตามรอบปันผล/ดอกเบี้ย)</Text>
          </View>
          <View style={styles.badgeXD}>
            <Text style={styles.badgeXDText}>XD Cutoff</Text>
          </View>
        </View>

        {/* Mini Payday Radar (Events in next 30 days) */}
        <UpcomingPaydayRadar
          upcomingList={upcomingList}
          fallbackClosest={fallbackClosest}
          formatMoney={formatMoney}
          onConfirmPayment={handleConfirmPayment}
          onSelectSchedule={(item) => {
            if (!item.scheduleId || !item.assetId) return;
            setSelectedScheduleForAdjust({
              scheduleId: item.scheduleId,
              assetId: item.assetId,
              symbol: item.symbol,
              dpu: item.dpu || 0,
              shares: item.shares || 0,
              netAmount: item.amount,
              xdDate: item.dateStr,
              isInterest: item.isInterest,
              currency: item.isInterest ? 'THB' : (item.currency || 'THB'),
              taxRate: item.taxRate || 0,
              isProjected: item.isProjected ?? true,
              exchangeRate,
            });
            setIsAdjustModalVisible(true);
          }}
        />

        {/* Unified Filter Bar: Left Inflow Dropdown + Right Year Selector (Option 2 แบบที่ 1) */}
        <View style={styles.forecastFilterRow}>
          {/* Left: Dropdown for Inflow Filter */}
          <TouchableOpacity
            style={styles.filterDropdownBtn}
            onPress={() => setIsInflowFilterModalVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={
                inflowFilter === 'ALL'
                  ? 'wallet-outline'
                  : inflowFilter === 'DIVIDENDS'
                  ? 'trending-up-outline'
                  : 'cash-outline'
              }
              size={13}
              color="#059669"
            />
            <Text style={styles.filterDropdownText} numberOfLines={1}>
              {inflowFilter === 'ALL'
                ? 'ทั้งหมด'
                : inflowFilter === 'DIVIDENDS'
                ? 'เฉพาะหุ้น/กองทุน'
                : 'เฉพาะดอกเบี้ย'}
            </Text>
            <Ionicons name="chevron-down" size={12} color="#64748B" />
          </TouchableOpacity>

          {/* Right: Year Selector with Prev/Next arrows (แบบที่ 1) */}
          <View style={styles.yearSelectorContainer}>
            <TouchableOpacity
              style={styles.yearArrowBtn}
              onPress={handlePrevYear}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.6}
            >
              <Ionicons name="chevron-back" size={15} color="#334155" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.yearDisplayBtn}
              onPress={() => setIsYearPickerModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.yearDisplayText}>
                {selectedYear === 'ROLLING'
                  ? 'Rolling 12M'
                  : selectedYear === currentYear
                  ? `ปี ${selectedYear} (ปีนี้)`
                  : `ปี ${selectedYear}`}
              </Text>
              <Ionicons name="chevron-down" size={11} color="#64748B" style={{ marginLeft: 3 }} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.yearArrowBtn}
              onPress={handleNextYear}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.6}
            >
              <Ionicons name="chevron-forward" size={15} color="#334155" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.chartCard}>
          {forecastYearTotal === 0 ? (
            <View style={styles.emptyChartBox}>
              <Ionicons name="bar-chart-outline" size={40} color="#CBD5E1" />
              <Text style={styles.emptyChartText}>
                {selectedYear === 'ROLLING'
                  ? 'ยังไม่มีข้อมูลปันผลคาดการณ์'
                  : `ไม่มีข้อมูลกระแสเงินสดในปี ${selectedYear}`}
              </Text>
              <Text style={styles.emptyChartSubtext}>
                {selectedYear === 'ROLLING' || selectedYear === currentYear
                  ? 'เพิ่มหุ้นหรือระบุ Expected DPU เพื่อดูแท่งกราฟกระแสเงินสดรายเดือน'
                  : 'เลือกปีอื่น หรือบันทึกรายการธุรกรรมเพิ่มเติม'}
              </Text>
            </View>
          ) : (
            <>
              {/* Year Summary Header Row (ข้อ 3 แบบ A) */}
              <View style={styles.chartHeaderRow}>
                <View style={styles.chartHeaderLeft}>
                  <View style={styles.chartHeaderTitleRow}>
                    <Text style={styles.chartCardTitle}>
                      {selectedYear === 'ROLLING'
                        ? 'กระแสเงินสดคาดการณ์ 12 เดือนข้างหน้า'
                        : `กระแสเงินสดปี ${selectedYear}`}
                    </Text>
                    <View
                      style={[
                        styles.yearTagPill,
                        selectedYear === currentYear || selectedYear === 'ROLLING'
                          ? styles.yearTagPillCurrent
                          : styles.yearTagPillDefault,
                      ]}
                    >
                      <Ionicons
                        name={
                          selectedYear === 'ROLLING'
                            ? 'repeat-outline'
                            : selectedYear === currentYear
                            ? 'sparkles'
                            : 'calendar'
                        }
                        size={11}
                        color={
                          selectedYear === currentYear || selectedYear === 'ROLLING'
                            ? '#059669'
                            : '#64748B'
                        }
                      />
                      <Text
                        style={[
                          styles.yearTagText,
                          selectedYear === currentYear || selectedYear === 'ROLLING'
                            ? styles.yearTagTextCurrent
                            : styles.yearTagTextDefault,
                        ]}
                      >
                        {selectedYear === 'ROLLING'
                          ? 'Rolling 12M'
                          : selectedYear === currentYear
                          ? 'ปีนี้'
                          : typeof selectedYear === 'number' && selectedYear < currentYear
                          ? 'ประวัติย้อนหลัง'
                          : 'คาดการณ์'}
                      </Text>
                    </View>
                  </View>

                  {/* Total Amount & Monthly Average */}
                  <View style={styles.chartTotalRow}>
                    <Text style={styles.chartTotalAmount}>
                      {formatMoney(forecastYearTotal)}
                    </Text>
                    <Text style={styles.chartAvgText}>
                      เฉลี่ย {formatMoney(forecastMonthlyAvg)}/ด.
                    </Text>
                  </View>

                  {/* Subrow for Received vs Pending breakdown if current year */}
                  {selectedYear === currentYear && (
                    <View style={styles.receivedPendingRow}>
                      <View style={styles.receivedPill}>
                        <View style={styles.dotReceived} />
                        <Text style={styles.receivedPillText}>
                          รับแล้ว {formatMoney(forecastYearReceived)}
                        </Text>
                      </View>
                      <View style={styles.pendingPill}>
                        <View style={styles.dotPending} />
                        <Text style={styles.pendingPillText}>
                          รอรับ {formatMoney(forecastYearPending)}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>

              {/* Monthly Bar Chart View (ข้อ 3 แบบ A) */}
              <View style={styles.barsContainer}>
                {monthlyForecasts.map((item) => {
                  const hasPayout = item.amount > 0;
                  const barHeightRatio = hasPayout
                    ? Math.max(0.12, item.amount / maxMonthlyAmount)
                    : 0.05;
                  const isSelected = selectedMonth === item.monthIndex;
                  const isCurrentMonth = item.isCurrent;
                  const isPastMonth = item.isPast;

                  return (
                    <TouchableOpacity
                      key={item.monthIndex}
                      style={styles.barColumn}
                      onPress={() => setSelectedMonth(isSelected ? null : item.monthIndex)}
                      activeOpacity={0.7}
                    >
                      {/* Amount tooltip above bar if has payout */}
                      {hasPayout && (
                        <Text
                          style={[
                            styles.barTopAmount,
                            isSelected && styles.barTopAmountSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {isPrivateMode
                            ? '••••'
                            : item.amount >= 1000
                            ? `${(item.amount / 1000).toFixed(item.amount >= 10000 ? 0 : 1)}k`
                            : item.amount.toFixed(0)}
                        </Text>
                      )}

                      {/* Bar Graphic Track & Fill */}
                      <View
                        style={[
                          styles.barTrack,
                          isCurrentMonth && styles.barTrackCurrent,
                          isSelected && styles.barTrackSelected,
                        ]}
                      >
                        <View
                          style={[
                            styles.barFill,
                            { height: `${barHeightRatio * 100}%` },
                            hasPayout
                              ? isPastMonth
                                ? styles.barFillPast
                                : isCurrentMonth
                                ? styles.barFillCurrent
                                : styles.barFillFuture
                              : styles.barFillInactive,
                            isSelected && styles.barFillSelected,
                          ]}
                        />
                      </View>

                      {/* Month Label with Current Month Indicator */}
                      <View
                        style={[
                          styles.monthLabelWrapper,
                          isCurrentMonth && styles.monthLabelWrapperCurrent,
                        ]}
                      >
                        <Text
                          style={[
                            styles.barMonthLabel,
                            isSelected && styles.barMonthLabelSelected,
                            isCurrentMonth && styles.barMonthLabelCurrent,
                          ]}
                        >
                          {item.monthName}
                        </Text>
                      </View>

                      {isCurrentMonth ? (
                        <View style={styles.nowBadge}>
                          <Ionicons
                            name="caret-up"
                            size={8}
                            color="#059669"
                            style={{ marginBottom: -2 }}
                          />
                          <Text style={styles.nowBadgeText}>Now</Text>
                        </View>
                      ) : (
                        <View style={styles.nowPlaceholder} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Chart Legend Row */}
              <View style={styles.chartLegendRow}>
                <View style={styles.chartLegendItemsWrap}>
                  {selectedYear === currentYear ? (
                    <>
                      <View style={styles.chartLegendItem}>
                        <View style={[styles.chartLegendDot, { backgroundColor: '#059669' }]} />
                        <Text style={styles.chartLegendText}>รับแล้ว</Text>
                      </View>
                      <View style={styles.chartLegendItem}>
                        <View style={[styles.chartLegendDot, { backgroundColor: '#6EE7B7' }]} />
                        <Text style={styles.chartLegendText}>รอรับ</Text>
                      </View>
                      <View style={styles.chartLegendItem}>
                        <View style={styles.nowBadgeLegend}>
                          <Ionicons name="caret-up" size={8} color="#059669" />
                          <Text style={styles.nowBadgeText}>Now</Text>
                        </View>
                        <Text style={styles.chartLegendText}>เดือนปัจจุบัน</Text>
                      </View>
                    </>
                  ) : typeof selectedYear === 'number' && selectedYear < currentYear ? (
                    <View style={styles.chartLegendItem}>
                      <View style={[styles.chartLegendDot, { backgroundColor: '#059669' }]} />
                      <Text style={styles.chartLegendText}>รับจริงแล้วทั้งหมด</Text>
                    </View>
                  ) : (
                    <View style={styles.chartLegendItem}>
                      <View style={[styles.chartLegendDot, { backgroundColor: '#6EE7B7' }]} />
                      <Text style={styles.chartLegendText}>คาดการณ์ล่วงหน้า</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.chartLegendHint}>แตะแท่งกราฟเพื่อดูรายการ</Text>
              </View>

              {/* Selected Month Detail Pop-out */}
              {activeMonthData && activeMonthData.amount > 0 && (
                <View style={styles.selectedMonthDetails}>
                  <View style={styles.selectedMonthHeader}>
                    <Ionicons name="calendar-outline" size={16} color="#059669" />
                    <Text style={styles.selectedMonthTitle}>
                      รายละเอียดปันผลเดือน {activeMonthData.monthName}: {formatMoney(activeMonthData.amount)}
                    </Text>
                  </View>
                  {activeMonthData.details.map((d, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.detailRow}
                      activeOpacity={0.7}
                      onPress={() => {
                        setSelectedScheduleForAdjust({
                          scheduleId: d.scheduleId,
                          assetId: d.assetId,
                          symbol: d.symbol,
                          dpu: d.dpu,
                          shares: d.shares,
                          netAmount: d.netAmount,
                          xdDate: d.xdDate,
                          isInterest: d.isInterest,
                          currency: d.currency,
                          taxRate: d.taxRate,
                          isProjected: d.isProjected,
                          exchangeRate,
                        });
                        setIsAdjustModalVisible(true);
                      }}
                    >
                      <View style={styles.detailRowLeft}>
                        <View style={styles.detailSymbolRow}>
                          <Text style={styles.detailSymbol}>{d.symbol}</Text>
                          <View style={d.isInterest ? styles.interestTag : styles.divTag}>
                            <Text style={d.isInterest ? styles.interestTagText : styles.divTagText}>
                              {d.isInterest ? 'ดอกเบี้ย' : 'ปันผล'}
                            </Text>
                          </View>
                          {d.isSpecial && (
                            <View style={styles.specialTag}>
                              <Ionicons name="sparkles" size={10} color="#B45309" />
                              <Text style={styles.specialTagText}>ปันผลพิเศษ</Text>
                            </View>
                          )}
                          {d.isProjected === false && (
                            <View style={styles.receivedBadge}>
                              <Ionicons name="checkmark-circle" size={10} color="#059669" />
                              <Text style={styles.receivedBadgeText}>ได้รับแล้ว</Text>
                            </View>
                          )}
                          {d.isInterest && d.daysInfo ? (
                            <View style={[styles.daysTag, d.isPartialCycle ? styles.daysTagPartial : styles.daysTagFull]}>
                              <Text style={[styles.daysTagText, d.isPartialCycle ? styles.daysTagTextPartial : styles.daysTagTextFull]}>
                                {d.isPartialCycle ? `🕒 ${d.daysInfo}` : d.daysInfo}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.detailInfo}>
                          {d.isInterest
                            ? `ยอดเงินฝาก ${formatMoney(d.shares, 0)} • จ่ายเข้า ${d.xdDate}`
                            : d.currency === 'USD'
                            ? `${isPrivateMode ? '••••' : d.shares.toLocaleString()} หุ้น × $${d.dpu.toFixed(4)} (~฿${(d.dpu * (exchangeRate || 34.0)).toFixed(2)}) (XD: ${d.xdDate})`
                            : `${isPrivateMode ? '••••' : d.shares.toLocaleString()} หุ้น × ฿${d.dpu.toFixed(4)} (XD: ${d.xdDate})`}
                        </Text>
                      </View>
                      <View style={styles.detailRowRight}>
                        {d.currency === 'USD' ? (
                          <>
                            <Text style={styles.detailAmount}>
                              {isPrivateMode ? '฿••••••' : `$${(d.shares * d.dpu * (1 - (d.taxRate || 0))).toFixed(2)}`}
                            </Text>
                            <Text style={styles.detailSubAmount}>
                              {formatMoney(d.netAmount)}
                            </Text>
                          </>
                        ) : (
                          <Text style={styles.detailAmount}>
                            {formatMoney(d.netAmount)}
                          </Text>
                        )}
                        <View style={styles.detailActionIndicator}>
                          <Text style={styles.detailActionText}>ปรับยอด</Text>
                          <Ionicons name="pencil" size={10} color="#94A3B8" />
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}
        </View>

        {/* Minimal Passive Income Goal Card */}
        <View style={styles.goalCard}>
          <View style={styles.goalHeaderRow}>
            <View style={styles.goalTitleLeft}>
              <View style={styles.goalIconCircle}>
                <Ionicons name="flag" size={16} color="#059669" />
              </View>
              <View>
                <Text style={styles.goalTitle}>
                  {currentGoalPreset ? currentGoalPreset.label : 'เป้าหมายกระแสเงินสด'}
                </Text>
                <Text style={styles.goalSubtitle} numberOfLines={1} ellipsizeMode="tail">
                  ทำได้ {formatMoney(monthlyAvgInflow, 0)} จากเป้า {formatMoney(monthlyGoal, 0)} / เดือน
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.goalSettingsBtn}
              onPress={() => setIsGoalModalVisible(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="settings-outline" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Progress bar */}
          <View style={styles.goalProgressBarBg}>
            <View
              style={[
                styles.goalProgressBarFill,
                { width: `${goalProgressPercent}%` },
                goalProgressPercent >= 100 && styles.goalProgressBarComplete,
              ]}
            />
          </View>

          <View style={styles.goalFooterRow}>
            <Text style={styles.goalPercentText}>
              {goalProgressPercent.toFixed(1)}% สำเร็จ
            </Text>
            <Text style={styles.goalRemainingText} numberOfLines={1} ellipsizeMode="tail">
              {goalProgressPercent >= 100
                ? '🎉 พิชิตเป้าหมายแล้ว!'
                : `ขาดอีก ${formatMoney(goalRemaining, 0)}/ด. จะถึงเป้าหมาย`}
            </Text>
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* 5. Integrate Step 4: Add Asset FAB & Modal */}
      <AddAssetModal onSuccess={loadData} />

      {/* 6. Edit & Delete Asset Modal */}
      <EditAssetModal
        visible={isEditModalVisible}
        asset={selectedAssetForEdit}
        onClose={() => {
          setIsEditModalVisible(false);
          setSelectedAssetForEdit(null);
        }}
        onSuccess={() => {
          loadData();
        }}
        onNavigateToTransactions={() => {
          onNavigateToAssets?.('TRANSACTIONS', selectedAssetForEdit?.asset_type);
        }}
      />

      {/* 7. Category Breakdown & Segment Pie Chart Modal */}
      <CategoryBreakdownModal
        visible={isCategoryModalVisible}
        categoryType={selectedCategoryForBreakdown?.type ?? null}
        categoryLabel={selectedCategoryForBreakdown?.label ?? ''}
        categoryColor={selectedCategoryForBreakdown?.color ?? '#059669'}
        categoryIcon={selectedCategoryForBreakdown?.icon ?? 'pie-chart'}
        assets={assets}
        dividendSchedules={dividendSchedules}
        onClose={() => {
          setIsCategoryModalVisible(false);
          setSelectedCategoryForBreakdown(null);
        }}
        onEditAsset={(asset) => {
          setSelectedAssetForEdit(asset);
          setIsEditModalVisible(true);
        }}
      />

      {/* 8. Goal Settings Modal */}
      <GoalSettingsModal
        visible={isGoalModalVisible}
        currentGoal={monthlyGoal}
        onClose={() => setIsGoalModalVisible(false)}
        onSave={(newGoal) => setMonthlyGoal(newGoal)}
      />

      {/* 9. Adjust Dividend Payout Modal */}
      <AdjustDividendModal
        visible={isAdjustModalVisible}
        target={selectedScheduleForAdjust}
        onClose={() => {
          setIsAdjustModalVisible(false);
          setSelectedScheduleForAdjust(null);
        }}
        onSuccess={() => {
          loadData(true);
        }}
      />

      {/* 10. Annual YoY Comparison & Historical Breakdown Sheet */}
      <AnnualComparisonSheet
        visible={isAnnualComparisonVisible}
        onClose={() => setIsAnnualComparisonVisible(false)}
        currentYear={currentYear}
        currentYearTotal={projectedAnnualNetDividend}
        priorYearTotal={priorYearTotalNetDividend}
        priorYearItems={priorYearDetails}
        formatMoney={formatMoney}
      />

      {/* 11. Modal: กรองประเภทกระแสเงินสด */}
      <Modal
        visible={isInflowFilterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsInflowFilterModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsInflowFilterModalVisible(false)}
        >
          <View style={styles.pickerModalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.pickerModalHeader}>
              <View style={styles.pickerModalTitleRow}>
                <Ionicons name="funnel-outline" size={17} color="#059669" />
                <Text style={styles.pickerModalTitle}>กรองประเภทกระแสเงินสด</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsInflowFilterModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.pickerOptionsList}>
              {[
                {
                  label: 'ทั้งหมด (ปันผล + ดอกเบี้ย)',
                  sublabel: 'หุ้น, กองทุนรวม และเงินฝากธนาคาร',
                  value: 'ALL',
                  icon: 'wallet-outline',
                  color: '#059669',
                },
                {
                  label: 'เฉพาะหุ้นและกองทุน (เงินปันผล)',
                  sublabel: 'เงินปันผลจากหุ้นไทย, หุ้นนอก และกองทุน',
                  value: 'DIVIDENDS',
                  icon: 'trending-up-outline',
                  color: '#2563EB',
                },
                {
                  label: 'เฉพาะบัญชีเงินฝาก (ดอกเบี้ย)',
                  sublabel: 'ดอกเบี้ยเงินฝากออมทรัพย์และดิจิทัล',
                  value: 'INTEREST',
                  icon: 'cash-outline',
                  color: '#10B981',
                },
              ].map((opt) => {
                const isSelected = inflowFilter === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.pickerOptionItem, isSelected && styles.pickerOptionItemSelected]}
                    onPress={() => {
                      setInflowFilter(opt.value as any);
                      setIsInflowFilterModalVisible(false);
                      setSelectedMonth(null);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.pickerOptionLeft}>
                      <View style={[styles.pickerIconCircle, { backgroundColor: `${opt.color}15` }]}>
                        <Ionicons name={opt.icon as any} size={16} color={opt.color} />
                      </View>
                      <View>
                        <Text style={[styles.pickerOptionLabel, isSelected && styles.pickerOptionLabelSelected]}>
                          {opt.label}
                        </Text>
                        <Text style={styles.pickerOptionSublabel}>{opt.sublabel}</Text>
                      </View>
                    </View>
                    {isSelected ? (
                      <Ionicons name="checkmark-circle" size={20} color="#059669" />
                    ) : (
                      <View style={styles.pickerUncheckedCircle} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 12. Modal: เลือกปีแสดงผล */}
      <Modal
        visible={isYearPickerModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsYearPickerModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsYearPickerModalVisible(false)}
        >
          <View style={styles.pickerModalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.pickerModalHeader}>
              <View style={styles.pickerModalTitleRow}>
                <Ionicons name="calendar-outline" size={17} color="#059669" />
                <Text style={styles.pickerModalTitle}>เลือกปีแสดงกระแสเงินสด</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsYearPickerModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              <View style={styles.pickerOptionsList}>
                {availableYears.map((yr) => {
                  const isSelected = selectedYear === yr;
                  const isCurYear = yr === currentYear;
                  const badgeText = isCurYear
                    ? 'ปีนี้'
                    : yr === currentYear - 1
                    ? 'ปีที่แล้ว'
                    : yr === currentYear + 1
                    ? 'ปีหน้า'
                    : null;

                  return (
                    <TouchableOpacity
                      key={yr}
                      style={[styles.pickerOptionItem, isSelected && styles.pickerOptionItemSelected]}
                      onPress={() => {
                        setSelectedYear(yr);
                        setIsYearPickerModalVisible(false);
                        setSelectedMonth(null);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.pickerOptionLeft}>
                        <View
                          style={[
                            styles.pickerIconCircle,
                            { backgroundColor: isCurYear ? '#ECFDF5' : '#F1F5F9' },
                          ]}
                        >
                          <Ionicons
                            name="calendar"
                            size={16}
                            color={isCurYear ? '#059669' : '#64748B'}
                          />
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text
                            style={[
                              styles.pickerOptionLabel,
                              isSelected && styles.pickerOptionLabelSelected,
                            ]}
                          >
                            ปี {yr}
                          </Text>
                          {badgeText && (
                            <View
                              style={[
                                styles.yearBadgePill,
                                isCurYear ? styles.yearBadgePillCurrent : styles.yearBadgePillDefault,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.yearBadgeText,
                                  isCurYear ? styles.yearBadgeTextCurrent : styles.yearBadgeTextDefault,
                                ]}
                              >
                                {badgeText}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                      {isSelected ? (
                        <Ionicons name="checkmark-circle" size={20} color="#059669" />
                      ) : (
                        <View style={styles.pickerUncheckedCircle} />
                      )}
                    </TouchableOpacity>
                  );
                })}

                {/* Option: Rolling 12M */}
                <TouchableOpacity
                  style={[
                    styles.pickerOptionItem,
                    selectedYear === 'ROLLING' && styles.pickerOptionItemSelected,
                  ]}
                  onPress={() => {
                    setSelectedYear('ROLLING');
                    setIsYearPickerModalVisible(false);
                    setSelectedMonth(null);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.pickerOptionLeft}>
                    <View style={[styles.pickerIconCircle, { backgroundColor: '#ECFDF5' }]}>
                      <Ionicons name="repeat-outline" size={16} color="#059669" />
                    </View>
                    <View>
                      <Text
                        style={[
                          styles.pickerOptionLabel,
                          selectedYear === 'ROLLING' && styles.pickerOptionLabelSelected,
                        ]}
                      >
                        12 เดือนข้างหน้า (Rolling 12M)
                      </Text>
                      <Text style={styles.pickerOptionSublabel}>
                        คำนวณ 12 เดือนข้างหน้าเริ่มต้นจากเดือนปัจจุบัน
                      </Text>
                    </View>
                  </View>
                  {selectedYear === 'ROLLING' ? (
                    <Ionicons name="checkmark-circle" size={20} color="#059669" />
                  ) : (
                    <View style={styles.pickerUncheckedCircle} />
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  headerTitleCol: {
    flex: 1,
    paddingRight: 12,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  headerExitBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerActionBtn: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
  },
  headerActionBtnActive: {
    backgroundColor: '#D1FAE5',
  },
  profitText: {
    color: '#059669',
  },
  lossText: {
    color: '#DC2626',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  badgeXD: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeXDText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  categoryCardsContainer: {
    flexDirection: 'column',
    gap: 8,
    marginBottom: 16,
  },
  categoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  categoryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  categoryIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryHeaderRight: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  categoryAllocationText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  categoryTitle: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '700',
  },
  categoryValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryValue: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '800',
    color: '#0F172A',
    minHeight: 19,
  },
  categoryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryAssetCount: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  categoryPL: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressBarBackground: {
    height: 3,
    backgroundColor: '#F1F5F9',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  chartHeaderLeft: {
    flex: 1,
  },
  chartHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chartCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  yearTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 0.5,
  },
  yearTagPillCurrent: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  yearTagPillDefault: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  yearTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  yearTagTextCurrent: {
    color: '#047857',
  },
  yearTagTextDefault: {
    color: '#64748B',
  },
  chartTotalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 4,
  },
  chartTotalAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  chartAvgText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  receivedPendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  receivedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pendingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dotReceived: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#059669',
  },
  dotPending: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#6EE7B7',
  },
  receivedPillText: {
    fontSize: 11,
    color: '#047857',
    fontWeight: '600',
  },
  pendingPillText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
  },
  emptyChartBox: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyChartText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
    marginTop: 10,
  },
  emptyChartSubtext: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 180,
    paddingTop: 24,
    paddingBottom: 4,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  barTopAmount: {
    fontSize: 9,
    fontWeight: '700',
    color: '#059669',
    marginBottom: 3,
  },
  barTopAmountSelected: {
    color: '#0F172A',
    fontWeight: '800',
  },
  barTrack: {
    width: 16,
    height: 110,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: '#E2E8F0',
  },
  barTrackCurrent: {
    borderWidth: 1.5,
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  barTrackSelected: {
    borderWidth: 1.5,
    borderColor: '#0F172A',
  },
  barFill: {
    width: '100%',
    borderRadius: 8,
  },
  barFillPast: {
    backgroundColor: '#059669',
  },
  barFillCurrent: {
    backgroundColor: '#10B981',
  },
  barFillFuture: {
    backgroundColor: '#6EE7B7',
  },
  barFillInactive: {
    backgroundColor: '#E2E8F0',
  },
  barFillSelected: {
    backgroundColor: '#0F172A',
  },
  monthLabelWrapper: {
    marginTop: 4,
    paddingHorizontal: 2,
    paddingVertical: 1,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabelWrapperCurrent: {
    backgroundColor: '#ECFDF5',
    borderWidth: 0.5,
    borderColor: '#A7F3D0',
  },
  barMonthLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
  },
  barMonthLabelSelected: {
    color: '#0F172A',
    fontWeight: '800',
  },
  barMonthLabelCurrent: {
    color: '#047857',
    fontWeight: '800',
  },
  nowBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  nowBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: -0.2,
  },
  nowPlaceholder: {
    height: 16,
    marginTop: 2,
  },
  nowBadgeLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: '#A7F3D0',
    gap: 1,
  },
  chartLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  chartLegendItemsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  chartLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chartLegendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chartLegendText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  chartLegendHint: {
    fontSize: 10,
    color: '#94A3B8',
  },
  selectedMonthDetails: {
    marginTop: 14,
    padding: 12,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  selectedMonthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  selectedMonthTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: '#DCFCE7',
  },
  detailRowLeft: {
    flex: 1,
    paddingRight: 10,
  },
  detailSymbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  detailSymbol: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  interestTag: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  interestTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284C7',
  },
  divTag: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  divTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#16A34A',
  },
  daysTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  daysTagPartial: {
    backgroundColor: '#FEF3C7',
    borderWidth: 0.5,
    borderColor: '#FDE68A',
  },
  daysTagFull: {
    backgroundColor: '#F1F5F9',
  },
  daysTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  daysTagTextPartial: {
    color: '#B45309',
  },
  daysTagTextFull: {
    color: '#64748B',
  },
  detailInfo: {
    fontSize: 11,
    color: '#475569',
  },
  detailAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
  },
  detailSubAmount: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },
  detailRowRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  detailActionIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  detailActionText: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '500',
  },
  receivedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  receivedBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#059669',
  },
  specialTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  specialTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#B45309',
  },
  assetCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  assetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  assetSymbol: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  assetSymbolContainer: {
    flex: 1,
  },
  assetSymbolTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    fontSize: 17,
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
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  assetFooterText: {
    fontSize: 12,
    color: '#64748B',
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
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  bottomSpacer: {
    height: 60,
  },
  forecastFilterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  filterDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  filterDropdownText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  yearSelectorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 3,
    paddingVertical: 2,
    elevation: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  yearArrowBtn: {
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 6,
  },
  yearDisplayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  yearDisplayText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    paddingHorizontal: 16,
    maxHeight: '80%',
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 8,
  },
  pickerModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickerModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  pickerOptionsList: {
    paddingVertical: 4,
    gap: 4,
  },
  pickerOptionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  pickerOptionItemSelected: {
    backgroundColor: '#F0FDF4',
  },
  pickerOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  pickerIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerOptionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  pickerOptionLabelSelected: {
    color: '#047857',
    fontWeight: '700',
  },
  pickerOptionSublabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  pickerUncheckedCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  yearBadgePill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  yearBadgePillCurrent: {
    backgroundColor: '#ECFDF5',
  },
  yearBadgePillDefault: {
    backgroundColor: '#F1F5F9',
  },
  yearBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  yearBadgeTextCurrent: {
    color: '#059669',
  },
  yearBadgeTextDefault: {
    color: '#64748B',
  },
  categoryHeaderRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tapToPieBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  tapToPieText: {
    fontSize: 9,
    fontWeight: '700',
  },
  seeAllBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  seeAllBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  categoryInflowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
    justifyContent: 'flex-end',
  },
  categoryInflowText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
  },
  goalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginTop: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  goalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goalTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  goalIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  goalSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    color: '#64748B',
    marginTop: 1,
    minHeight: 16,
  },
  goalSettingsBtn: {
    padding: 6,
  },
  goalProgressBarBg: {
    height: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 14,
    marginBottom: 8,
  },
  goalProgressBarFill: {
    height: '100%',
    backgroundColor: '#059669',
    borderRadius: 4,
  },
  goalProgressBarComplete: {
    backgroundColor: '#10B981',
  },
  goalFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goalPercentText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: '#059669',
  },
  goalRemainingText: {
    fontSize: 12,
    lineHeight: 16,
    color: '#64748B',
    minHeight: 16,
  },
  topAssetRightSub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  topAssetYoCBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  topAssetYoCText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
});

export default Dashboard;
