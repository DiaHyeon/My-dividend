// A minimal bottom sheet modal to adjust dividend per share (DPU), net received payout, and verify cashflow records.
import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { portfolioEvents } from '../services/eventService';

const SPECIAL_SCHEDULES_STORAGE_KEY = '@my_dividend_special_schedules';

export async function getSpecialScheduleIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(SPECIAL_SCHEDULES_STORAGE_KEY);
    if (!raw) return new Set<string>();
    const list = JSON.parse(raw);
    return new Set<string>(Array.isArray(list) ? list : []);
  } catch {
    return new Set<string>();
  }
}

export async function setSpecialScheduleId(scheduleId: string, isSpecial: boolean): Promise<void> {
  try {
    const current = await getSpecialScheduleIds();
    if (isSpecial) {
      current.add(scheduleId);
    } else {
      current.delete(scheduleId);
    }
    await AsyncStorage.setItem(SPECIAL_SCHEDULES_STORAGE_KEY, JSON.stringify(Array.from(current)));
  } catch {
    // ignore
  }
}

export interface AdjustDividendTarget {
  scheduleId: string;
  assetId: string;
  symbol: string;
  dpu: number;
  shares: number;
  netAmount: number;
  xdDate: string;
  isInterest: boolean;
  currency?: 'THB' | 'USD';
  taxRate: number;
  isProjected: boolean;
  exchangeRate?: number;
}

interface AdjustDividendModalProps {
  visible: boolean;
  target: AdjustDividendTarget | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const AdjustDividendModal: React.FC<AdjustDividendModalProps> = ({
  visible,
  target,
  onClose,
  onSuccess,
}) => {
  const [dpuStr, setDpuStr] = useState<string>('');
  const [netAmountStr, setNetAmountStr] = useState<string>('');
  const [applyToFuture, setApplyToFuture] = useState<boolean>(false);
  const [isReceived, setIsReceived] = useState<boolean>(false);
  const [isSpecialDividend, setIsSpecialDividend] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const isUSD = target?.currency === 'USD';
  const effectiveRate = isUSD ? (target?.exchangeRate || 34.0) : 1.0;
  const taxFactor = 1 - (target?.taxRate || 0);

  useEffect(() => {
    if (!target || !visible) return;
    setDpuStr(target.dpu ? target.dpu.toString() : '0');

    // Calculate native net amount: in USD ($) for US stocks, or THB (฿) for Thai stocks/funds/cash
    let initialNet = 0;
    if (isUSD) {
      initialNet = target.shares * target.dpu * taxFactor;
    } else if (target.isInterest) {
      initialNet = target.shares * target.dpu * taxFactor;
    } else {
      initialNet = target.netAmount;
    }
    setNetAmountStr(initialNet > 0 ? initialNet.toFixed(2) : '0');
    setIsReceived(!target.isProjected);
    setApplyToFuture(false);

    getSpecialScheduleIds().then((ids) => {
      setIsSpecialDividend(ids.has(target.scheduleId));
    });
  }, [target, visible, isUSD, taxFactor]);

  if (!target) return null;

  // Dual-sync handlers (Calculated in native currency: USD for US stocks, THB for others)
  const handleDpuChange = (text: string) => {
    setDpuStr(text);
    const parsedDpu = parseFloat(text);
    if (!isNaN(parsedDpu) && parsedDpu >= 0) {
      const calculatedNet = target.shares * parsedDpu * taxFactor;
      setNetAmountStr(calculatedNet.toFixed(2));
    }
  };

  const handleNetAmountChange = (text: string) => {
    setNetAmountStr(text);
    const parsedNet = parseFloat(text);
    if (!isNaN(parsedNet) && parsedNet >= 0) {
      const divisor = target.shares * taxFactor;
      if (divisor > 0) {
        const calculatedDpu = parsedNet / divisor;
        setDpuStr(calculatedDpu.toFixed(4));
      }
    }
  };

  const handleSave = async () => {
    const finalDpu = parseFloat(dpuStr);
    if (isNaN(finalDpu) || finalDpu < 0) {
      Alert.alert('ข้อมูลไม่ถูกต้อง', 'กรุณาระบุยอดปันผลต่อหุ้นให้ถูกต้อง');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Update this dividend schedule in Supabase with NUMERIC(15, 4) & resilient is_special fallback
      const updateData: any = {
        dpu: Number(finalDpu.toFixed(6)),
        is_projected: !isReceived,
        is_special: isSpecialDividend,
      };
      let { error: updateErr } = await supabase
        .from('dividend_schedules')
        .update(updateData)
        .eq('id', target.scheduleId);

      if (updateErr && (updateErr.message?.includes('is_special') || updateErr.code === '42703' || updateErr.message?.includes('schema cache'))) {
        delete updateData.is_special;
        const retry = await supabase
          .from('dividend_schedules')
          .update(updateData)
          .eq('id', target.scheduleId);
        updateErr = retry.error;
      }

      if (updateErr) {
        throw new Error(updateErr.message || 'ไม่สามารถปรับปรุงยอดได้');
      }

      // 2. Persist Special Dividend status in local storage
      await setSpecialScheduleId(target.scheduleId, isSpecialDividend);


      // 3. If user chose to update future projections for this asset (only allowed for regular dividends)
      if (applyToFuture && !isSpecialDividend) {
        const { error: futureErr } = await supabase
          .from('dividend_schedules')
          .update({
            dpu: Number(finalDpu.toFixed(6)),
          })
          .eq('asset_id', target.assetId)
          .gt('xd_date', target.xdDate)
          .eq('is_projected', true);

        if (futureErr) {
          console.warn('Error updating future schedules:', futureErr.message);
        }
      }

      portfolioEvents.emitRefresh();
      onSuccess();
      onClose();
    } catch (err: any) {
      Alert.alert('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถบันทึกข้อมูลได้');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'android' ? 'height' : 'padding'}
        style={styles.modalOverlay}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.headerLeft}>
              <View style={[styles.typeBadge, target.isInterest ? styles.typeBadgeCash : styles.typeBadgeStock]}>
                <Ionicons
                  name={target.isInterest ? 'wallet-outline' : 'trending-up-outline'}
                  size={12}
                  color={target.isInterest ? '#059669' : '#2563EB'}
                />
                <Text style={[styles.typeBadgeText, target.isInterest ? styles.typeBadgeCashText : styles.typeBadgeStockText]}>
                  {target.isInterest ? 'ดอกเบี้ยเงินฝาก' : 'เงินปันผล'}
                </Text>
              </View>
              <Text style={styles.sheetTitle}>{target.symbol}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Reference Info */}
          <View style={styles.infoBanner}>
            <Text style={styles.infoText}>
              {target.isInterest
                ? `เงินฝาก ฿${target.shares.toLocaleString()} • รอบวันที่ ${target.xdDate}`
                : `${target.shares.toLocaleString()} หุ้น • วันที่ ${target.xdDate} (หักภาษี ${(target.taxRate * 100).toFixed(0)}%)`}
            </Text>
          </View>

