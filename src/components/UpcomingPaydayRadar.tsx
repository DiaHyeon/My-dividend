// A compact radar ticker displaying upcoming ex-dividend dates and payout events within 30 days.
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AssetType } from '../types/database';

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
      <View style={styles.radarCard}>
        <View style={styles.radarHeaderRow}>
          <View style={styles.radarBadge}>
            <Ionicons name="notifications" size={12} color="#059669" />
            <Text style={styles.radarBadgeText}>เรดาร์เงินปันผลเร็วๆ นี้</Text>
          </View>
          <Text style={styles.radarCountText}>{upcomingList.length} รายการใน 30 วัน</Text>
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
              <TouchableOpacity
                key={item.scheduleId ? `${item.scheduleId}_${item.typeLabel}` : idx}
                style={[
                  styles.radarItemPill,
                  isPayEvent ? styles.radarItemPillPay : styles.radarItemPillXd,
                ]}
                activeOpacity={0.7}
                onPress={() => onSelectSchedule?.(item)}
              >
                {/* Top/Left details */}
                <View style={styles.radarItemLeft}>
                  <View style={[styles.radarItemDot, item.isInterest ? styles.radarDotCash : styles.radarDotStock]} />
                  <Text style={styles.radarSymbol}>{item.symbol}</Text>
                  
                  {/* Distinct Event Badges */}
                  {item.isSpecial ? (
                    <Text style={[styles.radarTypeTag, styles.radarTypeTagSpecial]}>✨ พิเศษ</Text>
                  ) : isPayEvent ? (
                    <Text style={[styles.radarTypeTag, styles.radarTypeTagPay]}>เงินเข้า</Text>
                  ) : (
                    <Text style={[styles.radarTypeTag, styles.radarTypeTagXd]}>วัน XD</Text>
                  )}
                </View>

                {/* Right details & amount */}
                <View style={styles.radarItemRight}>
                  <View style={styles.radarDaysRow}>
                    {item.isProjected === false && (
                      <Ionicons name="checkmark-circle" size={10} color="#059669" />
                    )}
                    <Text
                      style={[
                        styles.radarDaysText,
                        !isPayEvent && styles.radarDaysTextXd,
                        item.diffDays <= 0 && styles.radarDaysTextToday,
                      ]}
                    >
                      {item.dateDisplay ? `${item.dateDisplay} (${daysText})` : daysText}
                    </Text>
                  </View>

                  <View style={styles.amountAndActionRow}>
                    {item.currency === 'USD' && item.shares && item.dpu !== undefined ? (
                      <Text style={styles.radarAmount} numberOfLines={1}>
                        ${(item.shares * item.dpu * (1 - (item.taxRate || 0))).toFixed(2)} (~{formatMoney(item.amount)})
                      </Text>
                    ) : (
                      <Text style={styles.radarAmount} numberOfLines={1}>
                        {formatMoney(item.amount)}
                      </Text>
                    )}

                    {/* 1-Click Payment Confirmation Button */}
                    {canConfirmPayment && (
                      <TouchableOpacity
                        style={styles.confirmPayBtn}
                        activeOpacity={0.7}
                        onPress={(e) => {
                          e.stopPropagation();
                          onConfirmPayment?.(item);
                        }}
                      >
                        <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                        <Text style={styles.confirmPayBtnText}>เงินเข้าแล้ว</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  if (fallbackClosest) {
    return (
      <View style={styles.radarEmptyBar}>
        <Ionicons name="time-outline" size={14} color="#64748B" />
        <Text style={styles.radarEmptyText}>
          ไม่มีรายการใน 30 วันนี้ • ถัดไป: <Text style={styles.radarEmptySymbol}>{fallbackClosest.symbol}</Text> ({fallbackClosest.daysText} • {formatMoney(fallbackClosest.amount)})
        </Text>
      </View>
    );
  }

  return null;
});

const styles = StyleSheet.create({
  radarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  radarHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  radarBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  radarBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  radarCountText: {
    fontSize: 11,
    color: '#64748B',
  },
  radarScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  radarItemPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 12,
    minWidth: 155,
    minHeight: 46,
  },
  radarItemPillPay: {
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
  },
  radarItemPillXd: {
    borderColor: '#FED7AA',
    backgroundColor: '#FFFBEB',
  },
  radarItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  radarItemDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  radarDotCash: {
    backgroundColor: '#059669',
  },
  radarDotStock: {
    backgroundColor: '#2563EB',
  },
  radarSymbol: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  radarTypeTag: {
    fontSize: 10,
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  radarTypeTagPay: {
    color: '#059669',
    backgroundColor: '#DCFCE7',
    fontWeight: '700',
  },
  radarTypeTagXd: {
    color: '#B45309',
    backgroundColor: '#FEF3C7',
    fontWeight: '700',
  },
  radarTypeTagSpecial: {
    color: '#B45309',
    backgroundColor: '#FEF3C7',
    fontWeight: '700',
  },
  radarItemRight: {
    alignItems: 'flex-end',
  },
  radarDaysRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  radarDaysText: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    color: '#059669',
  },
  radarDaysTextXd: {
    color: '#D97706',
  },
  radarDaysTextToday: {
    fontWeight: '800',
    color: '#059669',
  },
  amountAndActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  confirmPayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#059669',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  confirmPayBtnText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  radarAmount: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  radarEmptyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  radarEmptyText: {
    fontSize: 11,
    color: '#64748B',
  },
  radarEmptySymbol: {
    fontWeight: '700',
    color: '#334155',
  },
});
