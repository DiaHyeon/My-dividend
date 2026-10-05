// คอมโพเนนต์ป๊อปอัปบันทึกการขายสินทรัพย์ (SELL) และถอนเงินฝาก (WITHDRAW) ดีไซน์ Minimal พร้อมระบบตรวจสอบยอดคงเหลือ และรองรับสกุลเงิน USD
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
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { AssetSummary } from '../types/database';
import { CalendarPickerModal } from './CalendarPickerModal';
import { getLocalDateString } from '../utils/dateUtils';
import { cancelRemindersForSymbol } from '../services/notificationService';
import { portfolioEvents } from '../services/eventService';
import { saveTransactionCurrencyMeta, isKnownUSSymbol } from '../services/currencyService';

interface SellAssetModalProps {
  visible: boolean;
  asset: AssetSummary | null;
  currency?: 'THB' | 'USD';
  onClose: () => void;
  onSuccess: () => void;
  exchangeRate?: number;
}

export const SellAssetModal: React.FC<SellAssetModalProps> = ({
  visible,
  asset,
  currency,
  onClose,
  onSuccess,
  exchangeRate = 34.00,
}) => {
  const [sellShares, setSellShares] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [txDate, setTxDate] = useState(getLocalDateString());
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currencyMode, setCurrencyMode] = useState<'THB' | 'USD'>('THB');

  const isCash = asset?.asset_type === 'CASH';
  const isFund = asset?.asset_type === 'FUNDS';
  const isUS =
    currency === 'USD' ||
    (asset?.asset_type === 'STOCKS' &&
      (asset?.currency === 'USD' ||
        isKnownUSSymbol(asset?.symbol || '') ||
        Math.abs(Number(asset?.tax_rate) - 0.15) < 0.005));

  const unitLabel = isCash ? 'บาท' : isFund ? 'หน่วย' : 'หุ้น';
  const actionTitle = isCash ? 'ถอน' : 'ขาย';

  const rate = exchangeRate > 0 ? exchangeRate : 34.00;
  const maxShares = Number(asset?.net_shares) || 0;
  const currentPriceTHB = Number(asset?.current_price) || (isCash ? 1.0000 : 0);
  const avgCostTHB = Number(asset?.weighted_average_cost) || 0;

  useEffect(() => {
    if (!visible || !asset) return;
    setSellShares('');
    const defaultMode = isUS ? 'USD' : 'THB';
    setCurrencyMode(defaultMode);

    if (isCash) {
      setSellPrice('1.0000');
    } else if (currentPriceTHB > 0) {
      if (defaultMode === 'USD' && rate > 0) {
        setSellPrice((currentPriceTHB / rate).toFixed(2));
      } else {
        setSellPrice(currentPriceTHB.toFixed(2));
      }
    } else {
      setSellPrice('');
    }

    setTxDate(getLocalDateString());
    setIsSubmitting(false);
  }, [visible, asset, isUS, currency]);

  if (!asset) return null;

  const handleToggleCurrency = (newMode: 'THB' | 'USD') => {
    if (newMode === currencyMode) return;
    const currentVal = parseFloat(sellPrice) || 0;
    if (currentVal > 0) {
      if (newMode === 'USD') {
        setSellPrice((currentVal / rate).toFixed(2));
      } else {
        setSellPrice((currentVal * rate).toFixed(2));
      }
    }
    setCurrencyMode(newMode);
  };

  const parsedShares = parseFloat(sellShares) || 0;
  const rawPrice = isCash ? 1.0000 : parseFloat(sellPrice) || 0;
  const effectivePriceTHB = isCash
    ? 1.0000
    : currencyMode === 'USD'
    ? rawPrice * rate
    : rawPrice;
  const priceUSD = isUS && rate > 0 ? effectivePriceTHB / rate : 0;

  const isOverMax = parsedShares > maxShares + 0.0001;
  const isFullExit = parsedShares >= maxShares && maxShares > 0;
  const remainingShares = Math.max(0, maxShares - parsedShares);
  const totalProceedsTHB = parsedShares * effectivePriceTHB;
  const totalProceedsUSD = isUS && rate > 0 ? totalProceedsTHB / rate : 0;

  const handlePreset = (pct: number) => {
    if (maxShares <= 0) return;
    if (pct === 1.0) {
      setSellShares(maxShares.toString());
    } else {
      const calculated = Number((maxShares * pct).toFixed(4));
      setSellShares(calculated.toString());
    }
  };

  const handleConfirm = async () => {
    if (parsedShares <= 0) {
      Alert.alert('ข้อมูลไม่ถูกต้อง', `กรุณาระบุจำนวนที่ต้องการ${actionTitle}ที่มากกว่า 0`);
      return;
    }

    if (isOverMax) {
      Alert.alert(
        'ยอดไม่ถูกต้อง',
        `จำนวนที่ต้องการ${actionTitle} (${parsedShares.toLocaleString()} ${unitLabel}) เกินกว่ายอดที่มีอยู่จริง (${maxShares.toLocaleString()} ${unitLabel})`
      );
      return;
    }

    if (!isCash && rawPrice <= 0) {
      Alert.alert('ข้อมูลไม่ถูกต้อง', 'กรุณาระบุราคาต่อหน่วยที่ถูกต้อง');
      return;
    }

    setIsSubmitting(true);
    try {
      const effectiveDate = txDate && txDate.trim() ? txDate.trim() : getLocalDateString();
      const txPayload: any = {
        asset_id: asset.id,
        type: 'SELL',
        shares: Number(parsedShares.toFixed(4)),
        price_per_share: Number(effectivePriceTHB.toFixed(4)),
        transaction_date: effectiveDate,
        exchange_rate: Number(rate.toFixed(4)),
      };

      let { data: insertedTx, error: txError } = await supabase
        .from('transactions')
        .insert(txPayload)
        .select()
        .single();

      if (
        txError &&
        (txError.message?.includes('exchange_rate') ||
          txError.code === '42703' ||
          txError.message?.includes('schema cache'))
      ) {
        delete txPayload.exchange_rate;
        const retry = await supabase
          .from('transactions')
          .insert(txPayload)
          .select()
          .single();
        insertedTx = retry.data;
        txError = retry.error;
      }

      if (txError) {
        throw new Error(txError.message || `ไม่สามารถบันทึกรายการ${actionTitle}ได้`);
      }

      // บันทึก Metadata สกุลเงิน USD
      if (insertedTx && insertedTx.id && isUS) {
        await saveTransactionCurrencyMeta(insertedTx.id, {
          originalPrice: rawPrice,
          currency: currencyMode,
          fxRate: rate,
          assetId: asset.id,
        });
      }

      // หากขาย/ถอน 100% หมดพอร์ต ให้นำออกจากพอร์ตอัตโนมัติ (Soft Archive)
      if (isFullExit) {
        await supabase.from('assets').update({ is_archived: true }).eq('id', asset.id);
        await cancelRemindersForSymbol(asset.symbol);
      }

      portfolioEvents.emitRefresh();
      Alert.alert(
        'สำเร็จ',
        isFullExit
          ? `บันทึกรายการ${actionTitle} ${asset.symbol} ทั้งหมดเรียบร้อยแล้ว (นำออกจากพอร์ตอัตโนมัติ)`
          : `บันทึกรายการ${actionTitle} ${parsedShares.toLocaleString()} ${unitLabel} เรียบร้อยแล้ว`
      );

      onSuccess();
      onClose();
    } catch (err: any) {
      Alert.alert('เกิดข้อผิดพลาด', err.message || `ไม่สามารถบันทึกรายการ${actionTitle}ได้`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View>
              <View style={styles.titleRow}>
                <View style={[styles.actionTag, isCash ? styles.cashTag : styles.sellTag]}>
                  <Text style={[styles.actionTagText, isCash ? styles.cashTagText : styles.sellTagText]}>
                    {actionTitle}
                  </Text>
                </View>
                <Text style={styles.sheetTitle}>{asset.symbol}</Text>
                {isUS && (
                  <View style={styles.usBadge}>
                    <Text style={styles.usBadgeText}>USD $</Text>
                  </View>
                )}
              </View>
              <Text style={styles.sheetSubtitle}>
                {isCash ? 'ถอนเงินต้นออกจากบัญชี' : `บันทึกการขาย${isFund ? 'กองทุน' : 'หุ้น'}เพื่อลดสัดส่วนพอร์ต`}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close-circle" size={24} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formContent} keyboardShouldPersistTaps="handled">
            {/* Holdings Info Banner */}
            <View style={styles.infoBanner}>
              <View style={styles.infoCol}>
                <Text style={styles.infoLabel}>ถืออยู่ปัจจุบัน</Text>
                <Text style={styles.infoValue}>
                  {maxShares.toLocaleString('th-TH', { maximumFractionDigits: 4 })} {unitLabel}
                </Text>
              </View>
              {!isCash && (
                <View style={[styles.infoCol, styles.infoColBorder]}>
                  <Text style={styles.infoLabel}>ต้นทุนเฉลี่ยเดิม</Text>
                  <Text style={styles.infoValue}>
                    ฿{avgCostTHB.toFixed(2)}
                    {isUS && ` ($${(avgCostTHB / rate).toFixed(2)})`}
                  </Text>
                </View>
              )}
            </View>

            {/* Input 1: จำนวนที่ขาย/ถอน */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>
                  จำนวนที่ต้องการ{actionTitle} ({unitLabel})
                </Text>
                {isOverMax && (
                  <Text style={styles.errorHint}>⚠️ เกินจำนวนที่มี ({maxShares.toLocaleString()})</Text>
                )}
              </View>
              <TextInput
                style={[styles.inputBox, isOverMax && styles.inputBoxError]}
                keyboardType="numeric"
                placeholder={`0.0000 ${unitLabel}`}
                placeholderTextColor="#94A3B8"
                value={sellShares}
                onChangeText={setSellShares}
              />

              {/* Minimal Quick Presets */}
              <View style={styles.presetRow}>
                <TouchableOpacity style={styles.presetPill} onPress={() => handlePreset(0.25)}>
                  <Text style={styles.presetPillText}>25%</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.presetPill} onPress={() => handlePreset(0.5)}>
                  <Text style={styles.presetPillText}>50%</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.presetPill} onPress={() => handlePreset(0.75)}>
                  <Text style={styles.presetPillText}>75%</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.presetPill, styles.presetPillAll]} onPress={() => handlePreset(1.0)}>
                  <Text style={styles.presetPillAllText}>ทั้งหมด</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Input 2: ราคาที่ขาย (เฉพาะหุ้นและกองทุน) พร้อมปุ่มสลับ USD / THB */}
            {!isCash && (
              <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.inputLabel}>
                    ราคาที่{actionTitle}ต่อ{unitLabel} ({currencyMode === 'USD' ? 'USD $' : '฿'})
                  </Text>
                  {isUS && (
                    <View style={styles.currencyToggleBox}>
                      <TouchableOpacity
                        style={[styles.currencyPill, currencyMode === 'USD' && styles.currencyPillActive]}
                        onPress={() => handleToggleCurrency('USD')}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.currencyPillText, currencyMode === 'USD' && styles.currencyPillTextActive]}>
                          USD ($)
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.currencyPill, currencyMode === 'THB' && styles.currencyPillActive]}
                        onPress={() => handleToggleCurrency('THB')}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.currencyPillText, currencyMode === 'THB' && styles.currencyPillTextActive]}>
                          THB (฿)
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
                <TextInput
                  style={styles.inputBox}
                  keyboardType="numeric"
                  placeholder={currencyMode === 'USD' ? '$0.00' : '0.00'}
                  placeholderTextColor="#94A3B8"
                  value={sellPrice}
                  onChangeText={setSellPrice}
                />
                {isUS && rawPrice > 0 && (
                  <Text style={styles.currencyHelperText}>
                    {currencyMode === 'USD'
                      ? `≈ ฿${effectivePriceTHB.toFixed(2)} (อัตราแลกเปลี่ยน ฿${rate.toFixed(2)}/$)`
                      : `≈ $${priceUSD.toFixed(2)} USD`}
                  </Text>
                )}
              </View>
            )}

            {/* Input 3: วันที่ทำรายการ */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>วันที่ทำรายการ</Text>
              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setIsCalendarVisible(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="calendar-outline" size={16} color="#64748B" />
                <Text style={styles.datePickerText}>{txDate || 'เลือกวันที่'}</Text>
              </TouchableOpacity>
            </View>

            {/* Summary Preview Box */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>มูลค่าที่ได้รับกลับมา</Text>
                <Text style={styles.summaryValueHighlight}>
                  ฿{totalProceedsTHB.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {isUS && ` ($${totalProceedsUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>คงเหลือหลัง{actionTitle}</Text>
                <Text style={styles.summaryValue}>
                  {remainingShares.toLocaleString('th-TH', { maximumFractionDigits: 4 })} {unitLabel}
                </Text>
              </View>
              {isFullExit && (
                <View style={styles.fullExitNotice}>
                  <Ionicons name="information-circle" size={14} color="#D97706" />
                  <Text style={styles.fullExitNoticeText}>
                    {actionTitle}ทั้งหมด: ระบบจะนำสินทรัพย์ออกจากพอร์ตให้อัตโนมัติ
                  </Text>
                </View>
              )}
            </View>

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={isSubmitting}>
                <Text style={styles.cancelBtnText}>ยกเลิก</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.confirmBtn,
                  (isOverMax || parsedShares <= 0 || isSubmitting) && styles.btnDisabled,
                ]}
                onPress={handleConfirm}
                disabled={isOverMax || parsedShares <= 0 || isSubmitting}
                activeOpacity={0.85}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-sharp" size={18} color="#FFFFFF" />
                    <Text style={styles.confirmBtnText}>ยืนยันการ{actionTitle}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <CalendarPickerModal
        visible={isCalendarVisible}
        target="date"
        currentDate={txDate}
        title={`เลือกวันที่${actionTitle}`}
        onClose={() => setIsCalendarVisible(false)}
        onSelectDate={(iso) => setTxDate(iso)}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sellTag: {
    backgroundColor: '#FEF2F2',
  },
  cashTag: {
    backgroundColor: '#FFFBEB',
  },
  actionTagText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sellTagText: {
    color: '#DC2626',
  },
  cashTagText: {
    color: '#D97706',
  },
  usBadge: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  usBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  sheetTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
  },
  sheetSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  formContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  infoCol: {
    flex: 1,
  },
  infoColBorder: {
    borderLeftWidth: 1,
    borderLeftColor: '#E2E8F0',
    paddingLeft: 12,
  },
  infoLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  inputGroup: {
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  currencyToggleBox: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  currencyPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  currencyPillActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  currencyPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  currencyPillTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  currencyHelperText: {
    fontSize: 11,
    color: '#0284C7',
    fontWeight: '600',
    marginTop: 4,
    marginLeft: 2,
  },
  errorHint: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '600',
  },
  inputBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '600',
  },
  inputBoxError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  presetPill: {
    flex: 1,
    paddingVertical: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    alignItems: 'center',
  },
  presetPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  presetPillAll: {
    backgroundColor: '#E2E8F0',
  },
  presetPillAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  datePickerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  summaryCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  summaryValueHighlight: {
    fontSize: 15,
    fontWeight: '800',
    color: '#059669',
  },
  fullExitNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  fullExitNoticeText: {
    fontSize: 11,
    color: '#D97706',
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  confirmBtn: {
    flex: 2,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: '#DC2626',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.45,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
