import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { AssetSummary, Transaction, DividendSchedule, AssetType } from '../types/database';
import { AddAssetModal } from '../components/AddAssetModal';
import { EditAssetModal } from '../components/EditAssetModal';
import { CategoryBreakdownModal } from '../components/CategoryBreakdownModal';
import { getAllAssetCurrencies, getCachedExchangeRate, isKnownUSSymbol } from '../services/currencyService';
import { calculateScheduleCashPayout } from '../services/taxService';
import { consolidateDuplicateAssets } from '../services/assetConsolidationService';

const MONTH_NAMES = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

interface MonthlyPayoutItem {
  monthIndex: number;
  monthName: string;
  amount: number;
  details: {
    symbol: string;
    dpu: number;
    shares: number;
    netAmount: number;
    xdDate: string;
    isInterest: boolean;
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedAssetForEdit, setSelectedAssetForEdit] = useState<AssetSummary | null>(null);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [selectedCategoryForBreakdown, setSelectedCategoryForBreakdown] = useState<CategoryStats | null>(null);
  const [isCategoryModalVisible, setIsCategoryModalVisible] = useState(false);
  const [inflowFilter, setInflowFilter] = useState<'ALL' | 'DIVIDENDS' | 'INTEREST'>('ALL');
  const [exchangeRate, setExchangeRate] = useState<number>(34.00);
  const [currencyMap, setCurrencyMap] = useState<Record<string, 'THB' | 'USD'>>({});

  const isUSStock = useCallback((item: AssetSummary): boolean => {
    if (item.asset_type !== 'STOCKS') return false;
    if (currencyMap[item.id] === 'USD') return true;
    if (currencyMap[item.id] === 'THB') return false;
    if (isKnownUSSymbol(item.symbol)) return true;
    if (item.tax_rate !== undefined && Math.abs(Number(item.tax_rate) - 0.15) < 0.005) return true;
    return false;
  }, [currencyMap]);

