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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PieChart, pieDataItem } from 'react-native-gifted-charts';
import { supabase } from '../lib/supabase';
import { AssetSummary, AssetType, DividendSchedule } from '../types/database';
import { AddAssetModal } from '../components/AddAssetModal';
import { EditAssetModal } from '../components/EditAssetModal';
import { getAllAssetCurrencies, getCachedExchangeRate, isKnownUSSymbol } from '../services/currencyService';
import { getSectorsForType, getAssetSector, SectorDefinition } from '../services/sectorService';
import { THAI_SAVINGS_TAX_FREE_LIMIT } from '../services/taxService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface PortfolioProps {
  onNavigateToDashboard?: () => void;
  initialCategoryFilter?: 'ALL' | AssetType;
}

export const Portfolio: React.FC<PortfolioProps> = ({
  onNavigateToDashboard,
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

      // 1. Fetch assets summary view
      const { data: summaryData, error: summaryError } = await supabase
        .from('view_asset_summary')
        .select('*')
        .order('created_at', { ascending: false });

      if (!summaryError && summaryData) {
        setAssets(summaryData as AssetSummary[]);
      }

      // 2. Fetch dividend schedules
      const { data: divData, error: divError } = await supabase
        .from('dividend_schedules')
        .select('*')
        .order('xd_date', { ascending: true });

      if (!divError && divData) {
        setDividendSchedules(divData as DividendSchedule[]);
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
    loadData();
  };

  // Filtered assets based on active category filter tab
  const filteredAssets = useMemo(() => {
    if (activeCategoryFilter === 'ALL') return assets;
    return assets.filter((a) => a.asset_type === activeCategoryFilter);
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

  // Donut Pie Data Generation
  const pieData: pieDataItem[] = useMemo(() => {
    if (totalMarketValue <= 0) return [];

    if (activeCategoryFilter === 'ALL') {
      const items: pieDataItem[] = [];
      if (stocksTotal > 0) {
        const pct = (stocksTotal / totalMarketValue) * 100;
        items.push({
          value: stocksTotal,
          color: '#3B82F6',
          text: `${pct.toFixed(0)}%`,
          textColor: '#FFFFFF',
          focused: true,
        });
      }
      if (fundsTotal > 0) {
        const pct = (fundsTotal / totalMarketValue) * 100;
        items.push({
          value: fundsTotal,
          color: '#8B5CF6',
          text: `${pct.toFixed(0)}%`,
          textColor: '#FFFFFF',
        });
      }
      if (cashTotal > 0) {
        const pct = (cashTotal / totalMarketValue) * 100;
        items.push({
          value: cashTotal,
          color: '#10B981',
          text: `${pct.toFixed(0)}%`,
          textColor: '#FFFFFF',
        });
      }
      return items;
    }

    // Individual category breakdown by asset
    const categoryAssets = assets.filter((a) => a.asset_type === activeCategoryFilter);
    const catTotal = categoryAssets.reduce((s, a) => s + (Number(a.market_value) || 0), 0);
    if (catTotal <= 0) return [];

    const PALETTE = ['#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#F97316', '#06B6D4', '#64748B'];
    return categoryAssets.map((asset, index) => {
      const val = Number(asset.market_value) || 0;
      const pct = (val / catTotal) * 100;
      return {
        value: val,
        color: PALETTE[index % PALETTE.length],
        text: pct >= 8 ? `${pct.toFixed(0)}%` : '',
        textColor: '#FFFFFF',
      };
    });
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
          <View>
            <Text style={styles.headerTitle}>พอร์ตสินทรัพย์ (Portfolio)</Text>
            <Text style={styles.headerSubtitle}>
              สัดส่วนการลงทุนและการถือครองสินทรัพย์ ({assets.length} รายการ)
            </Text>
          </View>
        </View>

        {/* Portfolio Net Worth Summary Card */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>มูลค่ารวมทั้งพอร์ต (Total Portfolio Value)</Text>
          <Text style={styles.heroValue}>
            ฿{totalMarketValue.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>

          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatLabel}>กำไร/ขาดทุนรวม</Text>
              <Text style={[styles.heroStatValue, totalUnrealizedPL >= 0 ? styles.profitColor : styles.lossColor]}>
                {totalUnrealizedPL >= 0 ? '+' : ''}฿
                {totalUnrealizedPL.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (
                {totalUnrealizedPLPercent.toFixed(2)}%)
              </Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatLabel}>ต้นทุนรวม</Text>
              <Text style={styles.heroStatMuted}>
                ฿{totalCost.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
        </View>

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
            <Ionicons name="pie-chart" size={18} color="#2563EB" />
            <Text style={styles.chartCardTitle}>
              {activeCategoryFilter === 'ALL'
                ? 'สัดส่วนสินทรัพย์ตามหมวดหมู่ (Asset Allocation)'
                : `สัดส่วนสินทรัพย์ในหมวด ${activeCategoryFilter}`}
            </Text>
          </View>

          {totalMarketValue <= 0 ? (
            <View style={styles.emptyChartBox}>
              <Ionicons name="pie-chart-outline" size={40} color="#CBD5E1" />
              <Text style={styles.emptyChartText}>ยังไม่มีสินทรัพย์ในพอร์ต</Text>
            </View>
          ) : (
            <View style={styles.chartContainer}>
              <PieChart
                data={pieData}
                donut
                radius={SCREEN_WIDTH * 0.26}
                innerRadius={SCREEN_WIDTH * 0.16}
                innerCircleColor="#FFFFFF"
                centerLabelComponent={() => (
                  <View style={styles.centerLabelBox}>
                    <Text style={styles.centerLabelText}>
                      {activeCategoryFilter === 'ALL' ? 'ทั้งพอร์ต' : activeCategoryFilter}
                    </Text>
                    <Text style={styles.centerLabelAmount}>
                      ฿{((activeCategoryFilter === 'ALL'
                        ? totalMarketValue
                        : (activeCategoryFilter === 'STOCKS' ? stocksTotal : (activeCategoryFilter === 'FUNDS' ? fundsTotal : cashTotal))) / 1000).toFixed(0)}k
                    </Text>
                  </View>
                )}
              />

              {/* Legends Row */}
              <View style={styles.legendContainer}>
                {activeCategoryFilter === 'ALL' ? (
                  <>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#3B82F6' }]} />
                      <Text style={styles.legendLabel}>หุ้น ({totalMarketValue > 0 ? ((stocksTotal / totalMarketValue) * 100).toFixed(1) : 0}%)</Text>
                      <Text style={styles.legendVal}>฿{stocksTotal.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#8B5CF6' }]} />
                      <Text style={styles.legendLabel}>กองทุน ({totalMarketValue > 0 ? ((fundsTotal / totalMarketValue) * 100).toFixed(1) : 0}%)</Text>
                      <Text style={styles.legendVal}>฿{fundsTotal.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
                      <Text style={styles.legendLabel}>เงินฝาก ({totalMarketValue > 0 ? ((cashTotal / totalMarketValue) * 100).toFixed(1) : 0}%)</Text>
                      <Text style={styles.legendVal}>฿{cashTotal.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</Text>
                    </View>
                  </>
                ) : (
                  filteredAssets.map((asset, idx) => {
                    const PALETTE = ['#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#F97316', '#06B6D4', '#64748B'];
                    const val = Number(asset.market_value) || 0;
                    const catVal = filteredAssets.reduce((s, a) => s + (Number(a.market_value) || 0), 0);
                    const pct = catVal > 0 ? (val / catVal) * 100 : 0;
                    return (
                      <View key={asset.id} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: PALETTE[idx % PALETTE.length] }]} />
                        <Text style={styles.legendLabel}>{asset.symbol} ({pct.toFixed(1)}%)</Text>
                        <Text style={styles.legendVal}>฿{val.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</Text>
                      </View>
                    );
                  })
                )}
              </View>
            </View>
          )}

          {/* Thai Tax-Free Interest Quota Meter (if CASH is viewed or present) */}
          {(activeCategoryFilter === 'ALL' || activeCategoryFilter === 'CASH') && cashTaxSummary && (
            <View style={styles.taxQuotaBox}>
              <View style={styles.taxQuotaHeader}>
                <Ionicons name="shield-checkmark" size={15} color="#059669" />
                <Text style={styles.taxQuotaTitle}>
                  โควตาดอกเบี้ยเงินฝากปลอดภาษี 20,000 บ./ปี (กรมสรรพากร)
                </Text>
              </View>
              <View style={styles.progressBarBackground}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${cashTaxSummary.quotaUsedPercent}%`,
                      backgroundColor: cashTaxSummary.isExceeded ? '#EF4444' : '#059669',
                    },
                  ]}
                />
              </View>
              <View style={styles.taxQuotaFooter}>
                <Text style={styles.taxQuotaText}>
                  รับดอกเบี้ยสะสม: ฿{cashTaxSummary.totalGrossInterest.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
                <Text style={[styles.taxQuotaText, { fontWeight: '700', color: cashTaxSummary.isExceeded ? '#DC2626' : '#059669' }]}>
                  {cashTaxSummary.isExceeded
                    ? '⚠️ เกินเกณฑ์ (เสียภาษี 15%)'
                    : `เหลือโควตา ฿${cashTaxSummary.remainingQuota.toLocaleString('th-TH', { minimumFractionDigits: 0 })}`}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Section Header: Holdings List */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            รายการสินทรัพย์ ({filteredAssets.length})
          </Text>
          <Text style={styles.sectionHint}>แตะเพื่อดูรายละเอียดหรือแก้ไข</Text>
        </View>

        {/* Asset Cards List */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#059669" />
            <Text style={styles.loadingText}>กำลังโหลดรายการสินทรัพย์...</Text>
          </View>
        ) : filteredAssets.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="wallet-outline" size={48} color="#94A3B8" />
            <Text style={styles.emptyTitle}>ไม่มีสินทรัพย์ในหมวดนี้</Text>
            <Text style={styles.emptySubtitle}>แตะปุ่ม + ด้านล่างเพื่อเพิ่มสินทรัพย์ใหม่</Text>
          </View>
        ) : (
          filteredAssets.map((item) => {
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
                          ? `เงินต้น ฿${Number(item.market_value).toLocaleString()}`
                          : `${Number(item.net_shares).toLocaleString('th-TH', { maximumFractionDigits: 4 })} หุ้น`}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.assetValueCol}>
                    <Text style={styles.assetMarketValue}>
                      ฿{Number(item.market_value).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    <Text
                      style={[
                        styles.assetPL,
                        Number(item.unrealized_pl) >= 0 ? styles.profitColor : styles.lossColor,
                      ]}
                    >
                      {Number(item.unrealized_pl) >= 0 ? '+' : ''}
                      {Number(item.unrealized_pl).toLocaleString('th-TH', { minimumFractionDigits: 2 })} (
                      {Number(item.unrealized_pl_percent).toFixed(2)}%)
                    </Text>
                  </View>
                </View>

                <View style={styles.assetFooter}>
                  <Text style={styles.assetFooterText}>
                    {item.asset_type === 'CASH'
                      ? `อัตราดอกเบี้ย: ${(Number(item.tax_rate) > 0 ? 'หักภาษี 15%' : 'ปลอดภาษี 0%')}`
                      : isUS
                      ? `ราคาปัจจุบัน: $${currentPriceUSD.toFixed(2)} (~฿${currentPriceTHB.toFixed(2)})`
                      : `ราคาปัจจุบัน: ฿${currentPriceTHB.toFixed(2)}`}
                  </Text>
                  <Text style={styles.assetFooterText}>
                    {item.asset_type === 'CASH'
                      ? 'เงินฝากดิจิทัล/ธนาคาร'
                      : isUS
                      ? `ต้นทุนเฉลี่ย: $${costPriceUSD.toFixed(2)} (~฿${costPriceTHB.toFixed(2)})`
                      : `ต้นทุนเฉลี่ย: ฿${costPriceTHB.toFixed(2)}`}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
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
    marginBottom: 14,
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
  heroCard: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
  },
  heroLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  heroValue: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    marginVertical: 6,
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    marginTop: 6,
  },
  heroStatItem: {
    flex: 1,
  },
  heroDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#334155',
    marginHorizontal: 12,
  },
  heroStatLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 2,
  },
  heroStatValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  heroStatMuted: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E2E8F0',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  chartCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  chartContainer: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  centerLabelBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabelText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  centerLabelAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  legendContainer: {
    width: '100%',
    marginTop: 16,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  legendLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },
  legendVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
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
    borderTopColor: '#F1F5F9',
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
    color: '#059669',
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: '#E2E8F0',
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
