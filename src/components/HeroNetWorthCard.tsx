// A zero-jitter hero card displaying total portfolio net worth, unrealized return, dual dividend yields (Current & YoC), and privacy masking.
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
  formatMoney,
}) => {
  const effectiveTotalReturn = totalReturn !== undefined ? totalReturn : (totalUnrealizedPL + totalDividendsReceived);
  const effectiveTotalReturnPercent = totalReturnPercent !== undefined
    ? totalReturnPercent
    : (totalCost > 0 ? (effectiveTotalReturn / totalCost) * 100 : 0);

  return (
    <View style={styles.heroCard}>
      {/* Top Row: Label + Frameless Eye Button on left, P/L Badge on right */}
      <View style={styles.heroTopRow}>
        <View style={styles.heroLabelContainer}>
          <Text style={styles.heroLabel}>มูลค่าพอร์ตรวม (Total Net Worth)</Text>
          <TouchableOpacity
            style={styles.heroEyeBtn}
            onPress={onTogglePrivateMode}
            activeOpacity={0.6}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons
              name={isPrivateMode ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={isPrivateMode ? '#34D399' : '#94A3B8'}
            />
          </TouchableOpacity>
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

      {/* Value Row: Total Market Value */}
      <View style={styles.heroValueRow}>
        <Text style={styles.heroValue} numberOfLines={1}>
          {formatMoney(totalMarketValue)}
        </Text>
      </View>

      {/* Annual Net Inflow Highlight with Dual Yield Badges */}
      <View style={styles.dividendHighlightBox}>
        <View style={styles.dividendHighlightTop}>
          <View style={styles.dividendIconBadge}>
            <Ionicons name="cash-outline" size={22} color="#059669" />
          </View>
          <View style={styles.dividendTextContainer}>
            <Text style={styles.dividendHighlightLabel}>
              {inflowFilter === 'ALL'
                ? 'กระแสเงินสดรับสุทธิคาดการณ์ทั้งปี'
                : inflowFilter === 'DIVIDENDS'
                ? 'เงินปันผลสุทธิคาดการณ์ทั้งปี'
                : 'ดอกเบี้ยเงินฝากสุทธิคาดการณ์ทั้งปี'}
            </Text>
            <Text style={styles.dividendHighlightValue}>
              {formatMoney(projectedAnnualNetDividend)}
            </Text>
          </View>
        </View>

        {/* Dual Yield & Monthly Avg Subrow */}
        <View style={styles.dualYieldRow}>
          <View style={styles.dualYieldItem}>
            <Text style={styles.dualYieldSublabel} numberOfLines={1}>เฉลี่ยต่อเดือน</Text>
            <Text style={styles.dualYieldSubval} numberOfLines={1}>
              {isPrivateMode ? '฿••••••' : `~${formatMoney(monthlyAvgInflow, 0)}/ด.`}
            </Text>
          </View>
          <View style={styles.dualYieldDivider} />
          <View style={styles.dualYieldItem}>
            <Text style={styles.dualYieldSublabel} numberOfLines={1}>Current Yield</Text>
            <Text style={styles.dualYieldSubval} numberOfLines={1}>{portfolioCurrentYield.toFixed(2)}%</Text>
          </View>
          <View style={styles.dualYieldDivider} />
          <View style={styles.dualYieldItem}>
            <Text style={styles.dualYieldSublabel} numberOfLines={1}>Yield on Cost</Text>
            <Text style={styles.dualYieldYoCVal} numberOfLines={1}>{portfolioYoC.toFixed(2)}% 🚀</Text>
          </View>
        </View>
      </View>

      {/* Secondary stats row: 3 balanced minimal columns */}
      <View style={styles.heroBottomRow}>
        <View style={styles.heroStatItem}>
          <Text style={styles.heroStatLabel}>ต้นทุนรวม</Text>
          <Text style={styles.heroStatValue} numberOfLines={1}>
            {formatMoney(totalCost)}
          </Text>
        </View>

        <View style={styles.heroDivider} />

        <View style={styles.heroStatItem}>
          <Text style={styles.heroStatLabel}>ส่วนต่างราคา (P/L)</Text>
          <Text
            style={[styles.heroStatValue, totalUnrealizedPL >= 0 ? styles.profitTextLight : styles.lossTextLight]}
            numberOfLines={1}
          >
            {totalUnrealizedPL >= 0 ? '+' : ''}
            {formatMoney(totalUnrealizedPL)}
          </Text>
          <Text style={[styles.heroStatSubPercent, totalUnrealizedPL >= 0 ? styles.profitSubText : styles.lossSubText]}>
            {totalUnrealizedPL >= 0 ? '+' : ''}{totalUnrealizedPLPercent.toFixed(1)}%
          </Text>
        </View>

        <View style={styles.heroDivider} />

        <View style={styles.heroStatItem}>
          <View style={styles.statLabelWithIcon}>
            <Text style={styles.heroStatLabel}>ผลตอบแทนรวม</Text>
            <Ionicons name="sparkles" size={10} color="#F59E0B" />
          </View>
          <Text
            style={[styles.heroStatValue, effectiveTotalReturn >= 0 ? styles.totalReturnPositive : styles.lossTextLight]}
            numberOfLines={1}
          >
            {effectiveTotalReturn >= 0 ? '+' : ''}
            {formatMoney(effectiveTotalReturn)}
          </Text>
          <Text style={[styles.heroStatSubPercent, effectiveTotalReturn >= 0 ? styles.totalReturnSubPositive : styles.lossSubText]}>
            ({effectiveTotalReturn >= 0 ? '+' : ''}{effectiveTotalReturnPercent.toFixed(1)}%)
          </Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
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
    alignItems: 'center',
    marginBottom: 6,
  },
  heroLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroLabel: {
    fontSize: 13,
    lineHeight: 18,
    color: '#94A3B8',
    fontWeight: '500',
  },
  heroEyeBtn: {
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroValueRow: {
    minHeight: 40,
    justifyContent: 'center',
  },
  heroValue: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  plBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
    height: 28,
  },
  plBadgeProfit: {
    backgroundColor: '#DCFCE7',
  },
  plBadgeLoss: {
    backgroundColor: '#FEE2E2',
  },
  plBadgeText: {
    fontSize: 13,
    lineHeight: 18,
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
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  dividendHighlightTop: {
    flexDirection: 'row',
    alignItems: 'center',
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
    lineHeight: 16,
    color: '#94A3B8',
    fontWeight: '500',
  },
  dividendHighlightValue: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
    color: '#34D399',
    marginTop: 2,
    minHeight: 26,
  },
  dualYieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#334155',
    minHeight: 52,
  },
  dualYieldItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dualYieldDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#334155',
  },
  dualYieldSublabel: {
    fontSize: 10,
    lineHeight: 14,
    color: '#94A3B8',
  },
  dualYieldSubval: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 2,
    minHeight: 16,
  },
  dualYieldYoCVal: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    color: '#34D399',
    marginTop: 2,
    minHeight: 16,
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
    marginHorizontal: 10,
  },
  heroStatLabel: {
    fontSize: 11,
    lineHeight: 15,
    color: '#94A3B8',
  },
  heroStatValue: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 2,
  },
  statLabelWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  heroStatSubPercent: {
    fontSize: 11,
    lineHeight: 14,
    marginTop: 2,
    fontWeight: '600',
  },
  profitSubText: {
    color: '#34D399',
  },
  lossSubText: {
    color: '#F87171',
  },
  totalReturnPositive: {
    color: '#FBBF24',
  },
  totalReturnSubPositive: {
    color: '#FBBF24',
  },
});