          {/* Dual-sync Input Fields */}
          <View style={styles.inputsRow}>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>
                {target.isInterest ? 'อัตราดอกเบี้ยต่อปี (%)' : `ปันผล/หุ้น (${target.currency === 'USD' ? '$' : '฿'})`}
              </Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={dpuStr}
                onChangeText={handleDpuChange}
                placeholder="0.00"
                placeholderTextColor="#94A3B8"
                selectTextOnFocus
              />
            </View>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>ยอดสุทธิเข้าบัญชี ({isUSD ? '$ USD' : '฿'})</Text>
              <TextInput
                style={[styles.textInput, styles.netInput]}
                keyboardType="numeric"
                value={netAmountStr}
                onChangeText={handleNetAmountChange}
                placeholder="0.00"
                placeholderTextColor="#94A3B8"
                selectTextOnFocus
              />
            </View>
          </View>

          {/* USD to THB Live Converted Note */}
          {isUSD && (
            <View style={styles.usdConversionNote}>
              <Ionicons name="swap-horizontal" size={13} color="#059669" />
              <Text style={styles.usdConversionNoteText}>
                ≈ ฿{((parseFloat(netAmountStr) || 0) * effectiveRate).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (อัตราแลกเปลี่ยน ~฿{effectiveRate.toFixed(2)}/$)
              </Text>
            </View>
          )}

          {/* Received Status Toggle */}
          <TouchableOpacity
            style={[styles.statusToggle, isReceived && styles.statusToggleActive]}
            onPress={() => setIsReceived(!isReceived)}
            activeOpacity={0.8}
          >
            <View style={[styles.checkbox, isReceived && styles.checkboxActive]}>
              {isReceived && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
            </View>
            <View style={styles.statusTextContainer}>
              <Text style={[styles.statusTitle, isReceived && styles.statusTitleActive]}>
                {isReceived ? 'ได้รับเงินเข้าบัญชีแล้ว (ยอดเงินจริง)' : 'ยังไม่ได้รับ (ยอดคาดการณ์)'}
              </Text>
              <Text style={styles.statusSubtitle}>
                {isReceived
                  ? 'ยืนยันว่าเงินโอนเข้าบัญชีธนาคารเรียบร้อยแล้ว'
                  : 'ยังอยู่ในช่วงรอประกาศหรือรอยอดโอนเข้า'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Special Dividend Option */}
          <TouchableOpacity
            style={[styles.specialDivRow, isSpecialDividend && styles.specialDivRowActive]}
            onPress={() => {
              const next = !isSpecialDividend;
              setIsSpecialDividend(next);
              if (next) {
                setApplyToFuture(false);
              }
            }}
            activeOpacity={0.8}
          >
            <View style={[styles.checkbox, isSpecialDividend && styles.checkboxSpecial]}>
              {isSpecialDividend && <Ionicons name="sparkles" size={13} color="#FFFFFF" />}
            </View>
            <View style={styles.statusTextContainer}>
              <View style={styles.specialTitleRow}>
                <Text style={[styles.statusTitle, isSpecialDividend && styles.statusTitleSpecial]}>
                  เป็นเงินปันผลพิเศษ (Special Dividend)
                </Text>
                <View style={[styles.specialBadge, isSpecialDividend && styles.specialBadgeActive]}>
                  <Text style={[styles.specialBadgeText, isSpecialDividend && styles.specialBadgeTextActive]}>
                    One-off
                  </Text>
                </View>
              </View>
              <Text style={styles.statusSubtitle}>
                {isSpecialDividend
                  ? 'จ่ายพิเศษเฉพาะงวดนี้ครั้งเดียว ระบบจะไม่นำยอดนี้ไปคูณซ้ำในรอบอนาคต'
                  : 'แตะหากงวดนี้เป็นเงินปันผลพิเศษ (ไม่ใช่อัตราปกติ)'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Scope Selection: Current vs Future */}
          {isSpecialDividend ? (
            <View style={styles.specialNoticeBox}>
              <Ionicons name="information-circle" size={15} color="#D97706" />
              <Text style={styles.specialNoticeText}>
                ปันผลพิเศษจะปรับเฉพาะงวดนี้ โดยไม่นำไปเขียนทับรอบอนาคต เพื่อความแม่นยำของกระแสเงินสด
              </Text>
            </View>
          ) : (
            <View style={styles.scopeContainer}>
              <TouchableOpacity
                style={[styles.scopeBtn, !applyToFuture && styles.scopeBtnActive]}
                onPress={() => setApplyToFuture(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.scopeBtnText, !applyToFuture && styles.scopeBtnTextActive]}>
                  ปรับเฉพาะงวดนี้
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.scopeBtn, applyToFuture && styles.scopeBtnActive]}
                onPress={() => setApplyToFuture(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.scopeBtnText, applyToFuture && styles.scopeBtnTextActive]}>
                  ปรับรอบอนาคตด้วย
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={isSubmitting}
            >
              <Text style={styles.cancelBtnText}>ยกเลิก</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
              onPress={handleSave}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitBtnText}>บันทึกข้อมูล</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeStock: {
    backgroundColor: '#EFF6FF',
  },
  typeBadgeCash: {
    backgroundColor: '#ECFDF5',
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  typeBadgeStockText: {
    color: '#2563EB',
  },
  typeBadgeCashText: {
    color: '#059669',
  },
  closeBtn: {
    padding: 4,
  },
  infoBanner: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  infoText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  inputsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  inputCol: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  netInput: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
    color: '#047857',
  },
  usdConversionNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  usdConversionNoteText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  statusToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  statusToggleActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  statusTextContainer: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  statusTitleActive: {
    color: '#065F46',
  },
  statusSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  scopeContainer: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  scopeBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 8,
  },
  scopeBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  scopeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  scopeBtnTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  submitBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
  },
  submitBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  specialDivRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  specialDivRowActive: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  checkboxSpecial: {
    backgroundColor: '#D97706',
    borderColor: '#D97706',
  },
  specialTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusTitleSpecial: {
    color: '#B45309',
  },
  specialBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  specialBadgeActive: {
    backgroundColor: '#FEF3C7',
  },
  specialBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
  },
  specialBadgeTextActive: {
    color: '#B45309',
  },
  specialNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  specialNoticeText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#92400E',
    lineHeight: 16,
  },
});
