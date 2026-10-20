// หน้าจอจัดการสินทรัพย์คงเหลือและประวัติธุรกรรมการซื้อขาย พร้อมระบบค้นหาและตัวกรองตามปี/เดือน/ประเภทสินทรัพย์
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  Share,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { AssetSummary, AssetType, DividendSchedule, Transaction, TransactionType } from '../types/database';
import { EditAssetModal } from '../components/EditAssetModal';
import { EditTransactionModal } from '../components/EditTransactionModal';
import { AddAssetModal } from '../components/AddAssetModal';
import { ImportCsvModal } from '../components/ImportCsvModal';
import { AssetSparklineCard } from '../components/AssetSparklineCard';
import { isKnownUSSymbol, getCachedExchangeRate, getAllAssetCurrencies } from '../services/currencyService';
import { consolidateDuplicateAssets } from '../services/assetConsolidationService';
import { exportPortfolioToCsv } from '../services/csvService';
import { usePrivacyMode } from '../services/privacyService';
import { getLocalDateString } from '../utils/dateUtils';
import { ensureAuthenticated } from '../services/authService';
import { syncDailyPricesIfNeeded } from '../services/priceSyncService';
import { calculatePortfolioReturns } from '../services/returnService';
import { getCachedPortfolio, savePortfolioCache, notifyOffline } from '../services/portfolioCacheService';
import { portfolioEvents } from '../services/eventService';
import { colors, fonts } from '../theme/tokens';
import { CalmText } from '../components/ui/CalmText';
import { Pill } from '../components/ui/Pill';
import { Card } from '../components/ui/Card';
import { DashedDivider } from '../components/ui/DashedDivider';
import { SheetFrame } from '../components/ui/SheetFrame';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type ViewMode = 'HOLDINGS' | 'TRANSACTIONS';
type SortOption = 'VALUE_DESC' | 'PL_DESC' | 'PL_ASC' | 'SYMBOL_ASC';

interface AssetsScreenProps {
  initialView?: ViewMode;
  initialCategoryFilter?: 'ALL' | AssetType;
  onNavigateToDashboard?: () => void;
  onNavigateToPortfolio?: () => void;
}

interface EnrichedTransaction extends Transaction {
  symbol: string;
  asset_type: AssetType;
  current_price: number;
  currency?: 'THB' | 'USD';
}

const MONTH_NAMES = [
  { key: 'ALL', label: 'ทุกเดือน' },
  { key: '01', label: 'ม.ค.' },
  { key: '02', label: 'ก.พ.' },
  { key: '03', label: 'มี.ค.' },
  { key: '04', label: 'เม.ย.' },
  { key: '05', label: 'พ.ค.' },
  { key: '06', label: 'มิ.ย.' },
  { key: '07', label: 'ก.ค.' },
  { key: '08', label: 'ส.ค.' },
  { key: '09', label: 'ก.ย.' },
  { key: '10', label: 'ต.ค.' },
  { key: '11', label: 'พ.ย.' },
  { key: '12', label: 'ธ.ค.' },
];

