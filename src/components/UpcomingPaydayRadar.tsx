// A compact radar ticker displaying upcoming ex-dividend dates and payout events within 30 days.
import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AssetType } from '../types/database';
import { Card } from './ui/Card';
import { Pill } from './ui/Pill';
import { CalmText } from './ui/CalmText';
import { CapsuleButton } from './ui/CapsuleButton';
import { HardShadow } from './ui/HardShadow';
import { colors, chartColors, radii } from '../theme/tokens';

export interface UpcomingSchedule {
  scheduleId?: string;
  assetId?: string;
  symbol: string;
  assetType: AssetType;
  dateStr: string;
  diffDays: number;
  amount: number;
  isInterest: boolean;
  typeLabel: 'XD' | 'PAY';
  dpu?: number;
  shares?: number;
  isProjected?: boolean;
  currency?: 'THB' | 'USD';
  taxRate?: number;
  isSpecial?: boolean;
  isEstimatedDate?: boolean;
  dateDisplay?: string;
}

export interface ClosestSchedule {
  symbol: string;
  daysText: string;
  amount: number;
}

interface UpcomingPaydayRadarProps {
  upcomingList: UpcomingSchedule[];
  fallbackClosest: ClosestSchedule | null;
  formatMoney: (amount: number, digits?: number) => string;
  onSelectSchedule?: (item: UpcomingSchedule) => void;
  onConfirmPayment?: (item: UpcomingSchedule) => void;
}

export const UpcomingPaydayRadar: React.FC<UpcomingPaydayRadarProps> = React.memo(({
  upcomingList,
  fallbackClosest,
  formatMoney,
  onSelectSchedule,
  onConfirmPayment,
}) => {
  if (upcomingList.length > 0) {
    return (
      <View style={styles.outerContainer}>
        <Card shadow="md" padding={16}>
          <View style={styles.radarHeaderRow}>
            <View style={styles.radarBadge}>
              <Ionicons name="notifications" size={12} color={colors.ink} />
              <CalmText variant="bodyBold" size={12} color={colors.ink}>เรดาร์เงินปันผลเร็วๆ นี้</CalmText>
            </View>
            <CalmText variant="monoRegular" size={11} color={colors.muted}>{upcomingList.length} รายการใน 30 วัน</CalmText>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.radarScroll}>
            {upcomingList.map((item, idx) => {
              const daysText =
                item.diffDays === 0
                  ? 'วันนี้'
                  : item.diffDays === 1
                  ? 'พรุ่งนี้'
                  : item.diffDays < 0
                  ? `ผ่านมา ${Math.abs(item.diffDays)} วัน`
                  : `อีก ${item.diffDays} วัน`;

              const isPayEvent = item.typeLabel === 'PAY';
              const canConfirmPayment =
                isPayEvent && item.isProjected !== false && item.diffDays <= 0 && !!item.scheduleId;

              return (
                <HardShadow key={item.scheduleId ? `${item.scheduleId}_${item.typeLabel}` : idx} size="sm" radius={14}>
                  <TouchableOpacity
                    style={styles.radarItemPill}
                    activeOpacity={0.7}
                    onPress={() => onSelectSchedule?.(item)}
                  >
                    {/* Top/Left details */}
                    <View style={styles.radarItemLeft}>
                      <View style={[styles.radarItemDot, item.isInterest ? styles.radarDotCash : styles.radarDotStock]} />
                      <CalmText variant="mono" size={16} color={colors.ink}>{item.symbol}</CalmText>
                      
                      {/* Distinct Event Badges */}
                      {item.isSpecial ? (
                        <Pill kind="dashed" size="sm" label="✨ พิเศษ" />
                      ) : isPayEvent ? (
                        <Pill kind="ink" size="sm" label="เงินเข้า" />
                      ) : (
                        <Pill kind="outline" size="sm" label="วัน XD" />
                      )}
                    </View>

                    {/* Right details & amount */}
                    <View style={styles.radarItemRight}>
                      <View style={styles.radarDaysRow}>
                        {item.isProjected === false && (
                          <Ionicons name="checkmark-circle" size={12} color={colors.gainOnLight} />
                        )}
                        <CalmText
                          variant="mono"
                          size={11}
                          color={item.diffDays <= 0 ? colors.gainOnLight : !isPayEvent ? colors.muted : colors.ink}
                        >
                          {item.dateDisplay ? `${item.dateDisplay} (${daysText})` : daysText}
                        </CalmText>
                      </View>

                      <View style={styles.amountAndActionRow}>
                        {item.currency === 'USD' && item.shares && item.dpu !== undefined ? (
                          <CalmText variant="mono" size={13} color={colors.ink} numberOfLines={1}>
                            ${(item.shares * item.dpu * (1 - (item.taxRate || 0))).toFixed(2)} (~{formatMoney(item.amount)})
                          </CalmText>
                        ) : (
                          <CalmText variant="mono" size={13} color={colors.ink} numberOfLines={1}>
                            {formatMoney(item.amount)}
                          </CalmText>
                        )}

                        {/* 1-Click Payment Confirmation Button */}
                        {canConfirmPayment && (
                          <CapsuleButton
                            variant="surface"
                            icon={<Ionicons name="checkmark" size={12} color={colors.ink} />}
                            label="เงินเข้าแล้ว"
                            onPress={() => onConfirmPayment?.(item)}
                            style={styles.confirmPayBtn}
                          />
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                </HardShadow>
              );
            })}
          </ScrollView>
        </Card>
      </View>
    );
  }

  if (fallbackClosest) {
    return (
      <View style={styles.radarEmptyBar}>
        <Ionicons name="time-outline" size={14} color={colors.muted} />
        <CalmText variant="monoRegular" size={11} color={colors.muted}>
          ไม่มีรายการใน 30 วันนี้ • ถัดไป:{' '}
          <CalmText variant="mono" size={11} color={colors.ink}>{fallbackClosest.symbol}</CalmText>
          {' '}({fallbackClosest.daysText} • {formatMoney(fallbackClosest.amount)})
        </CalmText>
      </View>
    );
  }

  return null;
});

const styles = StyleSheet.create({
  outerContainer: {
    marginBottom: 16,
  },
  radarHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  radarBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.ink,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  radarScroll: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 4,
    paddingBottom: 8,
    paddingRight: 8,
  },
  radarItemPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
    minWidth: 165,
    minHeight: 52,
  },
  radarItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  radarItemDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  radarDotCash: {
    backgroundColor: chartColors.cash,
  },
  radarDotStock: {
    backgroundColor: chartColors.stocks,
  },
  radarItemRight: {
    alignItems: 'flex-end',
  },
  radarDaysRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  amountAndActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  confirmPayBtn: {
    minHeight: 26,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  radarEmptyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
});
