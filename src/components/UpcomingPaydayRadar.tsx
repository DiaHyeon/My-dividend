// A compact radar ticker displaying upcoming ex-dividend dates and bank interest payout events within 14 days.
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
  typeLabel: string;
  dpu?: number;
  shares?: number;
  isProjected?: boolean;
  currency?: 'THB' | 'USD';
  taxRate?: number;
  isSpecial?: boolean;
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
}

export const UpcomingPaydayRadar: React.FC<UpcomingPaydayRadarProps> = React.memo(({
  upcomingList,
  fallbackClosest,
  formatMoney,
  onSelectSchedule,
}) => {
  if (upcomingList.length > 0) {
    return (
      <View style={styles.radarCard}>
        <View style={styles.radarHeaderRow}>
          <View style={styles.radarBadge}>
            <Ionicons name="notifications" size={12} color="#059669" />
            <Text style={styles.radarBadgeText}>เรดาร์เงินเข้าเร็วๆ นี้</Text>
          </View>
          <Text style={styles.radarCountText}>{upcomingList.length} รายการใน 14 วัน</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.radarScroll}>
          {upcomingList.map((item, idx) => {
            const daysText =
              item.diffDays === 0 ? 'วันนี้' : item.diffDays === 1 ? 'พรุ่งนี้' : `อีก ${item.diffDays} วัน`;
            return (
              <TouchableOpacity
                key={idx}
                style={styles.radarItemPill}
                activeOpacity={0.7}
                onPress={() => onSelectSchedule?.(item)}
              >
                <View style={styles.radarItemLeft}>
                  <View style={[styles.radarItemDot, item.isInterest ? styles.radarDotCash : styles.radarDotStock]} />
                  <Text style={styles.radarSymbol}>{item.symbol}</Text>
                  <Text style={[styles.radarTypeTag, item.isSpecial && styles.radarTypeTagSpecial]}>
                    {item.isSpecial ? '✨ พิเศษ' : item.typeLabel === 'XD' ? 'XD' : 'จ่ายเงิน'}
                  </Text>
                </View>
                <View style={styles.radarItemRight}>
                  <View style={styles.radarDaysRow}>
                    {item.isProjected === false && (
                      <Ionicons name="checkmark-circle" size={10} color="#059669" />
                    )}
                    <Text style={styles.radarDaysText}>{daysText}</Text>
                  </View>
                  {item.currency === 'USD' && item.shares && item.dpu !== undefined ? (
                    <Text style={styles.radarAmount} numberOfLines={1}>
                      ${(item.shares * item.dpu * (1 - (item.taxRate || 0))).toFixed(2)}
                    </Text>
                  ) : (
                    <Text style={styles.radarAmount} numberOfLines={1}>
                      {formatMoney(item.amount)}
                    </Text>
                  )}
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
          ไม่มีรายการใน 14 วันนี้ • ถัดไป: <Text style={styles.radarEmptySymbol}>{fallbackClosest.symbol}</Text> ({fallbackClosest.daysText} • {formatMoney(fallbackClosest.amount)})
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
    paddingVertical: 8,
    gap: 12,
    minWidth: 145,
    height: 44,
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
