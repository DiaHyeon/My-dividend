// A clean bottom sheet modal comparing annual dividend income between the current and prior year, highlighting special dividends to explain payout fluctuations.
import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface PriorYearDividendItem {
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
  isSpecial?: boolean;
}

interface AnnualComparisonSheetProps {
  visible: boolean;
  onClose: () => void;
  currentYear: number;
  currentYearTotal: number;
  priorYearTotal: number;
  priorYearItems: PriorYearDividendItem[];
  formatMoney: (amount: number, digits?: number) => string;
}

export const AnnualComparisonSheet: React.FC<AnnualComparisonSheetProps> = ({
  visible,
  onClose,
  currentYear,
  currentYearTotal,
  priorYearTotal,
  priorYearItems,
  formatMoney,
}) => {
  const priorYear = currentYear - 1;
  const diff = currentYearTotal - priorYearTotal;
  const hasPriorYearData = priorYearTotal > 0;
  const yoyPercent = hasPriorYearData ? (diff / priorYearTotal) * 100 : 0;
  const isPositiveGrowth = yoyPercent >= 0;

  // Group or sort prior year items by netAmount descending
  const sortedItems = [...priorYearItems].sort((a, b) => b.netAmount - a.netAmount);
  const specialCount = sortedItems.filter((i) => i.isSpecial).length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={styles.sheetContainer}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Sheet Handle */}
          <View style={styles.handleBar} />

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <Ionicons name="stats-chart" size={18} color="#059669" />
              </View>
              <View>
                <Text style={styles.headerTitle}>เปรียบเทียบกระแสเงินสดรายปี</Text>
                <Text style={styles.headerSubtitle}>
                  ปี {priorYear} เทียบกับ ปี {currentYear}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {/* Comparison Metric Cards */}
            <View style={styles.comparisonCardsRow}>
              {/* Prior Year Card */}
              <View style={styles.yearCard}>
                <Text style={styles.yearCardLabel}>ยอดรับจริงปี {priorYear}</Text>
                <Text style={styles.yearCardValue}>{formatMoney(priorYearTotal)}</Text>
                {specialCount > 0 && (
                  <View style={styles.specialBadgeRow}>
                    <Text style={styles.specialBadgeText}>มีปันผลพิเศษ {specialCount} รายการ</Text>
                  </View>
                )}
              </View>

              {/* Current Year Card */}
              <View style={[styles.yearCard, styles.currentYearCard]}>
                <Text style={[styles.yearCardLabel, styles.currentYearLabel]}>คาดการณ์ปี {currentYear}</Text>
                <Text style={[styles.yearCardValue, styles.currentYearValue]}>{formatMoney(currentYearTotal)}</Text>
                <View style={styles.yoyGrowthBadge}>
                  {hasPriorYearData ? (
                    <Text style={[styles.yoyGrowthText, isPositiveGrowth ? styles.growthPositive : styles.growthNegative]}>
                      {isPositiveGrowth ? '▲ +' : '▼ '}
                      {Math.abs(yoyPercent).toFixed(1)}% YoY
                    </Text>
                  ) : (
                    <Text style={styles.yoyFirstYearText}>✦ ปีแรกที่มีข้อมูล</Text>
                  )}
                </View>
              </View>
            </View>

            {/* Explanation Note for Growth / Fluctuations */}
            <View style={styles.insightNoteCard}>
              <Ionicons name="information-circle-outline" size={16} color="#0284C7" />
              <Text style={styles.insightNoteText}>
                {hasPriorYearData
                  ? specialCount > 0
                    ? `ปี ${priorYear} มีการจ่ายเงินปันผลพิเศษ ${specialCount} รายการ ซึ่งรอบพิเศษเหล่านี้จะไม่ถูกนำมาคูณซ้ำเพื่อคาดการณ์ในปี ${currentYear} เพื่อป้องกันตัวเลข Forecast บวมเกินจริง`
                    : `ยอดเงินปันผลปี ${currentYear} เปลี่ยนแปลง ${diff >= 0 ? '+' : ''}${formatMoney(diff)} เมื่อเทียบกับยอดรับจริงของปี ${priorYear}`
                  : `กำลังเริ่มต้นบันทึกข้อมูลปันผลในปี ${currentYear} เมื่อผ่านรอบสิ้นปี ระบบจะนำยอดไปเปรียบเทียบอัตราการเติบโต (YoY) อัตโนมัติ`}
              </Text>
            </View>

            {/* Prior Year Breakdown List */}
            <View style={styles.breakdownSection}>
              <View style={styles.breakdownHeaderRow}>
                <Text style={styles.breakdownSectionTitle}>รายการปันผลที่ได้รับในปี {priorYear}</Text>
                <Text style={styles.breakdownCountText}>{sortedItems.length} รายการ</Text>
              </View>

              {sortedItems.length === 0 ? (
                <View style={styles.emptyItemsBox}>
                  <Ionicons name="receipt-outline" size={28} color="#94A3B8" />
                  <Text style={styles.emptyItemsText}>ไม่มีประวัติเงินปันผลหรือดอกเบี้ยของปี {priorYear}</Text>
                </View>
              ) : (
                sortedItems.map((item, idx) => (
                  <View key={item.scheduleId || idx} style={styles.itemRow}>
                    <View style={styles.itemLeft}>
                      <View style={[styles.itemDot, item.isInterest ? styles.itemDotCash : styles.itemDotStock]} />
                      <View>
                        <View style={styles.itemSymbolRow}>
                          <Text style={styles.itemSymbol}>{item.symbol}</Text>
                          {item.isSpecial ? (
                            <View style={styles.specialPill}>
                              <Text style={styles.specialPillText}>✨ ปันผลพิเศษ</Text>
                            </View>
                          ) : item.isInterest ? (
                            <View style={styles.interestPill}>
                              <Text style={styles.interestPillText}>ดอกเบี้ย</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.itemSubtext}>
                          {item.paymentDate ? `รับเงิน: ${item.paymentDate}` : `XD: ${item.xdDate}`} • {item.shares.toLocaleString()} {item.isInterest ? 'บาท' : 'หุ้น'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.itemRight}>
                      <Text style={styles.itemAmount}>{formatMoney(item.netAmount)}</Text>
                      <Text style={styles.itemDpuText}>
                        {item.currency === 'USD' ? '$' : '฿'}
                        {item.dpu.toFixed(4)}/หุ้น
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    maxHeight: '82%',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  handleBar: {
    width: 38,
    height: 4,
    backgroundColor: '#CBD5E1',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  closeBtn: {
    padding: 2,
  },
  scrollArea: {
    marginBottom: 8,
  },
  comparisonCardsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  yearCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
  },
  currentYearCard: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  yearCardLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 4,
  },
  currentYearLabel: {
    color: '#047857',
  },
  yearCardValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
    lineHeight: 22,
  },
  currentYearValue: {
    color: '#065F46',
  },
  specialBadgeRow: {
    marginTop: 6,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  specialBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#B45309',
  },
  yoyGrowthBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  yoyGrowthText: {
    fontSize: 11,
    fontWeight: '800',
  },
  growthPositive: {
    color: '#059669',
  },
  growthNegative: {
    color: '#DC2626',
  },
  yoyFirstYearText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  insightNoteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 12,
    padding: 10,
    marginBottom: 16,
  },
  insightNoteText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: '#0369A1',
  },
  breakdownSection: {
    marginTop: 4,
  },
  breakdownHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  breakdownSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  breakdownCountText: {
    fontSize: 11,
    color: '#64748B',
  },
  emptyItemsBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    gap: 6,
  },
  emptyItemsText: {
    fontSize: 12,
    color: '#64748B',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  itemDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  itemDotCash: {
    backgroundColor: '#10B981',
  },
  itemDotStock: {
    backgroundColor: '#3B82F6',
  },
  itemSymbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemSymbol: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  specialPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  specialPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#B45309',
  },
  interestPill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  interestPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#059669',
  },
  itemSubtext: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  itemRight: {
    alignItems: 'flex-end',
  },
  itemAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  itemDpuText: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
});
