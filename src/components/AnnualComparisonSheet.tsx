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
import { SheetFrame } from './ui/SheetFrame';
import { Card } from './ui/Card';
import { Pill } from './ui/Pill';
import { CalmText } from './ui/CalmText';
import { DashedDivider } from './ui/DashedDivider';
import { colors, fonts } from '../theme/tokens';

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
      <SheetFrame title="เปรียบเทียบผลตอบแทน" onClose={onClose}>
        <CalmText variant="monoRegular" size={12} color={colors.muted} style={{ marginBottom: 14 }}>
          ปี {priorYear} เทียบกับ ปี {currentYear}
        </CalmText>

        <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
          {/* Comparison Metric Cards */}
          <View style={styles.comparisonCardsRow}>
            {/* Prior Year Card */}
            <Card shadow="md" padding={12} style={{ flex: 1 }}>
              <CalmText variant="monoRegular" size={11} color={colors.muted} style={{ marginBottom: 4 }}>
                ยอดรับจริงปี {priorYear}
              </CalmText>
              <CalmText variant="display" size={20} color={colors.ink}>
                {formatMoney(priorYearTotal)}
              </CalmText>
              {specialCount > 0 && (
                <Pill
                  kind="dashed"
                  size="sm"
                  label={`ปันผลพิเศษ ${specialCount} รายการ`}
                  style={{ marginTop: 6, alignSelf: 'flex-start' }}
                />
              )}
            </Card>

            {/* Current Year Card */}
            <Card shadow="md" padding={12} style={{ flex: 1 }}>
              <CalmText variant="monoRegular" size={11} color={colors.muted} style={{ marginBottom: 4 }}>
                คาดการณ์ปี {currentYear}
              </CalmText>
              <CalmText variant="display" size={20} color={colors.ink}>
                {formatMoney(currentYearTotal)}
              </CalmText>
              <View style={{ marginTop: 6, alignSelf: 'flex-start' }}>
                {hasPriorYearData ? (
                  <Pill
                    kind={isPositiveGrowth ? 'accent' : 'outline'}
                    size="sm"
                    label={`${isPositiveGrowth ? '▲ +' : '▼ '}${Math.abs(yoyPercent).toFixed(1)}% YoY`}
                  />
                ) : (
                  <Pill kind="outline" size="sm" label="ปีแรกที่มีข้อมูล" />
                )}
              </View>
            </Card>
          </View>

          {/* Explanation Note for Growth / Fluctuations */}
          <View style={styles.insightNoteCard}>
            <Ionicons name="information-circle-outline" size={18} color={colors.ink} />
            <CalmText variant="monoRegular" size={11} color={colors.ink} style={{ flex: 1, lineHeight: 16 }}>
              {hasPriorYearData
                ? specialCount > 0
                  ? `ปี ${priorYear} มีการจ่ายเงินปันผลพิเศษ ${specialCount} รายการ ซึ่งรอบพิเศษเหล่านี้จะไม่ถูกนำมาคูณซ้ำเพื่อคาดการณ์ในปี ${currentYear} เพื่อป้องกันตัวเลข Forecast บวมเกินจริง`
                  : `ยอดเงินปันผลปี ${currentYear} เปลี่ยนแปลง ${diff >= 0 ? '+' : ''}${formatMoney(diff)} เมื่อเทียบกับยอดรับจริงของปี ${priorYear}`
                : `กำลังเริ่มต้นบันทึกข้อมูลปันผลในปี ${currentYear} เมื่อผ่านรอบสิ้นปี ระบบจะนำยอดไปเปรียบเทียบอัตราการเติบโต (YoY) อัตโนมัติ`}
            </CalmText>
          </View>

          {/* Prior Year Breakdown List */}
          <View style={styles.breakdownSection}>
            <View style={styles.breakdownHeaderRow}>
              <CalmText variant="bodyBold" size={14} color={colors.ink}>
                รายการปันผลที่ได้รับในปี {priorYear}
              </CalmText>
              <Pill kind="outline" size="sm" label={`${sortedItems.length} รายการ`} />
            </View>

            {sortedItems.length === 0 ? (
              <View style={styles.emptyItemsBox}>
                <Ionicons name="receipt-outline" size={28} color={colors.muted} />
                <CalmText variant="monoRegular" size={12} color={colors.muted}>
                  ไม่มีประวัติเงินปันผลหรือดอกเบี้ยของปี {priorYear}
                </CalmText>
              </View>
            ) : (
              sortedItems.map((item, idx) => (
                <View key={item.scheduleId || idx}>
                  {idx > 0 && <DashedDivider marginVertical={4} />}
                  <View style={styles.itemRow}>
                    <View style={styles.itemLeft}>
                      <View>
                        <View style={styles.itemSymbolRow}>
                          <CalmText variant="mono" size={13} color={colors.ink}>
                            {item.symbol}
                          </CalmText>
                          {item.isSpecial ? (
                            <Pill kind="dashed" size="sm" label="ปันผลพิเศษ" />
                          ) : item.isInterest ? (
                            <Pill kind="outline" size="sm" label="ดอกเบี้ย" />
                          ) : (
                            <Pill kind="accent" size="sm" label="ปันผล" />
                          )}
                        </View>
                        <CalmText variant="monoRegular" size={11} color={colors.muted} style={{ marginTop: 2 }}>
                          {item.paymentDate ? `รับเงิน: ${item.paymentDate}` : `XD: ${item.xdDate}`} • {item.shares.toLocaleString()} {item.isInterest ? 'บาท' : 'หุ้น'}
                        </CalmText>
                      </View>
                    </View>
                    <View style={styles.itemRight}>
                      <CalmText variant="mono" size={13} color={colors.ink}>
                        {formatMoney(item.netAmount)}
                      </CalmText>
                      <CalmText variant="monoRegular" size={10} color={colors.muted} style={{ marginTop: 1 }}>
                        {item.currency === 'USD' ? '$' : '฿'}
                        {item.dpu.toFixed(4)}/หุ้น
                      </CalmText>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </SheetFrame>
    </Modal>
  );
};

const styles = StyleSheet.create({
  scrollArea: {
    maxHeight: 460,
  },
  comparisonCardsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  insightNoteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.track,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
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
  emptyItemsBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    gap: 6,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    minHeight: 44,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  itemSymbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemRight: {
    alignItems: 'flex-end',
  },
});