  const ensureAuthenticated = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      await supabase.auth.signInWithPassword({
        email: 'demo@mydividend.app',
        password: 'Password123!',
      });
    }
  };

  const loadData = useCallback(async () => {
    try {
      await ensureAuthenticated();

      // 0. Auto-consolidate any duplicate assets if present
      await consolidateDuplicateAssets();

      // 1. Fetch assets summary view
      const { data: summaryData, error: summaryError } = await supabase
        .from('view_asset_summary')
        .select('*')
        .order('created_at', { ascending: false });

      if (summaryError) {
        console.warn('Error fetching view_asset_summary:', summaryError.message);
      } else {
        setAssets((summaryData as AssetSummary[]) || []);
      }

      // 2. Fetch all transactions for XD cutoff calculations
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .order('transaction_date', { ascending: true });

      if (txError) {
        console.warn('Error fetching transactions:', txError.message);
      } else {
        setTransactions((txData as Transaction[]) || []);
      }

      // 3. Fetch dividend schedules
      const { data: divData, error: divError } = await supabase
        .from('dividend_schedules')
        .select('*')
        .order('xd_date', { ascending: true });

      if (divError) {
        console.warn('Error fetching dividend_schedules:', divError.message);
      } else {
        setDividendSchedules((divData as DividendSchedule[]) || []);
      }

      // 4. Fetch live exchange rate and local currency settings
      const [rate, currencies] = await Promise.all([
        getCachedExchangeRate(),
        getAllAssetCurrencies(),
      ]);
      setExchangeRate(rate);
      setCurrencyMap(currencies);
    } catch (err: any) {
      console.warn('Load data error:', err.message);
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
    loadData();
  };

  // --- Calculations ---

  // Portfolio Totals
  const totalMarketValue = assets.reduce((sum, item) => sum + (Number(item.market_value) || 0), 0);
  const totalCost = assets.reduce((sum, item) => sum + (Number(item.total_cost) || 0), 0);
  const totalUnrealizedPL = totalMarketValue - totalCost;
  const totalUnrealizedPLPercent = totalCost > 0 ? (totalUnrealizedPL / totalCost) * 100 : 0;

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

  // Dividend Forecasting Engine (12-Month Bar Chart) with Strict XD Cutoff Logic
  // Formula: Shares * DPU * (1 - tax_rate) where transaction_date < xd_date
  const monthlyForecasts: MonthlyPayoutItem[] = MONTH_NAMES.map((name, index) => ({
    monthIndex: index,
    monthName: name,
    amount: 0,
    details: [],
  }));

  let projectedAnnualNetDividend = 0;

  dividendSchedules.forEach((schedule) => {
    const parentAsset = assets.find((a) => a.id === schedule.asset_id);
    if (!parentAsset) return;

    // Filter by Inflow Mode
    const isCashAsset = parentAsset.asset_type === 'CASH';
    if (inflowFilter === 'DIVIDENDS' && isCashAsset) return;
    if (inflowFilter === 'INTEREST' && !isCashAsset) return;

    // Strict XD Cutoff: only count buy/sell transactions occurring on or before xd_date
    const eligibleTxs = transactions.filter(
      (t) => t.asset_id === schedule.asset_id && t.transaction_date <= schedule.xd_date
    );
    const eligibleShares = eligibleTxs.reduce(
      (sum, t) => sum + (t.type === 'BUY' ? Number(t.shares) : -Number(t.shares)),
      0
    );

    if (eligibleShares <= 0) return;

    const taxRate = parentAsset.tax_rate !== undefined && parentAsset.tax_rate !== null
      ? Number(parentAsset.tax_rate)
      : (isCashAsset ? 0 : 0.1000);
    const dpu = Number(schedule.dpu) || 0;

    let netDividend = 0;
    let daysInfo: string | undefined = undefined;
    let isPartialCycle = false;

    if (isCashAsset) {
      // Find interest frequency by schedules count
      const assetSchedules = dividendSchedules.filter((s) => s.asset_id === schedule.asset_id);
      const freq: 'MONTHLY' | 'SEMI_ANNUAL' | 'ANNUAL' =
        assetSchedules.length >= 12 ? 'MONTHLY' : assetSchedules.length >= 2 ? 'SEMI_ANNUAL' : 'ANNUAL';
      const divisor = freq === 'MONTHLY' ? 12 : freq === 'SEMI_ANNUAL' ? 2 : 1;
      const annualRatePct = dpu * divisor * 100;

      let totalCashNet = 0;
      let hasPartial = false;
      let partialLabel = '';

      eligibleTxs.forEach((t) => {
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

      if (totalCashNet <= 0) return;
      netDividend = totalCashNet;
      isPartialCycle = hasPartial;
      daysInfo = hasPartial ? partialLabel : 'เต็มงวด';
    } else {
      netDividend = eligibleShares * dpu * (1 - taxRate);
    }

    if (netDividend <= 0) return;

    // Determine payout month from xd_date or payment_date
    const dateToUse = schedule.payment_date || schedule.xd_date;
    const targetMonth = new Date(dateToUse).getMonth();

    if (targetMonth >= 0 && targetMonth < 12) {
      monthlyForecasts[targetMonth].amount += netDividend;
      monthlyForecasts[targetMonth].details.push({
        symbol: parentAsset.symbol,
        dpu,
        shares: eligibleShares,
        netAmount: netDividend,
        xdDate: schedule.xd_date,
        isInterest: isCashAsset,
        daysInfo,
        isPartialCycle,
      });
      projectedAnnualNetDividend += netDividend;
    }
  });

  // Max value for bar chart normalization
  const maxMonthlyAmount = Math.max(...monthlyForecasts.map((m) => m.amount), 1);

  // Active selected month details
  const activeMonthData = selectedMonth !== null ? monthlyForecasts[selectedMonth] : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#059669" />
        }
      >
        {/* Header Title */}
        <View style={styles.topHeader}>
          <View>
            <Text style={styles.screenTitle}>My Dividend</Text>
            <Text style={styles.screenSubtitle}>ภาพรวมพอร์ตและการคาดการณ์ปันผล</Text>
          </View>
          <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
            <Ionicons name="refresh" size={20} color="#059669" />
          </TouchableOpacity>
        </View>

        {/* 1. Header: Total Portfolio Value & Projected Annual Net Dividend */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.heroLabel}>มูลค่าพอร์ตรวม (Total Net Worth)</Text>
              <Text style={styles.heroValue}>
                ฿{totalMarketValue.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={[styles.plBadge, totalUnrealizedPL >= 0 ? styles.plBadgeProfit : styles.plBadgeLoss]}>
              <Ionicons
                name={totalUnrealizedPL >= 0 ? 'arrow-up' : 'arrow-down'}
                size={14}
                color={totalUnrealizedPL >= 0 ? '#166534' : '#991B1B'}
              />
              <Text style={[styles.plBadgeText, totalUnrealizedPL >= 0 ? styles.profitText : styles.lossText]}>
                {totalUnrealizedPL >= 0 ? '+' : ''}
                {totalUnrealizedPLPercent.toFixed(2)}%
              </Text>
            </View>
          </View>

          {/* Annual Net Dividend Highlight */}
          <View style={styles.dividendHighlightBox}>
            <View style={styles.dividendIconBadge}>
              <Ionicons name="cash-outline" size={22} color="#059669" />
            </View>
            <View style={styles.dividendTextContainer}>
              <Text style={styles.dividendHighlightLabel}>เงินปันผลสุทธิคาดการณ์ทั้งปี (Annual Net Dividend)</Text>
              <Text style={styles.dividendHighlightValue}>
                ฿{projectedAnnualNetDividend.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          </View>

          {/* Secondary stats row */}
          <View style={styles.heroBottomRow}>
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatLabel}>ต้นทุนรวม</Text>
              <Text style={styles.heroStatValue}>
                ฿{totalCost.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatLabel}>กำไร/ขาดทุน (P/L)</Text>
              <Text style={[styles.heroStatValue, totalUnrealizedPL >= 0 ? styles.profitTextLight : styles.lossTextLight]}>
                {totalUnrealizedPL >= 0 ? '+' : ''}฿
                {totalUnrealizedPL.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
        </View>

        {/* 2. Category Cards: Stocks, Funds, Cash/Savings */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>สัดส่วนสินทรัพย์ตามหมวดหมู่</Text>
          <Text style={styles.sectionSubtitle}>3 หมวดหมู่หลัก</Text>
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
              <View style={styles.categoryHeader}>
                <View style={[styles.categoryIconCircle, { backgroundColor: cat.bgColor }]}>
                  <Ionicons name={cat.icon} size={20} color={cat.color} />
                </View>
                <View style={styles.categoryHeaderRightRow}>
                  <View style={[styles.tapToPieBadge, { backgroundColor: cat.bgColor }]}>
                    <Ionicons name="pie-chart" size={12} color={cat.color} />
                    <Text style={[styles.tapToPieText, { color: cat.color }]}>สัดส่วน Segment</Text>
                  </View>
                  <View style={styles.categoryHeaderRight}>
                    <Text style={styles.categoryAllocationText}>{cat.allocationPercent.toFixed(1)}%</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.categoryTitle}>{cat.label}</Text>
              <Text style={styles.categoryValue}>
                ฿{cat.marketValue.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>

              <View style={styles.categoryFooter}>
                <Text style={styles.categoryAssetCount}>{cat.count} รายการ</Text>
                <Text style={[styles.categoryPL, cat.unrealizedPL >= 0 ? styles.profitText : styles.lossText]}>
                  {cat.unrealizedPL >= 0 ? '+' : ''}
                  {cat.unrealizedPLPercent.toFixed(2)}%
                </Text>
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

        {/* 3-Way Inflow Toggle Filter (Option 3) */}
        <View style={styles.inflowFilterContainer}>
          {[
            { label: 'ทั้งหมด (ปันผล+ดอกเบี้ย)', value: 'ALL' },
            { label: 'เฉพาะปันผล', value: 'DIVIDENDS' },
            { label: 'เฉพาะดอกเบี้ย', value: 'INTEREST' },
          ].map((f) => (
            <TouchableOpacity
              key={f.value}
              style={[
                styles.inflowFilterBtn,
                inflowFilter === f.value && styles.inflowFilterBtnActive,
              ]}
              onPress={() => setInflowFilter(f.value as any)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.inflowFilterBtnText,
                  inflowFilter === f.value && styles.inflowFilterBtnTextActive,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.chartCard}>
          {projectedAnnualNetDividend === 0 ? (
            <View style={styles.emptyChartBox}>
              <Ionicons name="bar-chart-outline" size={40} color="#CBD5E1" />
              <Text style={styles.emptyChartText}>ยังไม่มีข้อมูลปันผลคาดการณ์</Text>
              <Text style={styles.emptyChartSubtext}>
                เพิ่มหุ้นและระบุ Expected DPU ผ่านปุ่ม + เพื่อดูแท่งกราฟปันผลรายเดือน
              </Text>
            </View>
          ) : (
            <>
              {/* Monthly Bar Chart View */}
              <View style={styles.barsContainer}>
                {monthlyForecasts.map((item) => {
                  const hasPayout = item.amount > 0;
                  const barHeightRatio = hasPayout ? Math.max(0.12, item.amount / maxMonthlyAmount) : 0.05;
                  const isSelected = selectedMonth === item.monthIndex;

                  return (
                    <TouchableOpacity
                      key={item.monthIndex}
                      style={styles.barColumn}
                      onPress={() => setSelectedMonth(isSelected ? null : item.monthIndex)}
                      activeOpacity={0.7}
                    >
                      {/* Amount tooltip above bar if has payout */}
                      {hasPayout && (
                        <Text style={styles.barTopAmount}>
                          ฿{item.amount >= 1000 ? `${(item.amount / 1000).toFixed(1)}k` : item.amount.toFixed(0)}
                        </Text>
                      )}

                      {/* Bar Graphic */}
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            { height: `${barHeightRatio * 100}%` },
                            hasPayout ? styles.barFillActive : styles.barFillInactive,
                            isSelected && styles.barFillSelected,
                          ]}
                        />
                      </View>

                      {/* Month Label */}
                      <Text style={[styles.barMonthLabel, isSelected && styles.barMonthLabelSelected]}>
                        {item.monthName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Selected Month Detail Pop-out */}
              {activeMonthData && activeMonthData.amount > 0 && (
                <View style={styles.selectedMonthDetails}>
                  <View style={styles.selectedMonthHeader}>
                    <Ionicons name="calendar-outline" size={16} color="#059669" />
                    <Text style={styles.selectedMonthTitle}>
                      รายละเอียดปันผลเดือน {activeMonthData.monthName}: ฿
                      {activeMonthData.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                  {activeMonthData.details.map((d, idx) => (
                    <View key={idx} style={styles.detailRow}>
                      <View style={styles.detailRowLeft}>
                        <View style={styles.detailSymbolRow}>
                          <Text style={styles.detailSymbol}>{d.symbol}</Text>
                          <View style={d.isInterest ? styles.interestTag : styles.divTag}>
                            <Text style={d.isInterest ? styles.interestTagText : styles.divTagText}>
                              {d.isInterest ? 'ดอกเบี้ย' : 'ปันผล'}
                            </Text>
                          </View>
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
                            ? `ยอดเงินฝาก ฿${d.shares.toLocaleString('th-TH')} • จ่ายเข้า ${d.xdDate}`
                            : `${d.shares.toLocaleString()} หุ้น × ฿${d.dpu.toFixed(4)} (XD: ${d.xdDate})`}
                        </Text>
                      </View>
                      <Text style={styles.detailAmount}>
                        ฿{d.netAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </View>

        {/* 4. Portfolio Overview & Link to Portfolio Screen */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>พอร์ตสินทรัพย์ ({assets.length})</Text>
          {onNavigateToPortfolio && (
            <TouchableOpacity
              onPress={() => onNavigateToPortfolio('ALL')}
              style={styles.seeAllBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.seeAllBtnText}>ดูสัดส่วน & สินทรัพย์ →</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#059669" />
            <Text style={styles.loadingText}>กำลังโหลดข้อมูล...</Text>
          </View>
        ) : assets.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="wallet-outline" size={48} color="#94A3B8" />
            <Text style={styles.emptyTitle}>ยังไม่มีสินทรัพย์ในพอร์ต</Text>
            <Text style={styles.emptySubtitle}>แตะปุ่ม + ที่มุมขวาล่าง เพื่อบันทึกสินทรัพย์และปันผลแรกของคุณ</Text>
          </View>
        ) : (
          <View style={styles.portfolioSummaryCard}>
            <View style={styles.portfolioSummaryTop}>
              <View>
                <Text style={styles.portfolioSummaryLabel}>มูลค่าสินทรัพย์ทั้งหมดในพอร์ต</Text>
                <Text style={styles.portfolioSummaryValue}>
                  ฿{assets.reduce((sum, a) => sum + (Number(a.market_value) || 0), 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
              {onNavigateToPortfolio && (
                <TouchableOpacity
                  style={styles.openPortfolioActionBtn}
                  onPress={() => onNavigateToPortfolio('ALL')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="pie-chart" size={15} color="#FFFFFF" />
                  <Text style={styles.openPortfolioActionBtnText}>เปิดดู Pie Chart</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Quick Preview of Top 3 Assets by Highest Market Value */}
            <View style={styles.topAssetsList}>
              {[...assets]
                .sort((a, b) => (Number(b.market_value) || 0) - (Number(a.market_value) || 0))
                .slice(0, 3)
                .map((item) => {
                const isUS = isUSStock(item);
                const rate = exchangeRate > 0 ? exchangeRate : 34.00;
                const priceUSD = isUS ? Number(item.current_price) / rate : 0;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.topAssetItem}
                    onPress={() => {
                      setSelectedAssetForEdit(item);
                      setIsEditModalVisible(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.topAssetLeft}>
                      <View style={styles.topAssetSymbolRow}>
                        <Text style={styles.topAssetSymbol}>{item.symbol}</Text>
                        {isUS && (
                          <View style={styles.usBadge}>
                            <Text style={styles.usBadgeText}>USD $</Text>
                          </View>
                        )}
                        <Text style={styles.topAssetTypeTag}>{item.asset_type}</Text>
                      </View>
                      <Text style={styles.topAssetSub}>
                        {isUS
                          ? `$${priceUSD.toFixed(2)} (~฿${Number(item.current_price).toFixed(2)}) • ${Number(item.net_shares).toLocaleString()} หุ้น`
                          : item.asset_type === 'CASH'
                          ? `เงินต้น ฿${Number(item.market_value).toLocaleString()}`
                          : `฿${Number(item.current_price).toFixed(2)} • ${Number(item.net_shares).toLocaleString()} หุ้น`}
                      </Text>
                    </View>
                    <View style={styles.topAssetRight}>
                      <Text style={styles.topAssetVal}>
                        ฿{Number(item.market_value).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                      <Text style={[styles.topAssetPL, Number(item.unrealized_pl) >= 0 ? styles.profitText : styles.lossText]}>
                        {Number(item.unrealized_pl) >= 0 ? '+' : ''}
                        {Number(item.unrealized_pl_percent).toFixed(1)}%
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {onNavigateToAssets ? (
              <TouchableOpacity
                style={styles.viewFullPortfolioBtn}
                onPress={() => onNavigateToAssets('HOLDINGS', 'ALL')}
                activeOpacity={0.7}
              >
                <Text style={styles.viewFullPortfolioBtnText}>
                  {assets.length > 3
                    ? `ดูสินทรัพย์ทั้งหมด ${assets.length} รายการ & ประวัติธุรกรรม →`
                    : 'เปิดดูรายการสินทรัพย์ทั้งหมด & ประวัติธุรกรรม →'}
                </Text>
              </TouchableOpacity>
            ) : onNavigateToPortfolio && (
              <TouchableOpacity
                style={styles.viewFullPortfolioBtn}
                onPress={() => onNavigateToPortfolio('ALL')}
                activeOpacity={0.7}
              >
                <Text style={styles.viewFullPortfolioBtnText}>
                  {assets.length > 3
                    ? `ดูสินทรัพย์ทั้งหมดอีก ${assets.length - 3} รายการ ใน Portfolio →`
                    : 'เปิดดูพอร์ตสินทรัพย์และ Donut Pie Chart →'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

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
  },
  refreshButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
  },
  heroCard: {
    backgroundColor: '#0F172A',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    elevation: 4,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroLabel: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
  heroValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4,
  },
  plBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
  },
  plBadgeProfit: {
    backgroundColor: '#DCFCE7',
  },
  plBadgeLoss: {
    backgroundColor: '#FEE2E2',
  },
  plBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  profitText: {
    color: '#059669',
  },
  lossText: {
    color: '#DC2626',
  },
  profitTextLight: {
    color: '#34D399',
  },
  lossTextLight: {
    color: '#F87171',
  },
  dividendHighlightBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  dividendIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  dividendTextContainer: {
    flex: 1,
  },
  dividendHighlightLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  dividendHighlightValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#34D399',
    marginTop: 2,
  },
  heroBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  heroStatItem: {
    flex: 1,
  },
  heroDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#1E293B',
    marginHorizontal: 16,
  },
  heroStatLabel: {
    fontSize: 12,
    color: '#94A3B8',
  },
  heroStatValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 2,
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
    gap: 10,
    marginBottom: 20,
  },
  categoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryHeaderRight: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  categoryAllocationText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  categoryTitle: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  categoryValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
    marginBottom: 8,
  },
  categoryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryAssetCount: {
    fontSize: 12,
    color: '#64748B',
  },
  categoryPL: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
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
    height: 160,
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
    marginBottom: 2,
  },
  barTrack: {
    width: 14,
    height: 100,
    backgroundColor: '#F1F5F9',
    borderRadius: 7,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 7,
  },
  barFillActive: {
    backgroundColor: '#059669',
  },
  barFillInactive: {
    backgroundColor: '#E2E8F0',
  },
  barFillSelected: {
    backgroundColor: '#0F172A',
  },
  barMonthLabel: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 6,
    fontWeight: '500',
  },
  barMonthLabelSelected: {
    color: '#0F172A',
    fontWeight: '800',
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
  inflowFilterContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
    gap: 4,
  },
  inflowFilterBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 9,
  },
  inflowFilterBtnActive: {
    backgroundColor: '#FFFFFF',
    elevation: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  inflowFilterBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  inflowFilterBtnTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  categoryHeaderRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tapToPieBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tapToPieText: {
    fontSize: 11,
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
  portfolioSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  portfolioSummaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  portfolioSummaryLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  portfolioSummaryValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  openPortfolioActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
  },
  openPortfolioActionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  topAssetsList: {
    gap: 8,
  },
  topAssetItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  topAssetLeft: {
    flex: 1,
  },
  topAssetSymbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topAssetSymbol: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  topAssetTypeTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  topAssetSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  topAssetRight: {
    alignItems: 'flex-end',
  },
  topAssetVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  topAssetPL: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  viewFullPortfolioBtn: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    alignItems: 'center',
  },
  viewFullPortfolioBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
});

export default Dashboard;