export const AssetsScreen: React.FC<AssetsScreenProps> = ({
  initialView = 'HOLDINGS',
  initialCategoryFilter = 'ALL',
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dividendSchedules, setDividendSchedules] = useState<DividendSchedule[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | AssetType>(initialCategoryFilter);
  const [sortOption, setSortOption] = useState<SortOption>('VALUE_DESC');
  const [isSortSheetVisible, setIsSortSheetVisible] = useState<boolean>(false);

  const sortShortLabel = useMemo(() => {
    switch (sortOption) {
      case 'VALUE_DESC': return 'มูลค่า';
      case 'PL_DESC': return 'กำไร';
      case 'PL_ASC': return 'ขาดทุน';
      case 'SYMBOL_ASC': return 'A-Z';
      default: return 'มูลค่า';
    }
  }, [sortOption]);

  useEffect(() => {
    if (initialView) {
      setViewMode(initialView);
    }
  }, [initialView]);

  useEffect(() => {
    if (initialCategoryFilter) {
      setCategoryFilter(initialCategoryFilter);
    }
  }, [initialCategoryFilter]);

  // Transaction Filters
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [actionFilter, setActionFilter] = useState<'ALL' | 'BUY' | 'SELL' | 'CASH'>('ALL');
  const [activePicker, setActivePicker] = useState<'YEAR' | 'MONTH' | 'TYPE' | null>(null);

  // Modals
  const [selectedAssetForEdit, setSelectedAssetForEdit] = useState<AssetSummary | null>(null);
  const [isEditModalVisible, setIsEditModalVisible] = useState<boolean>(false);
  const [selectedTransactionForEdit, setSelectedTransactionForEdit] = useState<EnrichedTransaction | null>(null);
  const [isEditTxModalVisible, setIsEditTxModalVisible] = useState<boolean>(false);
  const [isImportModalVisible, setIsImportModalVisible] = useState<boolean>(false);
  const [exchangeRate, setExchangeRate] = useState<number>(34.00);
  const [currencyMap, setCurrencyMap] = useState<Record<string, 'THB' | 'USD'>>({});
  const { isPrivate: isPrivateMode, toggle: togglePrivateMode } = usePrivacyMode();

  const handleExportCsv = async () => {
    if (!assets || assets.length === 0) {
      Alert.alert('ไม่มีข้อมูลพอร์ต', 'ยังไม่มีรายการสินทรัพย์ในพอร์ตให้ส่งออก');
      return;
    }

    const csvData = await exportPortfolioToCsv(assets, {
      transactions,
      schedules: dividendSchedules,
    });
    const today = getLocalDateString();
    const filename = `my_dividend_portfolio_${today}.csv`;

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      Share.share({
        title: 'ส่งออกพอร์ต My Dividend',
        message: csvData,
      });
    }
  };

  // Fetch Data
  const loadData = useCallback(async (forceSync = false) => {
    try {
      // 0. Instant offline cache restore for 0ms cold-start
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

      // 1. Fetch Assets Summary
      const { data: summaryData, error: summaryError } = await supabase
        .from('view_asset_summary')
        .select('*')
        .order('symbol', { ascending: true });

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
              .order('symbol', { ascending: true });
            if (!refreshedErr && refreshedSummary) {
              loadedAssets = ((refreshedSummary as AssetSummary[]) || []).filter((a) => !a.is_archived);
            }
          }
        } catch (syncErr) {
          console.warn('AssetsScreen sync prices failed, continuing with loaded assets:', syncErr);
        }
      }

      setAssets(loadedAssets);

      const activeAssetIds = loadedAssets.map((a) => a.id).filter(Boolean);

      // 2. Fetch Transactions (all user transactions for audit ledger, including archived/sold positions)
      // and Dividend Schedules (scoped to active holdings for forward projections)
      let txDataResult: (Transaction & { assets?: any })[] = [];
      let schedDataResult: DividendSchedule[] = [];

      try {
        const [txRes, schedRes] = await Promise.all([
          supabase
            .from('transactions')
            .select('*, assets(id, symbol, asset_type, current_price, currency)')
            .order('transaction_date', { ascending: false }),
          activeAssetIds.length > 0
            ? supabase
                .from('dividend_schedules')
                .select('*')
                .in('asset_id', activeAssetIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (!txRes.error && txRes.data) {
          txDataResult = txRes.data as any[];
          setTransactions(txDataResult);
        } else if (txRes.error) {
          console.warn('Transactions join query error, retrying without join:', txRes.error);
          const fallbackTxRes = await supabase
            .from('transactions')
            .select('*')
            .order('transaction_date', { ascending: false });
          if (!fallbackTxRes.error && fallbackTxRes.data) {
            txDataResult = fallbackTxRes.data as any[];
            setTransactions(txDataResult);
          }
        }

        if (!schedRes.error && schedRes.data) {
          schedDataResult = schedRes.data as DividendSchedule[];
          setDividendSchedules(schedDataResult);
        }
      } catch (fetchErr) {
        console.warn('Error fetching transactions/schedules in AssetsScreen:', fetchErr);
      }

      // 3. Exchange Rate & Currencies
      const [rate, currencies] = await Promise.all([
        getCachedExchangeRate(),
        getAllAssetCurrencies(),
      ]);
      if (rate > 0) setExchangeRate(rate);
      setCurrencyMap(currencies);

      // Save fresh snapshot into local cache
      await savePortfolioCache({
        assets: loadedAssets,
        transactions: txDataResult,
        dividendSchedules: schedDataResult,
        exchangeRate: rate > 0 ? rate : 34.0,
      });
    } catch (err: any) {
      console.warn('AssetsScreen loadData catch:', err?.message || err);
      notifyOffline('เชื่อมต่อไม่ได้ · แสดงข้อมูลล่าสุดในเครื่อง');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const unsubscribe = portfolioEvents.subscribe(() => {
      loadData();
    });
    return unsubscribe;
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshTrigger((prev) => prev + 1);
    loadData(true);
  }, [loadData]);

  // Asset Map for quick lookup
  const assetMap = useMemo(() => {
    const map = new Map<string, AssetSummary>();
    assets.forEach((a) => map.set(a.id, a));
    return map;
  }, [assets]);

  // Return Metrics (Cumulative Dividends & Total Return)
  const returnMetrics = useMemo(
    () => calculatePortfolioReturns(assets, transactions, dividendSchedules, exchangeRate, [], currencyMap),
    [assets, transactions, dividendSchedules, exchangeRate, currencyMap]
  );

  // Enriched Transactions with Symbol & Asset Type
  const enrichedTransactions: EnrichedTransaction[] = useMemo(() => {
    return transactions.map((tx: any) => {
      const parentAsset = assetMap.get(tx.asset_id) || tx.assets;
      return {
        ...tx,
        symbol: tx.assets?.symbol || parentAsset?.symbol || 'Unknown',
        asset_type: (tx.assets?.asset_type || parentAsset?.asset_type || 'STOCKS') as AssetType,
        current_price: Number(tx.assets?.current_price) || Number(parentAsset?.current_price) || 0,
        currency: tx.assets?.currency || parentAsset?.currency,
      };
    });
  }, [transactions, assetMap]);

  // Available Years from transactions
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    transactions.forEach((tx) => {
      if (tx.transaction_date) {
        const yr = tx.transaction_date.substring(0, 4);
        if (yr) yearsSet.add(yr);
      }
    });
    const sortedYears = Array.from(yearsSet).sort((a, b) => Number(b) - Number(a));
    return ['ALL', ...sortedYears];
  }, [transactions]);

  // Filtered Holdings
  const filteredHoldings = useMemo(() => {
    let list = assets.filter((item) => {
      // Category filter
      if (categoryFilter !== 'ALL' && item.asset_type !== categoryFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        return item.symbol.toLowerCase().includes(query);
      }
      return true;
    });

    // Sorting
    list = [...list].sort((a, b) => {
      const valA = Number(a.market_value) || 0;
      const valB = Number(b.market_value) || 0;
      const plA = Number(a.unrealized_pl_percent) || 0;
      const plB = Number(b.unrealized_pl_percent) || 0;

      switch (sortOption) {
        case 'VALUE_DESC':
          return valB - valA;
        case 'PL_DESC':
          return plB - plA;
        case 'PL_ASC':
          return plA - plB;
        case 'SYMBOL_ASC':
          return a.symbol.localeCompare(b.symbol);
        default:
          return valB - valA;
      }
    });

    return list;
  }, [assets, categoryFilter, searchQuery, sortOption]);

  // Filtered Transactions
  const filteredTransactions = useMemo(() => {
    return enrichedTransactions.filter((tx) => {
      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        if (!tx.symbol.toLowerCase().includes(query)) return false;
      }

      // Category filter
      if (categoryFilter !== 'ALL' && tx.asset_type !== categoryFilter) {
        return false;
      }

      // Action / Type filter
      if (actionFilter === 'BUY' && (tx.type !== 'BUY' || tx.asset_type === 'CASH')) return false;
      if (actionFilter === 'SELL' && tx.type !== 'SELL') return false;
      if (actionFilter === 'CASH' && (tx.asset_type !== 'CASH' || tx.type === 'SELL')) return false;

      // Year filter
      if (selectedYear !== 'ALL') {
        const yr = tx.transaction_date?.substring(0, 4);
        if (yr !== selectedYear) return false;
      }

      // Month filter
      if (selectedMonth !== 'ALL') {
        const mo = tx.transaction_date?.substring(5, 7);
        if (mo !== selectedMonth) return false;
      }

      return true;
    });
  }, [enrichedTransactions, searchQuery, categoryFilter, actionFilter, selectedYear, selectedMonth]);

  // Summary stats for filtered holdings
  const holdingsStats = useMemo(() => {
    const totalVal = filteredHoldings.reduce((s, a) => s + (Number(a.market_value) || 0), 0);
    const totalCost = filteredHoldings.reduce((s, a) => s + (Number(a.total_cost) || 0), 0);
    const totalPL = totalVal - totalCost;
    const plPercent = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;
    return { totalVal, totalPL, plPercent };
  }, [filteredHoldings]);

  // Summary stats for filtered transactions
  const transactionStats = useMemo(() => {
    const totalVolume = filteredTransactions.reduce(
      (s, tx) => s + (Number(tx.shares) * Number(tx.price_per_share)),
      0
    );
    const count = filteredTransactions.length;
    return { totalVolume, count };
  }, [filteredTransactions]);

  const hasActiveTxFilter = selectedYear !== 'ALL' || selectedMonth !== 'ALL' || actionFilter !== 'ALL';

  const isUSStock = (symbol: string, assetType: AssetType, txCurrency?: 'THB' | 'USD') => {
    if (txCurrency === 'USD') return true;
    const parentAsset = assets.find((a) => a.symbol === symbol && a.asset_type === assetType);
    return parentAsset?.currency === 'USD' || (assetType === 'STOCKS' && isKnownUSSymbol(symbol));
  };

  const formatThaiDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const monthNames = [
          'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
          'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
        ];
        return `${d} ${monthNames[m] || ''} ${y + 543}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleBox}>
          <CalmText variant="display" size={32} color={colors.ink} style={{ lineHeight: 32 }}>
            สินทรัพย์{'\n'}& ธุรกรรม
          </CalmText>
        </View>

        <View style={styles.headerActionsRow}>
          <TouchableOpacity
            style={[styles.headerEyeBtn, isPrivateMode && styles.headerEyeBtnActive]}
            onPress={togglePrivateMode}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityLabel="โหมดความเป็นส่วนตัว"
          >
            <Ionicons
              name={isPrivateMode ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={isPrivateMode ? colors.accent : colors.ink}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerExportBtn}
            onPress={handleExportCsv}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <CalmText variant="mono" size={12} color={colors.ink}>
              ส่งออก
            </CalmText>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerImportBtn}
            onPress={() => setIsImportModalVisible(true)}
            activeOpacity={0.7}
          >
            <CalmText variant="mono" size={12} color={colors.accent}>
              นำเข้า CSV
            </CalmText>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Mode Segmented Control: Holdings vs Transactions */}
      <View style={styles.viewModeSwitcher}>
        <TouchableOpacity
          style={[styles.viewModeTab, viewMode === 'HOLDINGS' && styles.viewModeTabActive]}
          onPress={() => setViewMode('HOLDINGS')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="wallet-outline"
            size={16}
            color={viewMode === 'HOLDINGS' ? colors.accent : colors.ink}
          />
          <CalmText
            variant="mono"
            size={12}
            color={viewMode === 'HOLDINGS' ? colors.accent : colors.ink}
          >
            คงเหลือ ({assets.length})
          </CalmText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.viewModeTab, viewMode === 'TRANSACTIONS' && styles.viewModeTabActive]}
          onPress={() => setViewMode('TRANSACTIONS')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="receipt-outline"
            size={16}
            color={viewMode === 'TRANSACTIONS' ? colors.accent : colors.ink}
          />
          <CalmText
            variant="mono"
            size={12}
            color={viewMode === 'TRANSACTIONS' ? colors.accent : colors.ink}
          >
            ประวัติ ({transactions.length})
          </CalmText>
        </TouchableOpacity>
      </View>

      {/* Search Bar & Sort Button Row */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.ink} />
          <TextInput
            style={styles.searchInput}
            placeholder={viewMode === 'HOLDINGS' ? 'ค้นหาหุ้น กองทุน บัญชี...' : 'ค้นหาประวัติรายการตามชื่อหุ้น...'}
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="characters"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>

        {viewMode === 'HOLDINGS' && (
          <TouchableOpacity
            style={styles.sortBtn}
            onPress={() => setIsSortSheetVisible(true)}
            activeOpacity={0.7}
            accessibilityLabel={`เรียงลำดับ: ${sortShortLabel}`}
          >
            <CalmText variant="mono" size={12} color={colors.accent}>
              {sortShortLabel}
            </CalmText>
            <Ionicons name="chevron-down" size={13} color={colors.accent} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ========================================================================= */}
        {/* VIEW 1: HOLDINGS VIEW */}
        {/* ========================================================================= */}
        {viewMode === 'HOLDINGS' && (
          <>
            {/* Category Filter Pills */}
            <View style={styles.filterPillsRow}>
              {[
                { key: 'ALL', label: 'ทั้งหมด' },
                { key: 'STOCKS', label: 'หุ้น' },
                { key: 'FUNDS', label: 'กองทุน' },
                { key: 'CASH', label: 'เงินฝาก' },
              ].map((pill) => {
                const isActive = categoryFilter === pill.key;
                return (
                  <Pill
                    key={pill.key}
                    kind={isActive ? 'ink' : 'outline'}
                    size="md"
                    label={pill.label}
                    onPress={() => setCategoryFilter(pill.key as any)}
                  />
                );
              })}
            </View>

            {/* Holdings Summary Banner */}
            <Card variant="surface" style={styles.statsBanner}>
              <View style={styles.statsBannerLeft}>
                <CalmText variant="mono" size={10} color={colors.muted} style={styles.statsBannerLabel}>
                  มูลค่ารวม ({filteredHoldings.length} รายการ)
                </CalmText>
                <CalmText variant="display" size={28} color={colors.ink}>
                  {isPrivateMode
                    ? '฿••••••'
                    : `฿${holdingsStats.totalVal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </CalmText>
              </View>
              <View style={styles.statsBannerPill}>
                <CalmText
                  variant="mono"
                  size={12}
                  color={holdingsStats.totalPL >= 0 ? colors.gainOnDark : colors.lossOnDark}
                >
                  {isPrivateMode
                    ? `(${holdingsStats.totalPL >= 0 ? '+' : ''}${holdingsStats.plPercent.toFixed(1)}%)`
                    : `${holdingsStats.totalPL >= 0 ? '+' : ''}฿${holdingsStats.totalPL.toLocaleString('th-TH', { maximumFractionDigits: 0 })} (${holdingsStats.plPercent.toFixed(1)}%)`}
                </CalmText>
              </View>
            </Card>

            {/* Holdings Card List */}
            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color="#059669" />
                <Text style={styles.loadingText}>กำลังโหลดรายการสินทรัพย์...</Text>
              </View>
            ) : filteredHoldings.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="wallet-outline" size={44} color="#94A3B8" />
                <Text style={styles.emptyTitle}>ไม่พบสินทรัพย์ตรงตามที่ค้นหา</Text>
                <Text style={styles.emptySubtitle}>ลองเปลี่ยนคำค้นหา หรือแตะปุ่ม + เพื่อบันทึกสินทรัพย์ใหม่</Text>
              </View>
            ) : (
              filteredHoldings.map((item) => {
                const itemMetrics = returnMetrics.assetMetrics[item.id];
                return (
                  <AssetSparklineCard
                    key={item.id}
                    item={item}
                    exchangeRate={exchangeRate}
                    refreshTrigger={refreshTrigger}
                    cumulativeDividends={itemMetrics?.cumulativeDividends}
                    totalReturn={itemMetrics?.totalReturn}
                    totalReturnPercent={itemMetrics?.totalReturnPercent}
                    onPressEdit={(selected) => {
                      setSelectedAssetForEdit(selected);
                      setIsEditModalVisible(true);
                    }}
                  />
                );
              })
            )}
          </>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: TRANSACTION HISTORY VIEW */}
        {/* ========================================================================= */}
        {viewMode === 'TRANSACTIONS' && (
          <>
            {/* Minimal Dropdown Filters Row */}
            <View style={styles.dropdownBarRow}>
              {/* Year Dropdown Chip */}
              <TouchableOpacity
                style={[styles.dropdownChip, selectedYear !== 'ALL' && styles.dropdownChipActive]}
                onPress={() => setActivePicker('YEAR')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="calendar-outline"
                  size={14}
                  color={selectedYear !== 'ALL' ? colors.accent : colors.ink}
                />
                <CalmText
                  variant="bodyBold"
                  size={12}
                  color={selectedYear !== 'ALL' ? colors.accent : colors.ink}
                  numberOfLines={1}
                >
                  {selectedYear === 'ALL' ? 'ทุกปี' : `${selectedYear}`}
                </CalmText>
                <Ionicons
                  name="chevron-down"
                  size={12}
                  color={selectedYear !== 'ALL' ? colors.accent : colors.ink}
                />
              </TouchableOpacity>

              {/* Month Dropdown Chip */}
              <TouchableOpacity
                style={[styles.dropdownChip, selectedMonth !== 'ALL' && styles.dropdownChipActive]}
                onPress={() => setActivePicker('MONTH')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={selectedMonth !== 'ALL' ? colors.accent : colors.ink}
                />
                <CalmText
                  variant="bodyBold"
                  size={12}
                  color={selectedMonth !== 'ALL' ? colors.accent : colors.ink}
                  numberOfLines={1}
                >
                  {selectedMonth === 'ALL'
                    ? 'ทุกเดือน'
                    : MONTH_NAMES.find((m) => m.key === selectedMonth)?.label || selectedMonth}
                </CalmText>
                <Ionicons
                  name="chevron-down"
                  size={12}
                  color={selectedMonth !== 'ALL' ? colors.accent : colors.ink}
                />
              </TouchableOpacity>

              {/* Type Dropdown Chip */}
              <TouchableOpacity
                style={[styles.dropdownChip, actionFilter !== 'ALL' && styles.dropdownChipActive]}
                onPress={() => setActivePicker('TYPE')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="funnel-outline"
                  size={13}
                  color={actionFilter !== 'ALL' ? colors.accent : colors.ink}
                />
                <CalmText
                  variant="bodyBold"
                  size={12}
                  color={actionFilter !== 'ALL' ? colors.accent : colors.ink}
                  numberOfLines={1}
                >
                  {actionFilter === 'ALL'
                    ? 'ทุกประเภท'
                    : actionFilter === 'BUY'
                    ? 'ซื้อ'
                    : actionFilter === 'SELL'
                    ? 'ขาย'
                    : 'เงินฝาก'}
                </CalmText>
                <Ionicons
                  name="chevron-down"
                  size={12}
                  color={actionFilter !== 'ALL' ? colors.accent : colors.ink}
                />
              </TouchableOpacity>

              {/* Reset filter button if any active */}
              {hasActiveTxFilter && (
                <TouchableOpacity
                  style={styles.resetFilterChip}
                  onPress={() => {
                    setSelectedYear('ALL');
                    setSelectedMonth('ALL');
                    setActionFilter('ALL');
                  }}
                  activeOpacity={0.7}
                  accessibilityLabel="ล้างตัวกรอง"
                >
                  <Ionicons name="refresh-outline" size={13} color={colors.lossOnLight} />
                  <CalmText variant="mono" size={11} color={colors.lossOnLight}>
                    ล้าง
                  </CalmText>
                </TouchableOpacity>
              )}
            </View>

            {/* Transaction Stats Banner */}
            <Card variant="surface" style={styles.txStatsBanner}>
              <View style={styles.txStatsLeft}>
                <CalmText variant="mono" size={10} color={colors.muted}>
                  ยอดเงินธุรกรรมรวม ({selectedYear === 'ALL' ? 'ทุกปี' : selectedYear} / {selectedMonth === 'ALL' ? 'ทุกเดือน' : MONTH_NAMES.find(m => m.key === selectedMonth)?.label})
                </CalmText>
                <CalmText variant="display" size={28} color={colors.ink}>
                  {isPrivateMode
                    ? '฿••••••'
                    : `฿${transactionStats.totalVolume.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </CalmText>
              </View>
              <View style={styles.txCountBadge}>
                <CalmText variant="mono" size={12} color={colors.accent}>
                  {transactionStats.count} รายการ
                </CalmText>
              </View>
            </Card>

            {/* Transaction Timeline List */}
            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color={colors.accent} />
                <CalmText variant="body" size={13} color={colors.muted}>กำลังโหลดประวัติรายการ...</CalmText>
              </View>
            ) : filteredTransactions.length === 0 ? (
              <Card variant="surface" style={styles.emptyCard}>
                <Ionicons name="receipt-outline" size={44} color={colors.muted} />
                <CalmText variant="display" size={18} color={colors.ink} style={{ marginTop: 8 }}>
                  ไม่พบรายการธุรกรรมตามเงื่อนไขที่เลือก
                </CalmText>
                <CalmText variant="body" size={12} color={colors.muted} style={{ marginTop: 4, textAlign: 'center' }}>
                  ลองเลือกปีหรือเดือนอื่น หรือกดปุ่ม "ทุกปี / ทุกเดือน" เพื่อดูทั้งหมด
                </CalmText>
              </Card>
            ) : (
              filteredTransactions.map((tx) => {
                const isUS = isUSStock(tx.symbol, tx.asset_type, tx.currency);
                const rate = exchangeRate > 0 ? exchangeRate : 34.00;
                const totalTHB = Number(tx.shares) * Number(tx.price_per_share);
                const priceUSD = isUS ? Number(tx.price_per_share) / rate : 0;
                const totalUSD = isUS ? totalTHB / rate : 0;
                const isDeposit = tx.asset_type === 'CASH';
                const isSell = tx.type === 'SELL';

                return (
                  <Card key={tx.id} variant="surface" shadow="md" style={styles.txCard}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => {
                        setSelectedTransactionForEdit(tx);
                        setIsEditTxModalVisible(true);
                      }}
                    >
                      {/* Card Top: Date & Action Badge + Edit Circle */}
                      <View style={styles.txHeader}>
                        <View style={styles.txDateRow}>
                          <Ionicons name="calendar-outline" size={14} color={colors.ink} />
                          <CalmText variant="mono" size={13} color={colors.ink}>
                            {formatThaiDate(tx.transaction_date)}
                          </CalmText>
                        </View>

                        <View style={styles.txHeaderRight}>
                          <View
                            style={[
                              styles.actionBadge,
                              { backgroundColor: isSell ? colors.lossOnDark : colors.accent },
                            ]}
                          >
                            <CalmText variant="mono" size={11} color={colors.ink}>
                              {isSell
                                ? isDeposit
                                  ? 'ถอน (WITHDRAW)'
                                  : 'ขาย (SELL)'
                                : isDeposit
                                ? 'ฝาก (DEPOSIT)'
                                : 'ซื้อ (BUY)'}
                            </CalmText>
                          </View>
                          <View style={styles.editTxIconBox}>
                            <Ionicons name="pencil" size={13} color={colors.ink} />
                          </View>
                        </View>
                      </View>

                      {/* Dashed Divider */}
                      <DashedDivider color={colors.shadow} marginVertical={10} />

                      {/* Card Bottom: Symbol, Type, Detail & Value */}
                      <View style={styles.txBody}>
                        <View style={styles.txBodyLeft}>
                          <View style={styles.txSymbolRow}>
                            <CalmText variant="display" size={22} color={colors.ink}>
                              {tx.symbol}
                            </CalmText>
                            {isUS && (
                              <View style={styles.usBadge}>
                                <CalmText variant="mono" size={9} color={colors.ink}>
                                  USD $
                                </CalmText>
                              </View>
                            )}
                            <CalmText variant="mono" size={11} color={colors.muted}>
                              {tx.asset_type === 'STOCKS' ? 'หุ้น' : tx.asset_type === 'FUNDS' ? 'กองทุน' : 'เงินฝาก'}
                            </CalmText>
                          </View>
                          <CalmText variant="mono" size={12} color={colors.ink} style={{ marginTop: 2 }}>
                            {isDeposit
                              ? (isPrivateMode ? 'เงินต้น ฿••••••' : `เงินต้น ฿${Number(tx.shares).toLocaleString()}`)
                              : isPrivateMode
                              ? (tx.asset_type === 'FUNDS' ? '•••• หน่วย' : '•••• หุ้น')
                              : (tx.asset_type === 'FUNDS'
                                ? `${Number(tx.shares).toLocaleString()} หน่วย @ ฿${Number(tx.price_per_share).toFixed(4)}`
                                : `${Number(tx.shares).toLocaleString()} หุ้น @ ฿${Number(tx.price_per_share).toFixed(2)}`)}
                            {!isPrivateMode && isUS && ` ($${priceUSD.toFixed(2)})`}
                          </CalmText>
                        </View>

                        <View style={styles.txAmountContainer}>
                          <CalmText variant="mono" size={10} color={colors.muted}>
                            มูลค่ารายการ
                          </CalmText>
                          <CalmText variant="display" size={22} color={colors.ink}>
                            {isPrivateMode
                              ? '฿••••••'
                              : `฿${totalTHB.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          </CalmText>
                          {isUS && (
                            <CalmText variant="mono" size={11} color={colors.muted}>
                              {isPrivateMode ? '$••••••' : `$${totalUSD.toFixed(2)}`}
                            </CalmText>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  </Card>
                );
              })
            )}
          </>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Transaction Filter Picker Modal */}
      <Modal
        visible={activePicker !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setActivePicker(null)}
      >
        <SheetFrame
          title={
            activePicker === 'YEAR'
              ? 'เลือกปีที่ทำรายการ'
              : activePicker === 'MONTH'
              ? 'เลือกเดือนที่ทำรายการ'
              : 'เลือกประเภทธุรกรรม'
          }
          onClose={() => setActivePicker(null)}
        >
          <View style={styles.pickerModalContent}>
            {/* Picker Content: YEAR */}
            {activePicker === 'YEAR' && (
              <ScrollView style={styles.pickerScrollView} showsVerticalScrollIndicator={false}>
                {availableYears.map((yr) => {
                  const isSelected = selectedYear === yr;
                  return (
                    <TouchableOpacity
                      key={yr}
                      style={[styles.pickerItemRow, isSelected && styles.pickerItemRowSelected]}
                      onPress={() => {
                        setSelectedYear(yr);
                        setActivePicker(null);
                      }}
                      activeOpacity={0.7}
                    >
                      <CalmText
                        variant={isSelected ? 'bodyBold' : 'body'}
                        size={15}
                        color={colors.ink}
                      >
                        {yr === 'ALL' ? 'ทุกปี (ทั้งหมด)' : `${yr} (${Number(yr) + 543})`}
                      </CalmText>
                      {isSelected && (
                        <View style={styles.sortSheetCheckCircle}>
                          <Ionicons name="checkmark" size={14} color={colors.accent} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Picker Content: MONTH */}
            {activePicker === 'MONTH' && (
              <View style={styles.monthPickerContainer}>
                <TouchableOpacity
                  style={[
                    styles.monthAllBtn,
                    selectedMonth === 'ALL' && styles.monthAllBtnSelected,
                  ]}
                  onPress={() => {
                    setSelectedMonth('ALL');
                    setActivePicker(null);
                  }}
                  activeOpacity={0.7}
                >
                  <CalmText
                    variant={selectedMonth === 'ALL' ? 'bodyBold' : 'body'}
                    size={14}
                    color={colors.ink}
                  >
                    ทุกเดือน (ตลอดทั้งปี)
                  </CalmText>
                  {selectedMonth === 'ALL' && (
                    <View style={styles.sortSheetCheckCircle}>
                      <Ionicons name="checkmark" size={14} color={colors.accent} />
                    </View>
                  )}
                </TouchableOpacity>

                <View style={styles.monthGrid}>
                  {MONTH_NAMES.filter((m) => m.key !== 'ALL').map((m) => {
                    const isSelected = selectedMonth === m.key;
                    return (
                      <TouchableOpacity
                        key={m.key}
                        style={[
                          styles.monthGridItem,
                          isSelected && styles.monthGridItemSelected,
                        ]}
                        onPress={() => {
                          setSelectedMonth(m.key);
                          setActivePicker(null);
                        }}
                        activeOpacity={0.7}
                      >
                        <CalmText
                          variant="mono"
                          size={12}
                          color={isSelected ? colors.accent : colors.ink}
                        >
                          {m.label}
                        </CalmText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Picker Content: TYPE */}
            {activePicker === 'TYPE' && (
              <View style={styles.pickerTypeList}>
                {[
                  {
                    key: 'ALL',
                    label: 'ทุกประเภท (ทั้งหมด)',
                    sub: 'แสดงทุกรายการซื้อและเงินฝาก',
                    icon: 'apps-outline',
                  },
                  {
                    key: 'BUY',
                    label: 'ซื้อหุ้น / กองทุน (BUY)',
                    sub: 'รายการซื้อหุ้นไทย หุ้นสหรัฐ และกองทุนรวม',
                    icon: 'trending-up-outline',
                  },
                  {
                    key: 'SELL',
                    label: 'ขาย / ถอนเงิน (SELL / WITHDRAW)',
                    sub: 'รายการขายหุ้น กองทุน และถอนเงินฝาก',
                    icon: 'trending-down-outline',
                  },
                  {
                    key: 'CASH',
                    label: 'เงินฝากธนาคาร (DEPOSIT)',
                    sub: 'รายการฝากบัญชีออมทรัพย์และเงินฝากประจำ',
                    icon: 'wallet-outline',
                  },
                ].map((item) => {
                  const isSelected = actionFilter === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.pickerTypeRow, isSelected && styles.pickerTypeRowSelected]}
                      onPress={() => {
                        setActionFilter(item.key as any);
                        setActivePicker(null);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.pickerTypeInfo}>
                        <View style={styles.pickerTypeLabelRow}>
                          <Ionicons
                            name={item.icon as any}
                            size={16}
                            color={colors.ink}
                          />
                          <CalmText
                            variant="bodyBold"
                            size={14}
                            color={colors.ink}
                          >
                            {item.label}
                          </CalmText>
                        </View>
                        <CalmText variant="body" size={11} color={colors.muted} style={{ marginLeft: 24, marginTop: 2 }}>
                          {item.sub}
                        </CalmText>
                      </View>
                      {isSelected && (
                        <View style={styles.sortSheetCheckCircle}>
                          <Ionicons name="checkmark" size={14} color={colors.accent} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </SheetFrame>
      </Modal>

      {/* Sort Options Bottom Sheet Modal */}
      <Modal
        visible={isSortSheetVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsSortSheetVisible(false)}
      >
        <SheetFrame title="เรียงลำดับ" onClose={() => setIsSortSheetVisible(false)}>
          <View style={styles.sortSheetOptionsList}>
            {[
              { key: 'VALUE_DESC', label: 'มูลค่าสูงสุด' },
              { key: 'PL_DESC', label: 'กำไรสูงสุด' },
              { key: 'PL_ASC', label: 'ขาดทุนมากสุด' },
              { key: 'SYMBOL_ASC', label: 'A-Z' },
            ].map((opt) => {
              const isSelected = sortOption === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.sortSheetOptionItem,
                    isSelected && styles.sortSheetOptionItemSelected,
                  ]}
                  onPress={() => {
                    setSortOption(opt.key as SortOption);
                    setIsSortSheetVisible(false);
                  }}
                  activeOpacity={0.7}
                >
                  <CalmText
                    variant="bodyBold"
                    size={15}
                    color={colors.ink}
                  >
                    {opt.label}
                  </CalmText>
                  {isSelected && (
                    <View style={styles.sortSheetCheckCircle}>
                      <Ionicons name="checkmark" size={14} color={colors.accent} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </SheetFrame>
      </Modal>

      {/* Edit Asset Modal */}
      <EditAssetModal
        visible={isEditModalVisible}
        asset={selectedAssetForEdit}
        onClose={() => {
          setIsEditModalVisible(false);
          setSelectedAssetForEdit(null);
        }}
        onSuccess={loadData}
        onNavigateToTransactions={(sym) => {
          setViewMode('TRANSACTIONS');
          if (sym) {
            setSearchQuery(sym);
          }
        }}
      />

      {/* Edit Individual Transaction Modal */}
      <EditTransactionModal
        visible={isEditTxModalVisible}
        transaction={selectedTransactionForEdit}
        exchangeRate={exchangeRate}
        onClose={() => {
          setIsEditTxModalVisible(false);
          setSelectedTransactionForEdit(null);
        }}
        onSuccess={loadData}
      />

      {/* CSV Import Modal */}
      <ImportCsvModal
        visible={isImportModalVisible}
        onClose={() => setIsImportModalVisible(false)}
        onSuccess={loadData}
      />

      {/* Add Asset FAB Modal */}
      <AddAssetModal onSuccess={loadData} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 80,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: colors.bg,
    gap: 8,
  },
  headerTitleBox: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerEyeBtn: {
    width: 42,
    height: 42,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEyeBtnActive: {
    backgroundColor: colors.ink,
  },
  headerExportBtn: {
    height: 42,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerImportBtn: {
    height: 42,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.ink,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewModeSwitcher: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 999,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    padding: 4,
    gap: 4,
  },
  viewModeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  viewModeTabActive: {
    backgroundColor: colors.ink,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
    gap: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.ink,
    paddingHorizontal: 14,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.thai,
    fontSize: 14,
    color: colors.ink,
    padding: 0,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
  },
  filterPillsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  sortSheetOptionsList: {
    paddingVertical: 4,
    paddingBottom: 16,
  },
  sortSheetOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginBottom: 6,
    backgroundColor: 'transparent',
  },
  sortSheetOptionItemSelected: {
    borderColor: colors.ink,
    backgroundColor: '#EAF3EE',
  },
  sortSheetCheckCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  statsBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  statsBannerLeft: {
    flex: 1,
    gap: 4,
  },
  statsBannerLabel: {
    letterSpacing: 0.6,
  },
  statsBannerPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.ink,
  },
  loadingBox: {
    paddingVertical: 40,
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
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 10,
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
    padding: 15,
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
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  usBadge: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  usBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  stocksBadge: {
    backgroundColor: '#EFF6FF',
  },
  stocksBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563EB',
  },
  fundsBadge: {
    backgroundColor: '#F5F3FF',
  },
  fundsBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7C3AED',
  },
  cashBadge: {
    backgroundColor: '#ECFDF5',
  },
  cashBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  assetHoldingsSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
  },
  editBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  editBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  assetBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  assetBodyCol: {
    flex: 1,
  },
  colLabel: {
    fontSize: 10,
    color: '#64748B',
    marginBottom: 2,
  },
  colValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  colSubValue: {
    fontSize: 10,
    color: '#94A3B8',
  },
  marketVal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  plText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dropdownBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  dropdownChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    gap: 4,
  },
  dropdownChipActive: {
    backgroundColor: colors.ink,
  },
  resetFilterChip: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.lossOnLight,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  txStatsBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  txStatsLeft: {
    flex: 1,
    gap: 2,
  },
  txCountBadge: {
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  txCard: {
    marginBottom: 10,
    padding: 14,
  },
  txHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  txHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBadge: {
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  editTxIconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  txBodyLeft: {
    flex: 1,
    gap: 2,
  },
  txSymbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  txAmountContainer: {
    alignItems: 'flex-end',
    gap: 2,
  },
  pickerModalContent: {
    paddingBottom: 16,
  },
  pickerScrollView: {
    maxHeight: 300,
  },
  pickerItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginBottom: 6,
  },
  pickerItemRowSelected: {
    borderColor: colors.ink,
    backgroundColor: '#EAF3EE',
  },
  monthPickerContainer: {
    paddingBottom: 8,
  },
  monthAllBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginBottom: 10,
  },
  monthAllBtnSelected: {
    borderColor: colors.ink,
    backgroundColor: '#EAF3EE',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  monthGridItem: {
    width: '23%',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthGridItemSelected: {
    backgroundColor: colors.ink,
  },
  pickerTypeList: {
    gap: 8,
    paddingBottom: 8,
  },
  pickerTypeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginBottom: 6,
  },
  pickerTypeRowSelected: {
    borderColor: colors.ink,
    backgroundColor: '#EAF3EE',
  },
  pickerTypeInfo: {
    flex: 1,
  },
  pickerTypeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bottomSpacer: {
    height: 30,
  },
});
