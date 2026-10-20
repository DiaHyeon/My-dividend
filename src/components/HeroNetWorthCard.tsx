// A zero-jitter hero card displaying total portfolio net worth, unrealized return, dual dividend yields (Current & YoC), and privacy masking.
import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './ui/Card';
import { CalmText } from './ui/CalmText';
import { Pill } from './ui/Pill';
import { DashedDivider } from './ui/DashedDivider';
import { colors, trend } from '../theme/tokens';

interface HeroNetWorthCardProps {
  totalMarketValue: number;
  totalCost: number;
  totalUnrealizedPL: number;
  totalUnrealizedPLPercent: number;
  totalDividendsReceived?: number;
  totalReturn?: number;
  totalReturnPercent?: number;
  projectedAnnualNetDividend: number;
  portfolioCurrentYield: number;
  portfolioYoC: number;
  monthlyAvgInflow: number;
  inflowFilter: 'ALL' | 'DIVIDENDS' | 'INTEREST';
  isPrivateMode: boolean;
  onTogglePrivateMode: () => void;
  priorYearAnnualNetDividend?: number;
  onOpenAnnualComparison?: () => void;
  formatMoney: (amount: number, digits?: number) => string;
}

export const HeroNetWorthCard: React.FC<HeroNetWorthCardProps> = React.memo(({
  totalMarketValue,
  totalCost,
  totalUnrealizedPL,
  totalUnrealizedPLPercent,
  totalDividendsReceived = 0,
  totalReturn,
  totalReturnPercent,
  projectedAnnualNetDividend,
  portfolioCurrentYield,
  portfolioYoC,
  monthlyAvgInflow,
  inflowFilter,
  isPrivateMode,
  onTogglePrivateMode,
  priorYearAnnualNetDividend,
  onOpenAnnualComparison,
  formatMoney,
}) => {
  const effectiveTotalReturn = totalReturn !== undefined ? totalReturn : (totalUnrealizedPL + totalDividendsReceived);
  const effectiveTotalReturnPercent = totalReturnPercent !== undefined
    ? totalReturnPercent
    : (totalCost > 0 ? (effectiveTotalReturn / totalCost) * 100 : 0);

  const hasPriorYearData = priorYearAnnualNetDividend !== undefined && priorYearAnnualNetDividend > 0;
  const yoyPercent = hasPriorYearData
    ? ((projectedAnnualNetDividend - priorYearAnnualNetDividend) / priorYearAnnualNetDividend) * 100
    : 0;
  const isPositiveGrowth = yoyPercent >= 0;

  // P/L Trend & Pill formatting
  const plTrend = trend(totalUnrealizedPL, true);
  const plKind = totalUnrealizedPL < 0 ? 'lossDark' : 'accent';
  const plSign = totalUnrealizedPL > 0 ? '+' : '';
  const plLabel = totalUnrealizedPL === 0
    ? `${totalUnrealizedPLPercent.toFixed(2)}%`
    : `${plTrend.glyph} ${plSign}${totalUnrealizedPLPercent.toFixed(2)}%`;

  // Secondary stats trends
  const plStatTrend = trend(totalUnrealizedPL, true);
  const plStatSign = totalUnrealizedPL > 0 ? '+' : '';
  const retTrend = trend(effectiveTotalReturn, true);
  const retSign = effectiveTotalReturn > 0 ? '+' : '';

  return (
    <Card variant="dark" shadow="lg" padding={18}>
      {/* Top Row: Label + Frameless Eye Button on left, P/L Badge on right */}
      <View style={styles.heroTopRow}>
        <View style={styles.heroLabelContainer}>
          <CalmText variant="mono" size={11} color={colors.surface}>
            มูลค่าพอร์ตรวม (Total Net Worth)
          </CalmText>
          <TouchableOpacity
            style={styles.heroEyeBtn}
            onPress={onTogglePrivateMode}
            activeOpacity={0.6}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons
              name={isPrivateMode ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={isPrivateMode ? colors.accent : colors.surface}
            />
          </TouchableOpacity>
        </View>

        <Pill size="md" kind={plKind} label={plLabel} />
      </View>

      {/* Value Row: Total Market Value */}
      <View style={styles.heroValueRow}>
        <CalmText
          variant="display"
          size={36}
          color={colors.surface}
          numberOfLines={1}
          adjustsFontSizeToFit={true}
          minimumFontScale={0.7}
        >
          {formatMoney(totalMarketValue)}
        </CalmText>
      </View>

      {/* Annual Net Inflow Highlight with Dual Yield Badges */}
      <View style={styles.dividendHighlightBox}>
        <View style={styles.dividendHighlightTop}>
          <View style={styles.dividendHeaderCol}>
            <View style={styles.dividendHeaderLabelRow}>
              <Ionicons name="cash-outline" size={13} color={colors.accent} />
              <CalmText variant="monoRegular" size={10} color={colors.projected} numberOfLines={1}>
                {inflowFilter === 'ALL'
                  ? 'กระแสเงินสดรับคาดการณ์/ปี'
                  : inflowFilter === 'DIVIDENDS'
                  ? 'เงินปันผลสุทธิคาดการณ์/ปี'
                  : 'ดอกเบี้ยเงินฝากสุทธิคาดการณ์/ปี'}
              </CalmText>
            </View>
            <CalmText
              variant="display"
              size={24}
              color={colors.accent}
              numberOfLines={1}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.75}
              style={{ marginTop: 2 }}
            >
              {formatMoney(projectedAnnualNetDividend)}
            </CalmText>
          </View>
          {onOpenAnnualComparison && (
            <View style={styles.dividendHeaderPillWrapper}>
              <Pill
                kind="outlineDark"
                size="sm"
                onPress={onOpenAnnualComparison}
                label={hasPriorYearData ? `${isPositiveGrowth ? '▲ +' : '▼ '}${yoyPercent.toFixed(1)}% YoY` : '✦ ปีแรก'}
              />
            </View>
          )}
        </View>

        {/* Dual Yield & Monthly Avg Subrow */}
        <View style={styles.dualYieldRow}>
          <View style={styles.dualYieldItem}>
            <CalmText variant="monoRegular" size={10} color={colors.projected} numberOfLines={1}>
              เฉลี่ยต่อเดือน
            </CalmText>
            <CalmText
              variant="mono"
              size={11}
              color={colors.surface}
              numberOfLines={1}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.75}
              style={{ marginTop: 1 }}
            >
              {isPrivateMode ? '฿••••••' : `~${formatMoney(monthlyAvgInflow, 0)}/ด.`}
            </CalmText>
          </View>
          <View style={styles.dualYieldDivider} />
          <View style={styles.dualYieldItem}>
            <CalmText variant="monoRegular" size={10} color={colors.projected} numberOfLines={1}>
              Current Yield
            </CalmText>
            <CalmText variant="mono" size={11} color={colors.accent} numberOfLines={1} style={{ marginTop: 1 }}>
              {portfolioCurrentYield.toFixed(2)}%
            </CalmText>
          </View>
          <View style={styles.dualYieldDivider} />
          <View style={styles.dualYieldItem}>
            <CalmText variant="monoRegular" size={10} color={colors.projected} numberOfLines={1}>
              Yield on Cost
            </CalmText>
            <CalmText variant="mono" size={11} color={colors.accent} numberOfLines={1} style={{ marginTop: 1 }}>
              {portfolioYoC.toFixed(2)}% 🚀
            </CalmText>
          </View>
        </View>
      </View>

      {/* Horizontal dashed divider */}
      <View style={{ marginVertical: 12 }}>
        <DashedDivider color={colors.accent} />
      </View>

      {/* Secondary stats row: 3 balanced minimal columns */}
      <View style={styles.heroBottomRow}>
        <View style={styles.heroStatItem}>
          <CalmText variant="monoRegular" size={10} color={colors.projected} numberOfLines={1}>
            ต้นทุนรวม
          </CalmText>
          <CalmText
            variant="mono"
            size={12}
            color={colors.surface}
            numberOfLines={1}
            adjustsFontSizeToFit={true}
            minimumFontScale={0.75}
            style={{ marginTop: 2 }}
          >
            {formatMoney(totalCost)}
          </CalmText>
        </View>

        <View style={styles.heroDivider} />

        <View style={styles.heroStatItem}>
          <CalmText variant="monoRegular" size={10} color={colors.projected} numberOfLines={1}>
            P/L
          </CalmText>
          <CalmText
            variant="mono"
            size={12}
            color={plStatTrend.color}
            numberOfLines={1}
            adjustsFontSizeToFit={true}
            minimumFontScale={0.75}
            style={{ marginTop: 2 }}
          >
            {totalUnrealizedPL === 0 ? '' : plStatTrend.glyph + ' '}
            {plStatSign}{formatMoney(totalUnrealizedPL)}
          </CalmText>
          <CalmText variant="monoRegular" size={10} color={plStatTrend.color} numberOfLines={1} style={{ marginTop: 1 }}>
            {plStatSign}{totalUnrealizedPLPercent.toFixed(1)}%
          </CalmText>
        </View>

        <View style={styles.heroDivider} />

        <View style={styles.heroStatItem}>
          <View style={styles.statLabelWithIcon}>
            <CalmText variant="monoRegular" size={10} color={colors.projected} numberOfLines={1}>
              ผลตอบแทนรวม
            </CalmText>
            <Ionicons name="sparkles" size={9} color={colors.accent} />
          </View>
          <CalmText
            variant="mono"
            size={12}
            color={retTrend.color}
            numberOfLines={1}
            adjustsFontSizeToFit={true}
            minimumFontScale={0.75}
            style={{ marginTop: 2 }}
          >
            {effectiveTotalReturn === 0 ? '' : retTrend.glyph + ' '}
            {retSign}{formatMoney(effectiveTotalReturn)}
          </CalmText>
          <CalmText variant="monoRegular" size={10} color={retTrend.color} numberOfLines={1} style={{ marginTop: 1 }}>
            ({retSign}{effectiveTotalReturnPercent.toFixed(1)}%)
          </CalmText>
        </View>
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  heroLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroEyeBtn: {
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroValueRow: {
    minHeight: 34,
    justifyContent: 'center',
    marginBottom: 8,
  },
  dividendHighlightBox: {
    backgroundColor: 'transparent',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: colors.shadow,
  },
  dividendHighlightTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  dividendHeaderCol: {
    flex: 1,
    justifyContent: 'center',
  },
  dividendHeaderLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dividendHeaderPillWrapper: {
    flexShrink: 0,
    alignSelf: 'center',
  },
  dualYieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: colors.shadow,
    minHeight: 38,
  },
  dualYieldItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dualYieldDivider: {
    width: 1,
    height: 18,
    backgroundColor: colors.shadow,
  },
  heroBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroStatItem: {
    flex: 1,
  },
  heroDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.shadow,
    marginHorizontal: 8,
    marginTop: 2,
  },
  statLabelWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
});
