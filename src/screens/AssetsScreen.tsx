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
          <Text style={styles.headerTitle}>สินทรัพย์ & ธุรกรรม</Text>
          <Text style={styles.headerSubtitle}>
            จัดการการถือครองและประวัติการซื้อขายย้อนหลัง
          </Text>
        </View>

        <View style={styles.headerActionsRow}>
          <TouchableOpacity
            style={[styles.headerActionBtnSecondary, isPrivateMode && styles.headerActionBtnActive]}
            onPress={togglePrivateMode}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons
              name={isPrivateMode ? 'eye-off-outline' : 'eye-outline'}
              size={15}
              color={isPrivateMode ? '#059669' : '#475569'}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerActionBtnSecondary}
            onPress={handleExportCsv}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="download-outline" size={15} color="#475569" />
            <Text style={styles.headerActionBtnSecondaryText}>ส่งออก</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerActionBtnPrimary}
            onPress={() => setIsImportModalVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="cloud-upload-outline" size={15} color="#FFFFFF" />
            <Text style={styles.headerActionBtnPrimaryText}>นำเข้า CSV</Text>
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
            name="wallet"
            size={16}
            color={viewMode === 'HOLDINGS' ? '#0F172A' : '#64748B'}
          />
          <Text
            style={[
              styles.viewModeTabText,
              viewMode === 'HOLDINGS' && styles.viewModeTabTextActive,
            ]}
          >
            สินทรัพย์คงเหลือ ({assets.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.viewModeTab, viewMode === 'TRANSACTIONS' && styles.viewModeTabActive]}
          onPress={() => setViewMode('TRANSACTIONS')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="receipt"
            size={16}
            color={viewMode === 'TRANSACTIONS' ? '#0F172A' : '#64748B'}
          />
          <Text
            style={[
              styles.viewModeTabText,
              viewMode === 'TRANSACTIONS' && styles.viewModeTabTextActive,
            ]}
          >
            ประวัติรายการ ({transactions.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder={viewMode === 'HOLDINGS' ? 'ค้นหาชื่อหุ้น, กองทุน หรือบัญชี...' : 'ค้นหาประวัติรายการตามชื่อหุ้น...'}
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="characters"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#059669" />}
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
                  <TouchableOpacity
                    key={pill.key}
                    style={[styles.filterPill, isActive && styles.filterPillActive]}
                    onPress={() => setCategoryFilter(pill.key as any)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                      {pill.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Sort Dropdown Selector Bar */}
            <View style={styles.sortBarRow}>
              <Text style={styles.sortBarLabel}>เรียงลำดับ:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortScroll}>
                {[
                  { key: 'VALUE_DESC', label: 'มูลค่าสูงสุด' },
                  { key: 'PL_DESC', label: 'กำไรสูงสุด' },
                  { key: 'PL_ASC', label: 'ขาดทุนมากสุด' },
                  { key: 'SYMBOL_ASC', label: 'A-Z' },
                ].map((s) => {
                  const isActive = sortOption === s.key;
                  return (
                    <TouchableOpacity
                      key={s.key}
                      style={[styles.sortPill, isActive && styles.sortPillActive]}
                      onPress={() => setSortOption(s.key as SortOption)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.sortPillText, isActive && styles.sortPillTextActive]}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Stats Summary Banner */}
            <View style={styles.statsBanner}>
              <View>
                <Text style={styles.statsBannerLabel}>มูลค่ารวมที่แสดง ({filteredHoldings.length} รายการ)</Text>
                <Text style={styles.statsBannerValue}>
                  {isPrivateMode
                    ? '฿••••••'
                    : `฿${holdingsStats.totalVal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </Text>
              </View>
              <View style={styles.statsBannerRight}>
                <Text style={styles.statsBannerLabel}>กำไร/ขาดทุน</Text>
                <Text style={[styles.statsBannerPL, holdingsStats.totalPL >= 0 ? styles.profitColor : styles.lossColor]}>
                  {isPrivateMode
                    ? `(${holdingsStats.totalPL >= 0 ? '+' : ''}${holdingsStats.plPercent.toFixed(1)}%)`
                    : `${holdingsStats.totalPL >= 0 ? '+' : ''}฿${holdingsStats.totalPL.toLocaleString('th-TH', { maximumFractionDigits: 0 })} (${holdingsStats.plPercent.toFixed(1)}%)`}
                </Text>
              </View>
            </View>

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
                  size={13}
                  color={selectedYear !== 'ALL' ? '#0F172A' : '#64748B'}
                />
                <Text
                  style={[styles.dropdownChipText, selectedYear !== 'ALL' && styles.dropdownChipTextActive]}
                  numberOfLines={1}
                >
                  {selectedYear === 'ALL' ? 'ทุกปี' : `${selectedYear}`}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={12}
                  color={selectedYear !== 'ALL' ? '#0F172A' : '#64748B'}
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
                  size={13}
                  color={selectedMonth !== 'ALL' ? '#0F172A' : '#64748B'}
                />
                <Text
                  style={[styles.dropdownChipText, selectedMonth !== 'ALL' && styles.dropdownChipTextActive]}
                  numberOfLines={1}
                >
                  {selectedMonth === 'ALL'
                    ? 'ทุกเดือน'
                    : MONTH_NAMES.find((m) => m.key === selectedMonth)?.label || selectedMonth}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={12}
                  color={selectedMonth !== 'ALL' ? '#0F172A' : '#64748B'}
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
                  size={12}
                  color={actionFilter !== 'ALL' ? '#0F172A' : '#64748B'}
                />
                <Text
                  style={[styles.dropdownChipText, actionFilter !== 'ALL' && styles.dropdownChipTextActive]}
                  numberOfLines={1}
                >
                  {actionFilter === 'ALL'
                    ? 'ทุกประเภท'
                    : actionFilter === 'BUY'
                    ? 'ซื้อหุ้น/กองทุน'
                    : actionFilter === 'SELL'
                    ? 'ขาย/ถอน'
                    : 'เงินฝาก'}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={12}
                  color={actionFilter !== 'ALL' ? '#0F172A' : '#64748B'}
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
                  <Ionicons name="refresh-outline" size={13} color="#EF4444" />
                  <Text style={styles.resetFilterText}>ล้าง</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Transaction Stats Banner */}
            <View style={styles.txStatsBanner}>
              <View>
                <Text style={styles.txStatsLabel}>
                  ยอดเงินธุรกรรมรวม ({selectedYear === 'ALL' ? 'ทุกปี' : selectedYear} / {selectedMonth === 'ALL' ? 'ทุกเดือน' : MONTH_NAMES.find(m => m.key === selectedMonth)?.label})
                </Text>
                <Text style={styles.txStatsVal}>
                  {isPrivateMode
                    ? '฿••••••'
                    : `฿${transactionStats.totalVolume.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </Text>
              </View>
              <View style={styles.txCountBadge}>
                <Ionicons name="documents-outline" size={14} color="#059669" />
                <Text style={styles.txCountText}>{transactionStats.count} รายการ</Text>
              </View>
            </View>

            {/* Transaction Timeline List */}
            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color="#059669" />
                <Text style={styles.loadingText}>กำลังโหลดประวัติรายการ...</Text>
              </View>
            ) : filteredTransactions.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="receipt-outline" size={44} color="#94A3B8" />
                <Text style={styles.emptyTitle}>ไม่พบรายการธุรกรรมตามเงื่อนไขที่เลือก</Text>
                <Text style={styles.emptySubtitle}>ลองเลือกปีหรือเดือนอื่น หรือกดปุ่ม "ทุกปี / ทุกเดือน" เพื่อดูทั้งหมด</Text>
              </View>
            ) : (
              filteredTransactions.map((tx) => {
                const isUS = isUSStock(tx.symbol, tx.asset_type, tx.currency);
                const rate = exchangeRate > 0 ? exchangeRate : 34.00;
                const totalTHB = Number(tx.shares) * Number(tx.price_per_share);
                const priceUSD = isUS ? Number(tx.price_per_share) / rate : 0;
                const totalUSD = isUS ? totalTHB / rate : 0;
                const isDeposit = tx.asset_type === 'CASH';

                return (
                  <TouchableOpacity
                    key={tx.id}
                    style={styles.txCard}
                    activeOpacity={0.7}
                    onPress={() => {
                      setSelectedTransactionForEdit(tx);
                      setIsEditTxModalVisible(true);
                    }}
                  >
                    <View style={styles.txHeader}>
                      <View style={styles.txDateRow}>
                        <Ionicons name="calendar-outline" size={14} color="#64748B" />
                        <Text style={styles.txDateText}>{formatThaiDate(tx.transaction_date)}</Text>
                      </View>

                      <View style={styles.txHeaderRight}>
                        <View
                          style={[
                            styles.actionBadge,
                            tx.type === 'SELL'
                              ? styles.sellBadge
                              : isDeposit
                              ? styles.depositBadge
                              : styles.buyBadge,
                          ]}
                        >
                          <Text
                            style={[
                              styles.actionBadgeText,
                              tx.type === 'SELL'
                                ? styles.sellBadgeText
                                : isDeposit
                                ? styles.depositBadgeText
                                : styles.buyBadgeText,
                            ]}
                          >
                            {tx.type === 'SELL'
                              ? isDeposit
                                ? 'ถอนเงิน (WITHDRAW)'
                                : 'ขาย (SELL)'
                              : isDeposit
                              ? 'ฝากเงิน (DEPOSIT)'
                              : 'ซื้อ (BUY)'}
                          </Text>
                        </View>
                        <View style={styles.editTxIconBox}>
                          <Ionicons name="pencil" size={11} color="#64748B" />
                        </View>
                      </View>
                    </View>

                    <View style={styles.txBody}>
                      <View>
                        <View style={styles.txSymbolRow}>
                          <Text style={styles.txSymbol}>{tx.symbol}</Text>
                          {isUS && (
                            <View style={styles.usBadge}>
                              <Text style={styles.usBadgeText}>USD $</Text>
                            </View>
                          )}
                          <Text style={styles.txCategoryTag}>
                            {tx.asset_type === 'STOCKS' ? 'หุ้น' : tx.asset_type === 'FUNDS' ? 'กองทุน' : 'เงินฝาก'}
                          </Text>
                        </View>
                        <Text style={styles.txDetailSub}>
                          {isDeposit
                            ? (isPrivateMode ? 'เงินต้นที่บันทึก ฿••••••' : `เงินต้นที่บันทึก ฿${Number(tx.shares).toLocaleString()}`)
                            : isPrivateMode
                            ? (tx.asset_type === 'FUNDS' ? '•••• หน่วย' : '•••• หุ้น')
                            : (tx.asset_type === 'FUNDS'
                              ? `${Number(tx.shares).toLocaleString()} หน่วย @ ฿${Number(tx.price_per_share).toFixed(4)}`
                              : `${Number(tx.shares).toLocaleString()} หุ้น @ ฿${Number(tx.price_per_share).toFixed(2)}`)}
                          {!isPrivateMode && isUS && ` ($${priceUSD.toFixed(2)})`}
                        </Text>
                      </View>

                      <View style={styles.txAmountContainer}>
                        <Text style={styles.txAmountLabel}>มูลค่ารายการ</Text>
                        <Text style={styles.txAmountVal}>
                          {isPrivateMode
                            ? '฿••••••'
                            : `฿${totalTHB.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        </Text>
                        {isUS && <Text style={styles.txAmountSub}>{isPrivateMode ? '$••••••' : `$${totalUSD.toFixed(2)}`}</Text>}
                      </View>
                    </View>
                  </TouchableOpacity>
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
        animationType="fade"
        onRequestClose={() => setActivePicker(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setActivePicker(null)}
        >
          <TouchableOpacity
            style={styles.pickerModalContainer}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <View style={styles.pickerHeader}>
              <View style={styles.pickerHeaderLeft}>
                <Ionicons
                  name={
                    activePicker === 'YEAR'
                      ? 'calendar'
                      : activePicker === 'MONTH'
                      ? 'time'
                      : 'funnel'
                  }
                  size={18}
                  color="#0F172A"
                />
                <Text style={styles.pickerTitle}>
                  {activePicker === 'YEAR'
                    ? 'เลือกปีที่ทำรายการ'
                    : activePicker === 'MONTH'
                    ? 'เลือกเดือนที่ทำรายการ'
                    : 'เลือกประเภทธุรกรรม'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setActivePicker(null)}
                style={styles.pickerCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

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
                      <Text
                        style={[styles.pickerItemText, isSelected && styles.pickerItemTextSelected]}
                      >
                        {yr === 'ALL' ? 'ทุกปี (ทั้งหมด)' : `${yr} (${Number(yr) + 543})`}
                      </Text>
                      {isSelected && (
                        <Ionicons name="checkmark-circle" size={18} color="#059669" />
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
                  <Text
                    style={[
                      styles.monthAllBtnText,
                      selectedMonth === 'ALL' && styles.monthAllBtnTextSelected,
                    ]}
                  >
                    ทุกเดือน (ตลอดทั้งปี)
                  </Text>
                  {selectedMonth === 'ALL' && (
                    <Ionicons name="checkmark-circle" size={16} color="#059669" />
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
                        <Text
                          style={[
                            styles.monthGridItemText,
                            isSelected && styles.monthGridItemTextSelected,
                          ]}
                        >
                          {m.label}
                        </Text>
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
                            color={isSelected ? '#059669' : '#64748B'}
                          />
                          <Text
                            style={[
                              styles.pickerTypeLabel,
                              isSelected && styles.pickerTypeLabelSelected,
                            ]}
                          >
                            {item.label}
                          </Text>
                        </View>
                        <Text style={styles.pickerTypeSub}>{item.sub}</Text>
                      </View>
                      {isSelected && (
                        <Ionicons name="checkmark-circle" size={20} color="#059669" />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
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
    backgroundColor: '#F8FAFC',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 80,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: '#F8FAFC',
    gap: 8,
  },
  headerTitleBox: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerActionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4338CA',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 5,
    shadowColor: '#4338CA',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  headerActionBtnPrimaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerActionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 6,
    gap: 4,
  },
  headerActionBtnActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  headerActionBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  viewModeSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 8,
    padding: 3,
  },
  viewModeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
  },
  viewModeTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  viewModeTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  viewModeTabTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    padding: 0,
  },
  filterPillsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  filterPill: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 9,
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
  sortBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sortBarLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  sortScroll: {
    gap: 6,
  },
  sortPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sortPillActive: {
    backgroundColor: '#E0E7FF',
    borderColor: '#C7D2FE',
  },
  sortPillText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  sortPillTextActive: {
    color: '#4338CA',
    fontWeight: '700',
  },
  statsBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statsBannerLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  statsBannerValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  statsBannerRight: {
    alignItems: 'flex-end',
  },
  statsBannerPL: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  profitColor: {
    color: '#10B981',
  },
  lossColor: {
    color: '#EF4444',
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
    gap: 6,
    marginBottom: 10,
  },
  dropdownChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  dropdownChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
  },
  dropdownChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    flexShrink: 1,
  },
  dropdownChipTextActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  resetFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  resetFilterText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerModalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 36,
    maxHeight: SCREEN_WIDTH * 1.35,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 12,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  pickerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  pickerCloseBtn: {
    padding: 4,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
  },
  pickerScrollView: {
    maxHeight: 280,
  },
  pickerItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  pickerItemRowSelected: {
    backgroundColor: '#ECFDF5',
  },
  pickerItemText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#334155',
  },
  pickerItemTextSelected: {
    fontWeight: '700',
    color: '#065F46',
  },
  monthPickerContainer: {
    paddingBottom: 8,
  },
  monthAllBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  monthAllBtnSelected: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  monthAllBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  monthAllBtnTextSelected: {
    color: '#065F46',
    fontWeight: '700',
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
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthGridItemSelected: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  monthGridItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  monthGridItemTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
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
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pickerTypeRowSelected: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  pickerTypeInfo: {
    flex: 1,
  },
  pickerTypeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickerTypeLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  pickerTypeLabelSelected: {
    color: '#065F46',
  },
  pickerTypeSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    marginLeft: 24,
  },
  txStatsBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  txStatsLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  txStatsVal: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  txCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  txCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  txCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  txHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 6,
  },
  txHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editTxIconBox: {
    backgroundColor: '#F1F5F9',
    width: 20,
    height: 20,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  txDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  txDateText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  actionBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  actionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  buyBadge: {
    backgroundColor: '#ECFDF5',
  },
  buyBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  sellBadge: {
    backgroundColor: '#FEF2F2',
  },
  sellBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#EF4444',
  },
  depositBadge: {
    backgroundColor: '#EFF6FF',
  },
  depositBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563EB',
  },
  txBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txSymbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  txSymbol: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  txCategoryTag: {
    fontSize: 10,
    color: '#94A3B8',
  },
  txDetailSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  txAmountContainer: {
    alignItems: 'flex-end',
  },
  txAmountLabel: {
    fontSize: 10,
    color: '#94A3B8',
  },
  txAmountVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  txAmountSub: {
    fontSize: 10,
    color: '#64748B',
  },
  bottomSpacer: {
    height: 30,
  },
});
