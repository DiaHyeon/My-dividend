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
import { THAI_SAVINGS_TAX_FREE_LIMIT, detectCashFrequency } from '../services/taxService';
import { usePrivacyMode } from '../services/privacyService';
import { SheetFrame } from './ui/SheetFrame';
import { Pill } from './ui/Pill';
import { Card } from './ui/Card';
import { CalmText } from './ui/CalmText';
import { DashedDivider } from './ui/DashedDivider';
import { colors, fonts } from '../theme/tokens';

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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  if (label.includes('อื่นๆ') || label.includes('Other')) return 'อื่นๆ';
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
  const { isPrivate: isPrivateMode } = usePrivacyMode();

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
        const freq = detectCashFrequency(schedules.map((s) => s.xd_date));
        const divisor = freq === 'MONTHLY' ? 12 : freq === 'SEMI_ANNUAL' ? 2 : 1;
        const validScheds = schedules.filter((s) => Number(s.dpu) > 0);
        const latestDpu = validScheds.length > 0
          ? Number(validScheds[validScheds.length - 1].dpu)
          : (Number(asset.current_price) > 0 ? Number(asset.current_price) / divisor : 0.015 / divisor);
        assetAnnualGross = (Number(asset.net_shares) || deposit) * latestDpu * divisor;
      } else {
        // Fallback default 1.5% or asset.current_price if no schedules found
        const rate = Number(asset.current_price) > 0 ? Number(asset.current_price) : 0.015;
        assetAnnualGross = deposit * rate;
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
    isOther?: boolean;
  }

  // Option A Grouping: Keep major segments (>= 6% or top 3, max top 5), group minor into Others
  const THRESHOLD = 6.0;
  const majorGroups: SegmentGroup[] = [];
  const minorGroups: SegmentGroup[] = [];

  segmentGroups.forEach((group, idx) => {
    if (idx < 5 && (group.percentage >= THRESHOLD || idx < 3)) {
      majorGroups.push(group);
    } else {
      minorGroups.push(group);
    }
  });

  // Prepare PieChart data with white callout lines
  const pieData: SegmentPieDataItem[] = majorGroups.map((group) => {
    const isSelected = selectedSegmentId === group.definition.id;
    const roundedVal = Math.round(group.percentage * 10) / 10;
    return {
      value: Math.max(0.1, roundedVal),
      color: group.definition.color,
      segmentLabel: group.definition.label,
      segmentColor: group.definition.color,
      strokeWidth: 2,
      strokeColor: colors.ink,
      focused: isSelected,
      onPress: () => {
        setSelectedSegmentId(isSelected ? null : group.definition.id);
      },
    };
  });

  if (minorGroups.length > 0) {
    const otherMarketValue = minorGroups.reduce((s, g) => s + g.totalMarketValue, 0);
    const otherPercentage = totalMarketValue > 0 ? (otherMarketValue / totalMarketValue) * 100 : 0;
    const roundedOther = Math.round(otherPercentage * 10) / 10;
    const isOtherSelected = selectedSegmentId === 'OTHER_COMBINED';

    pieData.push({
      value: Math.max(0.1, roundedOther),
      color: colors.muted,
      segmentLabel: 'อื่นๆ',
      segmentColor: colors.muted,
      strokeWidth: 2,
      strokeColor: colors.ink,
      focused: isOtherSelected,
      isOther: true,
      onPress: () => {
        setSelectedSegmentId(isOtherSelected ? null : 'OTHER_COMBINED');
      },
    });
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <SheetFrame title={categoryLabel} onClose={onClose}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Ionicons name={categoryIcon} size={16} color={colors.ink} />
          <CalmText variant="monoRegular" size={12} color={colors.muted}>
            {categoryType === 'STOCKS'
              ? 'สัดส่วนตามกลุ่มอุตสาหกรรม (Sectors)'
              : categoryType === 'FUNDS'
              ? 'สัดส่วนตามประเภทกองทุน (Categories)'
              : 'สัดส่วนตามประเภทบัญชีเงินฝาก'}
          </CalmText>
        </View>

        <ScrollView
          style={{ maxHeight: SCREEN_HEIGHT * 0.72 }}
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Category Overview Summary Box */}
          <Card shadow="md" padding={14} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <CalmText variant="monoRegular" size={11} color={colors.muted} style={{ marginBottom: 4 }}>
                  มูลค่ารวม
                </CalmText>
                <CalmText variant="display" size={20} color={colors.ink}>
                  {isPrivateMode
                    ? '฿••••••'
                    : `฿${totalMarketValue.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </CalmText>
              </View>
              <View style={{ width: 1.5, height: 36, backgroundColor: colors.ink }} />
              <View style={{ flex: 1, alignItems: 'center' }}>
                <CalmText variant="monoRegular" size={11} color={colors.muted} style={{ marginBottom: 4 }}>
                  {categoryType === 'CASH' ? 'จำนวนบัญชี' : 'กำไร/ขาดทุน (P/L)'}
                </CalmText>
                {categoryType === 'CASH' ? (
                  <CalmText variant="display" size={20} color={colors.ink}>
                    {categoryAssets.length} บัญชี
                  </CalmText>
                ) : (
                  <Pill
                    kind={unrealizedPL >= 0 ? 'accent' : 'outline'}
                    size="md"
                    label={`${unrealizedPL >= 0 ? '▲ +' : '▼ '}${Math.abs(unrealizedPLPercent).toFixed(2)}%`}
                  />
                )}
              </View>
            </View>
          </Card>

          {/* Thai 20,000 THB Bank Interest Tax Quota Tracker Card (Only for CASH) */}
          {categoryType === 'CASH' && portfolioTaxSummary && (
            <Card shadow="md" padding={14} style={{ marginBottom: 14 }}>
              <View style={styles.taxQuotaHeader}>
                <View style={styles.taxQuotaTitleRow}>
                  <Ionicons
                    name={portfolioTaxSummary.isExceededLimit ? 'alert-circle' : 'shield-checkmark'}
                    size={18}
                    color={colors.ink}
                  />
                  <CalmText variant="bodyBold" size={13} color={colors.ink}>
                    เกณฑ์ภาษีดอกเบี้ยเงินฝาก 20,000 บาท/ปี
                  </CalmText>
                </View>
                <Pill
                  kind={portfolioTaxSummary.isExceededLimit ? 'dashed' : 'accent'}
                  size="sm"
                  label={portfolioTaxSummary.isExceededLimit ? '⚠️ เสียภาษี 15%' : '✅ ปลอดภาษี (0%)'}
                />
              </View>

              <CalmText variant="monoRegular" size={11} color={colors.muted} style={{ lineHeight: 16, marginVertical: 8 }}>
                เกณฑ์กรมสรรพากร: ดอกเบี้ยเงินฝากออมทรัพย์ทุกธนาคารรวมกันตลอดปีไม่เกิน 20,000 บาท ได้รับยกเว้นภาษี (หากเกินจะถูกหัก 15% ตั้งแต่บาทแรก)
              </CalmText>

              {/* Quota Progress Bar */}
              <View style={styles.quotaProgressContainer}>
                <View style={styles.quotaProgressLabelRow}>
                  <CalmText variant="monoRegular" size={11} color={colors.muted}>
                    ดอกเบี้ยออมทรัพย์คาดการณ์ทั้งพอร์ต:
                  </CalmText>
                  <CalmText variant="mono" size={12} color={colors.ink}>
                    {isPrivateMode
                      ? '฿•••••• / ฿20,000'
                      : `฿${portfolioTaxSummary.totalAnnualGrossInterest.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / ฿20,000`}
                  </CalmText>
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
                  <CalmText variant="monoRegular" size={11} color={colors.muted}>
                    ใช้โควตาไป {portfolioTaxSummary.quotaUsedPercent.toFixed(1)}%
                  </CalmText>
                  <CalmText
                    variant="monoRegular"
                    size={11}
                    color={portfolioTaxSummary.isExceededLimit ? colors.lossOnLight : colors.gainOnLight}
                  >
                    {portfolioTaxSummary.isExceededLimit
                      ? (isPrivateMode
                          ? 'เกินเพดาน ฿•••••• (ภาษี ฿••••••)'
                          : `เกินเพดาน ฿${(portfolioTaxSummary.totalAnnualGrossInterest - 20000).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (ภาษี ฿${portfolioTaxSummary.totalTaxAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`)
                      : (isPrivateMode
                          ? 'คงเหลือโควตาปลอดภาษีอีก ฿••••••'
                          : `คงเหลือโควตาปลอดภาษีอีก ฿${portfolioTaxSummary.remainingQuota.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}
                  </CalmText>
                </View>
              </View>

              {/* Net Annual Highlight Row */}
              <View style={styles.quotaNetBox}>
                <CalmText variant="bodyBold" size={12} color={colors.ink}>
                  ดอกเบี้ยรับสุทธิหลังหักภาษีทั้งพอร์ต:
                </CalmText>
                <CalmText variant="mono" size={13} color={colors.ink}>
                  {isPrivateMode
                    ? '฿•••••• /ปี'
                    : `฿${portfolioTaxSummary.totalAnnualNetInterest.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} /ปี`}
                </CalmText>
              </View>
            </Card>
          )}

          {/* Circular Pie Chart Card with White Callout Lines */}
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Ionicons name="pie-chart-outline" size={16} color={colors.accent} />
              <CalmText variant="bodyBold" size={13} color={colors.surface}>
                สัดส่วน Segment (Pie Chart)
              </CalmText>
            </View>

            {segmentGroups.length === 0 ? (
              <View style={styles.emptyChartBox}>
                <Ionicons name="alert-circle-outline" size={32} color={colors.muted} />
                <CalmText variant="monoRegular" size={12} color={colors.muted}>
                  ยังไม่มีสินทรัพย์ในหมวดหมู่นี้
                </CalmText>
              </View>
            ) : (
              <View style={styles.chartContainer}>
                <PieChart
                  data={pieData}
                  donut={true}
                  radius={SCREEN_WIDTH * 0.22}
                  innerRadius={SCREEN_WIDTH * 0.13}
                  innerCircleColor={colors.ink}
                  strokeWidth={2}
                  strokeColor={colors.ink}
                  extraRadius={70}
                  paddingHorizontal={44}
                  paddingVertical={16}
                  showExternalLabels={true}
                  labelLineConfig={{
                    color: colors.surface,
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
                          fill={colors.ink}
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
                      <CalmText variant="display" size={22} color={colors.surface}>
                        {segmentGroups.length}
                      </CalmText>
                      <CalmText variant="monoRegular" size={10} color={colors.accent}>
                        Segments
                      </CalmText>
                    </View>
                  )}
                />
                <CalmText variant="monoRegular" size={11} color={colors.muted} style={{ marginTop: 12 }}>
                  แตะที่ชิ้นพายหรือการ์ดด้านล่างเพื่อโฟกัส
                </CalmText>
              </View>
            )}
          </View>

          {/* Segment Breakdown & Asset Details */}
          <CalmText variant="bodyBold" size={14} color={colors.ink} style={{ marginBottom: 10 }}>
            รายละเอียดแต่ละ Segment
          </CalmText>

          {segmentGroups.map((group) => {
            const isMinor = minorGroups.some((mg) => mg.definition.id === group.definition.id);
            const isSelected =
              selectedSegmentId === group.definition.id ||
              (selectedSegmentId === 'OTHER_COMBINED' && isMinor);

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
                        { backgroundColor: isMinor ? colors.muted : group.definition.color },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <CalmText variant="bodyBold" size={13} color={colors.ink}>
                          {group.definition.label}
                        </CalmText>
                        {isMinor && (
                          <Pill kind="dashed" size="sm" label="อื่นๆ" />
                        )}
                      </View>
                      <CalmText variant="monoRegular" size={11} color={colors.muted} style={{ marginTop: 1 }}>
                        {group.definition.enLabel}
                      </CalmText>
                    </View>
                  </View>

                  <View style={styles.segmentRight}>
                    <CalmText variant="mono" size={13} color={colors.ink}>
                      {isPrivateMode
                        ? '฿••••••'
                        : `฿${group.totalMarketValue.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`}
                    </CalmText>
                    <Pill kind="ink" size="sm" label={`${group.percentage.toFixed(1)}%`} />
                  </View>
                </TouchableOpacity>

                {/* Asset Items within this Segment */}
                <View style={styles.assetsInsideList}>
                  {group.assets.map((asset, aIdx) => (
                    <React.Fragment key={asset.id}>
                      {aIdx > 0 && <DashedDivider marginVertical={2} />}
                      <TouchableOpacity
                        style={styles.assetItemRow}
                        onPress={() => {
                          onClose();
                          onEditAsset(asset);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.assetItemLeft}>
                          <CalmText variant="mono" size={13} color={colors.ink}>
                            {asset.symbol}
                          </CalmText>
                          <CalmText variant="monoRegular" size={11} color={colors.muted}>
                            {categoryType === 'CASH'
                              ? 'บัญชีเงินฝาก'
                              : isPrivateMode
                              ? (categoryType === 'FUNDS' ? '•••• หน่วย' : '•••• หุ้น')
                              : (categoryType === 'FUNDS'
                                ? `${Number(asset.net_shares).toLocaleString()} หน่วย`
                                : `${Number(asset.net_shares).toLocaleString()} หุ้น`)}
                          </CalmText>
                        </View>

                        <View style={styles.assetItemRight}>
                          <CalmText variant="mono" size={13} color={colors.ink}>
                            {isPrivateMode
                              ? '฿••••••'
                              : `฿${Number(asset.market_value).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          </CalmText>
                          <Pill
                            kind="outline"
                            size="sm"
                            label="✎ แก้ไข"
                          />
                        </View>
                      </TouchableOpacity>
                    </React.Fragment>
                  ))}
                </View>
              </View>
            );
          })}

          <View style={{ height: 24 }} />
        </ScrollView>
      </SheetFrame>
    </Modal>
  );
};

const styles = StyleSheet.create({
  chartCard: {
    backgroundColor: colors.ink,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.ink,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  chartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    width: '100%',
  },
  emptyChartBox: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 6,
  },
  centerLabelContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.ink,
    marginBottom: 8,
    overflow: 'hidden',
  },
  segmentCardSelected: {
    backgroundColor: colors.track,
  },
  segmentCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  segmentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  segmentColorBar: {
    width: 5,
    height: 34,
    borderRadius: 3,
  },
  segmentRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  assetsInsideList: {
    borderTopWidth: 1.5,
    borderTopColor: colors.ink,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  assetItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    minHeight: 44,
  },
  assetItemLeft: {
    flex: 1,
    gap: 2,
  },
  assetItemRight: {
    alignItems: 'flex-end',
    gap: 3,
  },
  taxQuotaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  taxQuotaTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  quotaProgressContainer: {
    backgroundColor: colors.track,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.ink,
    marginBottom: 8,
  },
  quotaProgressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  quotaTrack: {
    height: 8,
    backgroundColor: colors.surface,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.ink,
    overflow: 'hidden',
    marginBottom: 6,
  },
  quotaBar: {
    height: '100%',
    borderRadius: 4,
  },
  quotaBarSafe: {
    backgroundColor: colors.accent,
  },
  quotaBarExceeded: {
    backgroundColor: colors.ink,
  },
  quotaFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quotaNetBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.ink,
  },
});
