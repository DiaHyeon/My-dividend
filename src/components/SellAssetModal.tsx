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
import { saveTransactionCurrencyMeta, resolveIsUSStock } from '../services/currencyService';
import { colors, borderWidth, radii, fonts } from '../theme/tokens';
import { DashedDivider } from './ui/DashedDivider';

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
    (asset
      ? resolveIsUSStock({
          id: asset.id,
          symbol: asset.symbol,
          asset_type: asset.asset_type,
          currency: asset.currency,
        })
      : false);

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
          <View style={styles.grabHandle} />
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
            <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={20} color={colors.ink} />
            </TouchableOpacity>
          </View>
          <DashedDivider color={colors.shadow} />

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
                style={[styles.inputBox, styles.monoInput, isOverMax && styles.inputBoxError]}
                keyboardType="numeric"
                placeholder={`0.0000 ${unitLabel}`}
                placeholderTextColor={colors.muted}
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
                  style={[styles.inputBox, styles.monoInput]}
                  keyboardType="numeric"
                  placeholder={currencyMode === 'USD' ? '$0.00' : '0.00'}
                  placeholderTextColor={colors.muted}
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
                <Ionicons name="calendar-outline" size={18} color={colors.ink} />
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
                  <Ionicons name="information-circle" size={14} color={colors.ink} />
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
                  <ActivityIndicator color={colors.accent} size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-sharp" size={18} color={colors.accent} />
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
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderTopWidth: borderWidth,
    borderTopColor: colors.ink,
    maxHeight: '88%',
    paddingBottom: Platform.OS === 'ios' ? 28 : 20,
  },
  grabHandle: {
    width: 44,
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.shadow,
    marginTop: 8,
    marginBottom: 4,
    alignSelf: 'center',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  sellTag: {
    backgroundColor: '#FEE2E2',
  },
  cashTag: {
    backgroundColor: '#FEF3C7',
  },
  actionTagText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
  },
  sellTagText: {
    color: colors.lossOnLight,
  },
  cashTagText: {
    color: colors.ink,
  },
  usBadge: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.ink,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  usBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: fonts.mono,
    color: colors.ink,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: fonts.thai,
    marginTop: 2,
  },
  formContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#EAF3EE',
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
    borderWidth: borderWidth,
    borderColor: colors.ink,
  },
  infoCol: {
    flex: 1,
  },
  infoColBorder: {
    borderLeftWidth: 1.5,
    borderLeftColor: '#A9CDB9',
    paddingLeft: 14,
  },
  infoLabel: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: fonts.thai,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: fonts.mono,
    color: colors.ink,
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
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  currencyToggleBox: {
    flexDirection: 'row',
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: radii.pill,
    padding: 2,
    backgroundColor: colors.surface,
    gap: 2,
  },
  currencyPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  currencyPillActive: {
    backgroundColor: colors.ink,
  },
  currencyPillText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: fonts.mono,
    color: colors.ink,
  },
  currencyPillTextActive: {
    color: colors.accent,
  },
  currencyHelperText: {
    fontSize: 11,
    color: '#1F7A52',
    fontFamily: fonts.mono,
    fontWeight: '700',
    marginTop: 4,
    marginLeft: 2,
  },
  errorHint: {
    fontSize: 11,
    color: colors.lossOnLight,
    fontFamily: fonts.mono,
    fontWeight: '700',
  },
  inputBox: {
    backgroundColor: colors.surface,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: 16,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 15,
    color: colors.ink,
    fontFamily: fonts.thai,
  },
  monoInput: {
    fontFamily: fonts.mono,
    fontWeight: '700',
  },
  inputBoxError: {
    borderColor: colors.lossOnLight,
    backgroundColor: '#FEF2F2',
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  presetPill: {
    flex: 1,
    minHeight: 38,
    backgroundColor: colors.surface,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetPillText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: fonts.mono,
    color: colors.ink,
  },
  presetPillAll: {
    backgroundColor: colors.ink,
  },
  presetPillAllText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.accent,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: 16,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  datePickerText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.mono,
    color: colors.ink,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    marginTop: 4,
    marginBottom: 16,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    shadowColor: colors.shadow,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  summaryLabel: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: fonts.thai,
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.mono,
    color: colors.ink,
  },
  summaryValueHighlight: {
    fontSize: 17,
    fontWeight: '800',
    fontFamily: fonts.mono,
    color: '#1F7A52',
  },
  fullExitNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1.5,
    borderTopColor: '#A9CDB9',
  },
  fullExitNoticeText: {
    fontSize: 11,
    color: colors.ink,
    fontFamily: fonts.thaiBold,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 48,
    backgroundColor: colors.surface,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  confirmBtn: {
    flex: 2,
    flexDirection: 'row',
    gap: 6,
    minHeight: 48,
    backgroundColor: colors.ink,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.accent,
  },
});
