// คอมโพเนนต์ปฏิทินเลือกวันที่ (Calendar Picker Modal) พร้อมปุ่มลัดวันที่อัจฉริยะสำหรับเลือกวันที่เข้าซื้อและวันขึ้นเครื่องหมาย XD
import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface CalendarPickerModalProps {
  visible: boolean;
  target?: 'purchaseDate' | 'xdDate' | 'date';
  currentDate?: string; // YYYY-MM-DD
  title?: string;
  onClose: () => void;
  onSelectDate: (isoDate: string) => void;
}

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

export const CalendarPickerModal: React.FC<CalendarPickerModalProps> = ({
  visible,
  target = 'purchaseDate',
  currentDate,
  title,
  onClose,
  onSelectDate,
}) => {
  const [calendarViewDate, setCalendarViewDate] = useState<Date>(() => new Date());

  useEffect(() => {
    if (visible) {
      if (currentDate && /^\d{4}-\d{2}-\d{2}$/.test(currentDate.trim())) {
        const parsed = new Date(currentDate.trim() + 'T00:00:00');
        if (!isNaN(parsed.getTime())) {
          setCalendarViewDate(parsed);
          return;
        }
      }
      setCalendarViewDate(new Date());
    }
  }, [visible, currentDate]);

  const prevMonth = () => {
    setCalendarViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCalendarViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const presets = useMemo(() => {
    const today = new Date();
    const formatIso = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    if (target === 'purchaseDate') {
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);

      const oneWeekAgo = new Date(today);
      oneWeekAgo.setDate(today.getDate() - 7);

      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      return [
        { label: 'วันนี้', value: formatIso(today) },
        { label: 'เมื่อวาน', value: formatIso(yesterday) },
        { label: '1 สัปดาห์ก่อน', value: formatIso(oneWeekAgo) },
        { label: 'ต้นเดือนนี้', value: formatIso(startOfMonth) },
      ];
    } else {
      const plus30Days = new Date(today);
      plus30Days.setDate(today.getDate() + 30);

      const plus60Days = new Date(today);
      plus60Days.setDate(today.getDate() + 60);

      const plus90Days = new Date(today);
      plus90Days.setDate(today.getDate() + 90);

      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      return [
        { label: '+30 วัน', value: formatIso(plus30Days) },
        { label: '+60 วัน', value: formatIso(plus60Days) },
        { label: '+90 วัน', value: formatIso(plus90Days) },
        { label: 'สิ้นเดือนนี้', value: formatIso(endOfMonth) },
      ];
    }
  }, [target]);

  const gridData = useMemo(() => {
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const items: ({ day: number; iso: string } | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
      items.push(null);
    }
    for (let d = 1; d <= totalDays; d++) {
      const mStr = String(month + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      items.push({
        day: d,
        iso: `${year}-${mStr}-${dStr}`,
      });
    }
    return items;
  }, [calendarViewDate]);

  if (!visible) return null;

  const headerTitle =
    title ||
    (target === 'purchaseDate'
      ? 'เลือกวันที่เข้าซื้อ'
      : target === 'xdDate'
      ? 'เลือกวัน XD คาดการณ์'
      : 'เลือกวันที่');

  const todayIso = new Date().toISOString().split('T')[0];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="calendar" size={18} color="#059669" />
              <Text style={styles.headerTitle}>{headerTitle}</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Presets */}
          <View style={styles.presetRow}>
            {presets.map((preset) => (
              <TouchableOpacity
                key={preset.label}
                style={styles.presetPill}
                onPress={() => {
                  onSelectDate(preset.value);
                  onClose();
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.presetText}>{preset.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Month / Year Navigator */}
          <View style={styles.navRow}>
            <TouchableOpacity style={styles.navBtn} onPress={prevMonth} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={18} color="#0F172A" />
            </TouchableOpacity>
            <Text style={styles.monthYearText}>
              {THAI_MONTHS[calendarViewDate.getMonth()]} {calendarViewDate.getFullYear() + 543}
            </Text>
            <TouchableOpacity style={styles.navBtn} onPress={nextMonth} activeOpacity={0.7}>
              <Ionicons name="chevron-forward" size={18} color="#0F172A" />
            </TouchableOpacity>
          </View>

          {/* Weekday Header */}
          <View style={styles.weekRow}>
            {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((day, idx) => (
              <View key={day} style={styles.weekCol}>
                <Text
                  style={[
                    styles.weekDayText,
                    (idx === 0 || idx === 6) && styles.weekendText,
                  ]}
                >
                  {day}
                </Text>
              </View>
            ))}
          </View>

          {/* Days Grid */}
          <View style={styles.daysGrid}>
            {gridData.map((item, index) => {
              if (!item) {
                return <View key={`empty-${index}`} style={styles.dayCell} />;
              }
              const isSelected = item.iso === currentDate;
              const isToday = item.iso === todayIso;

              return (
                <TouchableOpacity
                  key={item.iso}
                  style={[
                    styles.dayCell,
                    isSelected && styles.daySelected,
                    isToday && !isSelected && styles.dayToday,
                  ]}
                  onPress={() => {
                    onSelectDate(item.iso);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.dayText,
                      isSelected && styles.dayTextSelected,
                      isToday && !isSelected && styles.dayTextToday,
                    ]}
                  >
                    {item.day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    width: '92%',
    maxWidth: 350,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  closeBtn: {
    padding: 4,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  presetPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  monthYearText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  navBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekCol: {
    flex: 1,
    alignItems: 'center',
  },
  weekDayText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  weekendText: {
    color: '#EF4444',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 1,
    borderRadius: 18,
  },
  daySelected: {
    backgroundColor: '#059669',
  },
  dayToday: {
    borderWidth: 1.5,
    borderColor: '#059669',
  },
  dayText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#0F172A',
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dayTextToday: {
    color: '#059669',
    fontWeight: '700',
  },
});
