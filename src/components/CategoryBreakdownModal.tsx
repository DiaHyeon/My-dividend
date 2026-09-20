import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { G as SvgG, Rect, Text as SvgText } from 'react-native-svg';
import { PieChart, pieDataItem } from 'react-native-gifted-charts';
import { AssetSummary, AssetType, DividendSchedule } from '../types/database';
import {
  getSectorsForType,
  getAssetSector,
  SectorDefinition,
} from '../services/sectorService';
import { THAI_SAVINGS_TAX_FREE_LIMIT } from '../services/taxService';

interface CategoryBreakdownModalProps {
  visible: boolean;
  categoryType: AssetType | null;
  categoryLabel: string;
  categoryColor: string;
  categoryIcon: keyof typeof Ionicons.glyphMap;
  assets: AssetSummary[];
  dividendSchedules?: DividendSchedule[];
  onClose: () => void;
  onEditAsset: (asset: AssetSummary) => void;
}

interface SegmentGroup {
  definition: SectorDefinition;
  totalMarketValue: number;
  totalCost: number;
  percentage: number;
  assets: AssetSummary[];
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const getShortSegmentLabel = (label: string): string => {
  if (label.includes('เทคโนโลยี')) return 'เทคโนโลยี';
  if (label.includes('พลังงาน')) return 'พลังงาน';
  if (label.includes('การเงิน')) return 'การเงิน';
  if (label.includes('การแพทย์') || label.includes('สุขภาพ')) return 'การแพทย์';
  if (label.includes('จำเป็น')) return 'สินค้าจำเป็น';
  if (label.includes('ฟุ่มเฟือย')) return 'สินค้าฟุ่มเฟือย';
  if (label.includes('อุตสาหกรรม')) return 'อุตสาหกรรม';
  if (label.includes('วัสดุ')) return 'วัสดุ';
  if (label.includes('อสังหา')) return 'อสังหาฯ';
  if (label.includes('สื่อสาร')) return 'สื่อสาร';
  if (label.includes('ตราสารหนี้') || label.includes('พันธบัตร')) return 'ตราสารหนี้';
  if (label.includes('ตราสารทุน')) return 'ตราสารทุน';
  if (label.includes('ผสม')) return 'กองทุนผสม';
  if (label.includes('โภคภัณฑ์')) return 'โภคภัณฑ์';
  if (label.includes('ต่างประเทศ') || label.includes('FIF')) return 'กองทุน ตปท.';
  if (label.includes('ตลาดเงิน')) return 'ตลาดเงิน';
  if (label.includes('ดิจิทัล')) return 'เงินฝากดิจิทัล';
  if (label.includes('ประจำ')) return 'ฝากประจำ';
  if (label.includes('ออมทรัพย์')) return 'ออมทรัพย์';
  if (label.length > 12) return label.slice(0, 10) + '..';
  return label;
};

export const CategoryBreakdownModal: React.FC<CategoryBreakdownModalProps> = ({
  visible,
  categoryType,
  categoryLabel,
  categoryColor,
  categoryIcon,
  assets,
  dividendSchedules = [],
  onClose,
  onEditAsset,
}) => {
  const [segmentGroups, setSegmentGroups] = useState<SegmentGroup[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  // Compute portfolio-level cash tax metrics if categoryType === 'CASH'
  const portfolioTaxSummary = React.useMemo(() => {
    if (categoryType !== 'CASH') return null;

    const cashAssets = assets.filter((a) => a.asset_type === 'CASH');
    let totalDeposit = 0;
    let totalAnnualGrossInterest = 0;
    let totalTaxAmount = 0;

    cashAssets.forEach((asset) => {
      const deposit = Number(asset.market_value) || 0;
      totalDeposit += deposit;

      // Find schedules for this cash asset to calculate actual annual interest
      const schedules = (dividendSchedules || []).filter((s) => s.asset_id === asset.id);
      let assetAnnualGross = 0;

      if (schedules.length > 0) {
        assetAnnualGross = schedules.reduce(
          (sum, s) => sum + (Number(s.dpu) || 0) * (Number(asset.net_shares) || deposit),
          0
        );
      } else {
        // Fallback default 1.5% if no schedules found
        assetAnnualGross = deposit * 0.015;
      }

      totalAnnualGrossInterest += assetAnnualGross;
      const taxRate = asset.tax_rate !== undefined && asset.tax_rate !== null ? Number(asset.tax_rate) : 0;
      totalTaxAmount += assetAnnualGross * taxRate;
    });

    const isExceededLimit = totalAnnualGrossInterest > THAI_SAVINGS_TAX_FREE_LIMIT;
    const quotaUsedPercent = (totalAnnualGrossInterest / THAI_SAVINGS_TAX_FREE_LIMIT) * 100;
    const remainingQuota = Math.max(0, THAI_SAVINGS_TAX_FREE_LIMIT - totalAnnualGrossInterest);
    const totalAnnualNetInterest = totalAnnualGrossInterest - (isExceededLimit ? totalAnnualGrossInterest * 0.15 : totalTaxAmount);

    return {
      totalDeposit,
      totalAnnualGrossInterest,
      totalTaxAmount: isExceededLimit ? totalAnnualGrossInterest * 0.15 : totalTaxAmount,
      totalAnnualNetInterest,
      isExceededLimit,
      quotaUsedPercent,
      remainingQuota,
      accountCount: cashAssets.length,
    };
  }, [categoryType, assets, dividendSchedules]);

  useEffect(() => {
    if (!visible || !categoryType) return;

    const computeSegments = async () => {
      const categoryAssets = assets.filter((a) => a.asset_type === categoryType);
      const totalCategoryValue = categoryAssets.reduce(
        (sum, a) => sum + (Number(a.market_value) || 0),
        0
      );

      const sectorDefinitions = getSectorsForType(categoryType);
      const groupMap = new Map<string, SegmentGroup>();

      // Initialize groups with definitions
      sectorDefinitions.forEach((def) => {
        groupMap.set(def.id, {
          definition: def,
          totalMarketValue: 0,
          totalCost: 0,
          percentage: 0,
          assets: [],
        });
      });

      // Classify each asset
      for (const asset of categoryAssets) {
        const sectorId = await getAssetSector(asset.id, asset.symbol, categoryType);
        const targetGroup = groupMap.get(sectorId) || groupMap.get('Other')!;
        targetGroup.totalMarketValue += Number(asset.market_value) || 0;
        targetGroup.totalCost += Number(asset.total_cost) || 0;
        targetGroup.assets.push(asset);
      }

      // Filter only groups with assets or value > 0 and calculate %
      const activeGroups: SegmentGroup[] = [];
      groupMap.forEach((group) => {
        if (group.assets.length > 0 && group.totalMarketValue > 0) {
          group.percentage =
            totalCategoryValue > 0 ? (group.totalMarketValue / totalCategoryValue) * 100 : 0;
          activeGroups.push(group);
        }
      });

      // Sort by value descending
      activeGroups.sort((a, b) => b.totalMarketValue - a.totalMarketValue);
      setSegmentGroups(activeGroups);
      setSelectedSegmentId(null);
    };

    computeSegments();
  }, [visible, categoryType, assets]);

  if (!categoryType) return null;

  const categoryAssets = assets.filter((a) => a.asset_type === categoryType);
  const totalMarketValue = categoryAssets.reduce(
    (sum, a) => sum + (Number(a.market_value) || 0),
    0
  );
  const totalCost = categoryAssets.reduce((sum, a) => sum + (Number(a.total_cost) || 0), 0);
  const unrealizedPL = totalMarketValue - totalCost;
  const unrealizedPLPercent = totalCost > 0 ? (unrealizedPL / totalCost) * 100 : 0;

  interface SegmentPieDataItem extends pieDataItem {
    segmentLabel: string;
    segmentColor: string;
  }

  // Prepare PieChart data with white callout lines
  const pieData: SegmentPieDataItem[] = segmentGroups.map((group) => {
    const isSelected = selectedSegmentId === group.definition.id;
    const roundedVal = Math.round(group.percentage * 10) / 10;
    return {
      value: Math.max(0.1, roundedVal),
      color: group.definition.color,
      segmentLabel: group.definition.label,
      segmentColor: group.definition.color,
      strokeWidth: 2,
      strokeColor: '#0F172A',
      focused: isSelected,
      onPress: () => {
        setSelectedSegmentId(isSelected ? null : group.definition.id);
      },
    };
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.categoryIconCircle, { backgroundColor: categoryColor + '18' }]}>
                <Ionicons name={categoryIcon} size={22} color={categoryColor} />
              </View>
              <View style={styles.titleTextContainer}>
                <Text style={styles.sheetTitle}>{categoryLabel}</Text>
                <Text style={styles.sheetSubtitle}>
                  {categoryType === 'STOCKS'
                    ? 'สัดส่วนตามกลุ่มอุตสาหกรรม (Sectors)'
                    : categoryType === 'FUNDS'
                    ? 'สัดส่วนตามประเภทกองทุน (Categories)'
                    : 'สัดส่วนตามประเภทบัญชีเงินฝาก'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Category Overview Summary Box */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>มูลค่ารวม</Text>
                <Text style={styles.summaryValue}>
                  ฿{totalMarketValue.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>
                  {categoryType === 'CASH' ? 'จำนวนบัญชี' : 'กำไร/ขาดทุน (P/L)'}
                </Text>
                {categoryType === 'CASH' ? (
                  <Text style={styles.summaryValue}>{categoryAssets.length} บัญชี</Text>
                ) : (
                  <Text
                    style={[
                      styles.summaryValue,
                      unrealizedPL >= 0 ? styles.profitText : styles.lossText,
                    ]}
                  >
                    {unrealizedPL >= 0 ? '+' : ''}
                    {unrealizedPLPercent.toFixed(2)}%
                  </Text>
                )}
              </View>
            </View>

            {/* Thai 20,000 THB Bank Interest Tax Quota Tracker Card (Only for CASH) */}
            {categoryType === 'CASH' && portfolioTaxSummary && (
              <View style={styles.taxQuotaCard}>
                <View style={styles.taxQuotaHeader}>
                  <View style={styles.taxQuotaTitleRow}>
                    <Ionicons
                      name={portfolioTaxSummary.isExceededLimit ? 'alert-circle' : 'shield-checkmark'}
                      size={18}
                      color={portfolioTaxSummary.isExceededLimit ? '#D97706' : '#059669'}
                    />
                    <Text style={styles.taxQuotaTitle}>เกณฑ์ภาษีดอกเบี้ยเงินฝาก 20,000 บาท/ปี</Text>
                  </View>
                  <View
                    style={[
                      styles.taxQuotaStatusBadge,
                      portfolioTaxSummary.isExceededLimit
                        ? styles.taxQuotaStatusExceeded
                        : styles.taxQuotaStatusSafe,
                    ]}
                  >
                    <Text
                      style={[
                        styles.taxQuotaStatusText,
                        portfolioTaxSummary.isExceededLimit
                          ? styles.taxQuotaStatusTextExceeded
                          : styles.taxQuotaStatusTextSafe,
                      ]}
                    >
                      {portfolioTaxSummary.isExceededLimit ? '⚠️ เสียภาษี 15%' : '✅ ปลอดภาษี (0%)'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.taxQuotaDescription}>
                  เกณฑ์กรมสรรพากร: ดอกเบี้ยเงินฝากออมทรัพย์ทุกธนาคารรวมกันตลอดปีไม่เกิน 20,000 บาท ได้รับยกเว้นภาษี (หากเกินจะถูกหัก 15% ตั้งแต่บาทแรก)
                </Text>

                {/* Quota Progress Bar */}
                <View style={styles.quotaProgressContainer}>
                  <View style={styles.quotaProgressLabelRow}>
                    <Text style={styles.quotaProgressLabel}>ดอกเบี้ยออมทรัพย์คาดการณ์ทั้งพอร์ต:</Text>
                    <Text style={styles.quotaProgressValue}>
                      ฿{portfolioTaxSummary.totalAnnualGrossInterest.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / ฿20,000
                    </Text>
                  </View>
                  <View style={styles.quotaTrack}>
                    <View
                      style={[
                        styles.quotaBar,
                        { width: `${Math.min(100, Math.max(0, portfolioTaxSummary.quotaUsedPercent))}%` },
                        portfolioTaxSummary.isExceededLimit ? styles.quotaBarExceeded : styles.quotaBarSafe,
                      ]}
                    />
                  </View>
                  <View style={styles.quotaFooterRow}>
                    <Text style={styles.quotaPercentText}>
                      ใช้โควตาไป {portfolioTaxSummary.quotaUsedPercent.toFixed(1)}%
                    </Text>
                    <Text
                      style={[
                        styles.quotaRemainingText,
                        portfolioTaxSummary.isExceededLimit && styles.quotaRemainingTextExceeded,
                      ]}
                    >
                      {portfolioTaxSummary.isExceededLimit
                        ? `เกินเพดาน ฿${(portfolioTaxSummary.totalAnnualGrossInterest - 20000).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (ภาษี ฿${portfolioTaxSummary.totalTaxAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
                        : `คงเหลือโควตาปลอดภาษีอีก ฿${portfolioTaxSummary.remainingQuota.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </Text>
                  </View>
                </View>

                {/* Net Annual Highlight Row */}
                <View style={styles.quotaNetBox}>
                  <View style={styles.quotaNetRow}>
                    <Text style={styles.quotaNetLabel}>ดอกเบี้ยรับสุทธิหลังหักภาษีทั้งพอร์ต:</Text>
                    <Text style={styles.quotaNetValue}>
                      ฿{portfolioTaxSummary.totalAnnualNetInterest.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} /ปี
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Circular Pie Chart Card with White Callout Lines */}
            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <Ionicons name="pie-chart-outline" size={16} color="#34D399" />
                <Text style={styles.chartTitle}>สัดส่วน Segment (Pie Chart)</Text>
              </View>

              {segmentGroups.length === 0 ? (
                <View style={styles.emptyChartBox}>
                  <Ionicons name="alert-circle-outline" size={32} color="#64748B" />
                  <Text style={styles.emptyChartText}>ยังไม่มีสินทรัพย์ในหมวดหมู่นี้</Text>
                </View>
              ) : (
                <View style={styles.chartContainer}>
                  <PieChart
                    data={pieData}
                    donut={true}
                    radius={SCREEN_WIDTH * 0.22}
                    innerRadius={SCREEN_WIDTH * 0.13}
                    innerCircleColor="#0F172A"
                    strokeWidth={2}
                    strokeColor="#0F172A"
                    extraRadius={70}
                    paddingHorizontal={44}
                    paddingVertical={16}
                    showExternalLabels={true}
                    labelLineConfig={{
                      color: '#FFFFFF',
                      thickness: 1.5,
                      length: 22,
                      tailLength: 12,
                      avoidOverlappingOfLabels: true,
                      labelComponentHeight: 30,
                      labelComponentWidth: 68,
                      labelComponentMargin: 6,
                    }}
                    externalLabelComponent={(item?: any) => {
                      const shortLabel = getShortSegmentLabel(item?.segmentLabel || '');
                      const percentText = item?.value !== undefined ? `${item.value}%` : '';
                      const strokeColor = item?.segmentColor || '#38BDF8';
                      return (
                        <SvgG>
                          <Rect
                            x={0}
                            y={-30}
                            width={68}
                            height={30}
                            rx={6}
                            fill="#0F172A"
                            stroke={strokeColor}
                            strokeWidth={1.5}
                          />
                          <SvgText
                            x={34}
                            y={-17}
                            fill="#94A3B8"
                            fontSize={8.5}
                            fontWeight="600"
                            textAnchor="middle"
                          >
                            {shortLabel}
                          </SvgText>
                          <SvgText
                            x={34}
                            y={-5}
                            fill="#FFFFFF"
                            fontSize={10.5}
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            {percentText}
                          </SvgText>
                        </SvgG>
                      );
                    }}
                    centerLabelComponent={() => (
                      <View style={styles.centerLabelContainer}>
                        <Text style={styles.centerLabelCount}>{segmentGroups.length}</Text>
                        <Text style={styles.centerLabelSub}>Segments</Text>
                      </View>
                    )}
                  />
                  <Text style={styles.chartNote}>แตะที่ชิ้นพายหรือการ์ดด้านล่างเพื่อโฟกัส</Text>
                </View>
              )}
            </View>

            {/* Segment Breakdown & Asset Details */}
            <Text style={styles.sectionHeaderTitle}>รายละเอียดแต่ละ Segment</Text>

            {segmentGroups.map((group) => {
              const isSelected = selectedSegmentId === group.definition.id;

              return (
                <View
                  key={group.definition.id}
                  style={[styles.segmentCard, isSelected && styles.segmentCardSelected]}
                >
                  <TouchableOpacity
                    style={styles.segmentCardHeader}
                    onPress={() =>
                      setSelectedSegmentId(isSelected ? null : group.definition.id)
                    }
                    activeOpacity={0.7}
                  >
                    <View style={styles.segmentLeft}>
                      <View
                        style={[
                          styles.segmentColorBar,
                          { backgroundColor: group.definition.color },
                        ]}
                      />
                      <View>
                        <Text style={styles.segmentName}>{group.definition.label}</Text>
                        <Text style={styles.segmentSubName}>{group.definition.enLabel}</Text>
                      </View>
                    </View>

                    <View style={styles.segmentRight}>
                      <Text style={styles.segmentValue}>
                        ฿{group.totalMarketValue.toLocaleString('th-TH', { maximumFractionDigits: 0 })}
                      </Text>
                      <View style={styles.segmentPercentBadge}>
                        <Text style={styles.segmentPercentText}>
                          {group.percentage.toFixed(1)}%
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>

                  {/* Asset Items within this Segment */}
                  <View style={styles.assetsInsideList}>
                    {group.assets.map((asset) => (
                      <TouchableOpacity
                        key={asset.id}
                        style={styles.assetItemRow}
                        onPress={() => {
                          onClose();
                          onEditAsset(asset);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.assetItemLeft}>
                          <Text style={styles.assetItemSymbol}>{asset.symbol}</Text>
                          <Text style={styles.assetItemSub}>
                            {categoryType === 'CASH'
                              ? 'บัญชีเงินฝาก'
                              : `${Number(asset.net_shares).toLocaleString()} หุ้น`}
                          </Text>
                        </View>

                        <View style={styles.assetItemRight}>
                          <Text style={styles.assetItemValue}>
                            ฿{Number(asset.market_value).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Text>
                          <View style={styles.editMiniBadge}>
                            <Ionicons name="pencil" size={10} color="#059669" />
                            <Text style={styles.editMiniBadgeText}>แก้ไข</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              );
            })}

            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  categoryIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleTextContainer: {
    flex: 1,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  sheetSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeButton: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    height: '80%',
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  profitText: {
    color: '#059669',
  },
  lossText: {
    color: '#DC2626',
  },
  chartCard: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    alignItems: 'center',
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginBottom: 14,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  chartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    width: '100%',
  },
  emptyChartBox: {
    paddingVertical: 30,
    alignItems: 'center',
    gap: 8,
  },
  emptyChartText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  externalLabelBadge: {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    paddingHorizontal: 4,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#475569',
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
  },
  externalLabelCategoryText: {
    color: '#94A3B8',
    fontSize: 8.5,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 1,
  },
  externalLabelPercentText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
    textAlign: 'center',
  },
  centerLabelContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabelCount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  centerLabelSub: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '500',
  },
  chartNote: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 14,
  },
  sectionHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  segmentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    overflow: 'hidden',
  },
  segmentCardSelected: {
    borderColor: '#059669',
    backgroundColor: '#F0FDF4',
  },
  segmentCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  segmentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  segmentColorBar: {
    width: 6,
    height: 36,
    borderRadius: 3,
  },
  segmentName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  segmentSubName: {
    fontSize: 11,
    color: '#64748B',
  },
  segmentRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  segmentValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  segmentPercentBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  segmentPercentText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  assetsInsideList: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  assetItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  assetItemLeft: {
    flex: 1,
  },
  assetItemSymbol: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  assetItemSub: {
    fontSize: 11,
    color: '#64748B',
  },
  assetItemRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  assetItemValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  editMiniBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  editMiniBadgeText: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '600',
  },
  taxQuotaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  taxQuotaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  taxQuotaTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  taxQuotaTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  taxQuotaStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  taxQuotaStatusSafe: {
    backgroundColor: '#ECFDF5',
  },
  taxQuotaStatusExceeded: {
    backgroundColor: '#FEF3C7',
  },
  taxQuotaStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  taxQuotaStatusTextSafe: {
    color: '#059669',
  },
  taxQuotaStatusTextExceeded: {
    color: '#B45309',
  },
  taxQuotaDescription: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 12,
  },
  quotaProgressContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  quotaProgressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  quotaProgressLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  quotaProgressValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  quotaTrack: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  quotaBar: {
    height: '100%',
    borderRadius: 4,
  },
  quotaBarSafe: {
    backgroundColor: '#059669',
  },
  quotaBarExceeded: {
    backgroundColor: '#DC2626',
  },
  quotaFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quotaPercentText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  quotaRemainingText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '700',
  },
  quotaRemainingTextExceeded: {
    color: '#DC2626',
  },
  quotaNetBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  quotaNetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quotaNetLabel: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  quotaNetValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#059669',
  },
});
