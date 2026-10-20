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
import { SheetFrame } from './ui/SheetFrame';
import { Pill } from './ui/Pill';
import { CalmText } from './ui/CalmText';
import { CapsuleButton } from './ui/CapsuleButton';
import { colors, fonts, inputStyle } from '../theme/tokens';

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
      // 1. Update this dividend schedule in Supabase with NUMERIC(15, 4) & resilient schema fallback
      const updateData: any = {
        dpu: Number(finalDpu.toFixed(6)),
        is_projected: !isReceived,
        is_special: isSpecialDividend,
      };
      if (isReceived && isUSD && effectiveRate > 0) {
        updateData.received_fx_rate = effectiveRate;
      } else if (!isReceived) {
        updateData.received_fx_rate = null;
      }

      let { error: updateErr } = await supabase
        .from('dividend_schedules')
        .update(updateData)
        .eq('id', target.scheduleId);

      if (updateErr && (updateErr.message?.includes('is_special') || updateErr.message?.includes('received_fx_rate') || updateErr.code === '42703' || updateErr.message?.includes('schema cache'))) {
        delete updateData.is_special;
        delete updateData.received_fx_rate;
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
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <SheetFrame title={`ปรับยอด ${target.symbol}`} onClose={onClose}>
          {/* Reference Info & Asset Type */}
          <View style={styles.infoBanner}>
            <Pill
              kind={target.isInterest ? 'outline' : 'accent'}
              size="sm"
              label={target.isInterest ? 'ดอกเบี้ย' : 'ปันผล'}
            />
            <CalmText variant="monoRegular" size={11} color={colors.ink} style={{ flex: 1 }}>
              {target.isInterest
                ? `เงินฝาก ฿${target.shares.toLocaleString()} • รอบวันที่ ${target.xdDate}`
                : `${target.shares.toLocaleString()} หุ้น • วันที่ ${target.xdDate} (หักภาษี ${(target.taxRate * 100).toFixed(0)}%)`}
            </CalmText>
          </View>

          {/* Dual-sync Input Fields */}
          <View style={styles.inputsRow}>
            <View style={styles.inputCol}>
              <CalmText variant="bodyBold" size={11} color={colors.muted} style={{ marginBottom: 6 }}>
                {target.isInterest ? 'อัตราดอกเบี้ยต่อปี (%)' : `ปันผล/หุ้น (${target.currency === 'USD' ? '$' : '฿'})`}
              </CalmText>
              <TextInput
                style={[inputStyle, { fontFamily: fonts.mono, fontSize: 15 }]}
                keyboardType="numeric"
                value={dpuStr}
                onChangeText={handleDpuChange}
                placeholder="0.00"
                placeholderTextColor={colors.muted}
                selectTextOnFocus
              />
            </View>
            <View style={styles.inputCol}>
              <CalmText variant="bodyBold" size={11} color={colors.muted} style={{ marginBottom: 6 }}>
                ยอดสุทธิเข้าบัญชี ({isUSD ? '$ USD' : '฿'})
              </CalmText>
              <TextInput
                style={[inputStyle, { fontFamily: fonts.mono, fontSize: 15 }]}
                keyboardType="numeric"
                value={netAmountStr}
                onChangeText={handleNetAmountChange}
                placeholder="0.00"
                placeholderTextColor={colors.muted}
                selectTextOnFocus
              />
            </View>
          </View>

          {/* USD to THB Live Converted Note */}
          {isUSD && (
            <View style={styles.usdConversionNote}>
              <Ionicons name="swap-horizontal" size={13} color={colors.ink} />
              <CalmText variant="monoRegular" size={11} color={colors.ink}>
                ≈ ฿{((parseFloat(netAmountStr) || 0) * effectiveRate).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (อัตราแลกเปลี่ยน ~฿{effectiveRate.toFixed(2)}/$)
              </CalmText>
            </View>
          )}

          {/* Received Status Toggle */}
          <TouchableOpacity
            style={[styles.statusToggle, isReceived && styles.statusToggleActive]}
            onPress={() => setIsReceived(!isReceived)}
            activeOpacity={0.8}
          >
            <View style={[styles.checkbox, isReceived && styles.checkboxActive]}>
              {isReceived && <Ionicons name="checkmark" size={14} color={colors.accent} />}
            </View>
            <View style={styles.statusTextContainer}>
              <CalmText variant="bodyBold" size={13} color={colors.ink}>
                {isReceived ? 'ได้รับเงินเข้าบัญชีแล้ว (ยอดเงินจริง)' : 'ยังไม่ได้รับ (ยอดคาดการณ์)'}
              </CalmText>
              <CalmText variant="monoRegular" size={11} color={colors.muted}>
                {isReceived
                  ? 'ยืนยันว่าเงินโอนเข้าบัญชีธนาคารเรียบร้อยแล้ว'
                  : 'ยังอยู่ในช่วงรอประกาศหรือรอยอดโอนเข้า'}
              </CalmText>
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
              {isSpecialDividend && <Ionicons name="sparkles" size={13} color={colors.accent} />}
            </View>
            <View style={styles.statusTextContainer}>
              <View style={styles.specialTitleRow}>
                <CalmText variant="bodyBold" size={13} color={colors.ink}>
                  เป็นเงินปันผลพิเศษ (Special Dividend)
                </CalmText>
                <Pill kind="dashed" size="sm" label="One-off" />
              </View>
              <CalmText variant="monoRegular" size={11} color={colors.muted}>
                {isSpecialDividend
                  ? 'จ่ายพิเศษเฉพาะงวดนี้ครั้งเดียว ระบบจะไม่นำยอดนี้ไปคูณซ้ำในรอบอนาคต'
                  : 'แตะหากงวดนี้เป็นเงินปันผลพิเศษ (ไม่ใช่อัตราปกติ)'}
              </CalmText>
            </View>
          </TouchableOpacity>

          {/* Scope Selection: Current vs Future */}
          {isSpecialDividend ? (
            <View style={styles.specialNoticeBox}>
              <Ionicons name="information-circle" size={16} color={colors.ink} />
              <CalmText variant="monoRegular" size={11} color={colors.ink} style={{ flex: 1, lineHeight: 16 }}>
                ปันผลพิเศษจะปรับเฉพาะงวดนี้ โดยไม่นำไปเขียนทับรอบอนาคต เพื่อความแม่นยำของกระแสเงินสด
              </CalmText>
            </View>
          ) : (
            <View style={styles.scopeContainer}>
              <TouchableOpacity
                style={[styles.scopeBtn, !applyToFuture && styles.scopeBtnActive]}
                onPress={() => setApplyToFuture(false)}
                activeOpacity={0.7}
              >
                <CalmText variant="mono" size={12} color={!applyToFuture ? colors.accent : colors.ink}>
                  ปรับเฉพาะงวดนี้
                </CalmText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.scopeBtn, applyToFuture && styles.scopeBtnActive]}
                onPress={() => setApplyToFuture(true)}
                activeOpacity={0.7}
              >
                <CalmText variant="mono" size={12} color={applyToFuture ? colors.accent : colors.ink}>
                  ปรับรอบอนาคตด้วย
                </CalmText>
              </TouchableOpacity>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            <View style={{ flex: 1 }}>
              <CapsuleButton
                variant="surface"
                label="ยกเลิก"
                onPress={onClose}
                disabled={isSubmitting}
              />
            </View>
            <View style={{ flex: 2 }}>
              <CapsuleButton
                variant="ink"
                label={isSubmitting ? undefined : "บันทึกข้อมูล"}
                icon={isSubmitting ? <ActivityIndicator size="small" color={colors.accent} /> : undefined}
                onPress={handleSave}
                disabled={isSubmitting}
              />
            </View>
          </View>
        </SheetFrame>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.track,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
    marginBottom: 14,
  },
  inputsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  inputCol: {
    flex: 1,
  },
  usdConversionNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.track,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  statusToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  statusToggleActive: {
    backgroundColor: colors.bg,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkboxActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  statusTextContainer: {
    flex: 1,
  },
  scopeContainer: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.track,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  scopeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  scopeBtnActive: {
    backgroundColor: colors.ink,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  specialDivRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  specialDivRowActive: {
    backgroundColor: colors.bg,
  },
  checkboxSpecial: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  specialTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  specialNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.track,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
});
