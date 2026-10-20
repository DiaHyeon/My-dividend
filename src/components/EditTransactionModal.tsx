// คอมโพเนนต์ป๊อปอัปแก้ไขและลบรายการธุรกรรมรายตัว (Edit Transaction Modal) พร้อมระบบคำนวณต้นทุนเฉลี่ยและยอดคงเหลือใหม่อัตโนมัติ
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
import { AssetType, Transaction } from '../types/database';
import { CalendarPickerModal } from './CalendarPickerModal';
import { isKnownUSSymbol, getTransactionCurrencyMeta, saveTransactionCurrencyMeta } from '../services/currencyService';
import { cancelRemindersForSymbol } from '../services/notificationService';
import { getLocalDateString } from '../utils/dateUtils';
import { portfolioEvents } from '../services/eventService';
import { colors, borderWidth, radii, fonts } from '../theme/tokens';
import { DashedDivider } from './ui/DashedDivider';

export interface EnrichedTransaction extends Transaction {
  symbol: string;
  asset_type: AssetType;
  currency?: 'THB' | 'USD';
}

interface EditTransactionModalProps {
  visible: boolean;
  transaction: EnrichedTransaction | null;
  exchangeRate: number;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  visible,
  transaction,
  exchangeRate,
  onClose,
  onSuccess,
}) => {
  const [shares, setShares] = useState('');
  const [pricePerShare, setPricePerShare] = useState('');
  const [txDate, setTxDate] = useState('');
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Currency state
  const isDeposit = transaction?.asset_type === 'CASH';
  const [isUS, setIsUS] = useState<boolean>(false);
  const [currencyMode, setCurrencyMode] = useState<'THB' | 'USD'>('THB');

  useEffect(() => {
    if (!transaction || !visible) return;

    setShares(transaction.shares ? transaction.shares.toString() : '');
    setTxDate(transaction.transaction_date || getLocalDateString());

    let isCancelled = false;
    const rate = exchangeRate > 0 ? exchangeRate : 34.00;
    const rawPrice = Number(transaction.price_per_share) || 0;

    const resolveCurrency = async () => {
      let effectiveCurrency: 'THB' | 'USD' = 'THB';
      const meta = await getTransactionCurrencyMeta(transaction.id);
      if (isCancelled) return;

      if (meta && meta.currency) {
        effectiveCurrency = meta.currency;
      } else if (transaction.currency) {
        effectiveCurrency = transaction.currency;
      } else if (!isDeposit) {
        // Query asset currency from DB
        try {
          const { data: assetData } = await supabase
            .from('assets')
            .select('currency')
            .eq('id', transaction.asset_id)
            .single();
          if (assetData?.currency) {
            effectiveCurrency = assetData.currency as 'THB' | 'USD';
          } else if (isKnownUSSymbol(transaction.symbol)) {
            effectiveCurrency = 'USD';
          }
        } catch {
          if (isKnownUSSymbol(transaction.symbol)) {
            effectiveCurrency = 'USD';
          }
        }
      }

      const isUsDetected = effectiveCurrency === 'USD';
      setIsUS(isUsDetected);
      setCurrencyMode(effectiveCurrency);

      if (meta && meta.originalPrice > 0) {
        setPricePerShare(meta.originalPrice.toString());
      } else {
        if (isDeposit) {
          setPricePerShare('1');
        } else if (isUsDetected && rate > 0) {
          setPricePerShare((rawPrice / rate).toFixed(2));
        } else {
          setPricePerShare(rawPrice.toString());
        }
      }
    };

    resolveCurrency();

    return () => {
      isCancelled = true;
    };
  }, [transaction, visible, exchangeRate, isDeposit]);

  if (!transaction) return null;

  const parsedShares = parseFloat(shares) || 0;
  const parsedPrice = parseFloat(pricePerShare) || 0;
  const rate = exchangeRate > 0 ? exchangeRate : 34.00;

  const effectivePriceTHB = isDeposit
    ? 1
    : currencyMode === 'USD'
    ? parsedPrice * rate
    : parsedPrice;
  const totalVolumeTHB = parsedShares * effectivePriceTHB;
  const totalVolumeUSD = isUS && rate > 0 ? totalVolumeTHB / rate : 0;

  // Handle Save Transaction
  const handleSave = async () => {
    if (isNaN(parsedShares) || parsedShares <= 0) {
      Alert.alert('ข้อมูลไม่ถูกต้อง', isDeposit ? 'กรุณาระบุยอดเงินฝากที่มากกว่า 0' : 'กรุณาระบุจำนวนหุ้นที่มากกว่า 0');
      return;
    }

    if (!isDeposit && (isNaN(parsedPrice) || parsedPrice < 0)) {
      Alert.alert('ข้อมูลไม่ถูกต้อง', 'กรุณาระบุราคาต่อหุ้นที่ถูกต้อง');
      return;
    }

    if (!txDate.trim()) {
      Alert.alert('ข้อมูลไม่ครบถ้วน', 'กรุณาเลือกวันที่ทำรายการ');
      return;
    }

    setIsSubmitting(true);
    try {
      const updatePayload: any = {
        shares: Number(parsedShares.toFixed(4)),
        price_per_share: Number(effectivePriceTHB.toFixed(4)),
        transaction_date: txDate.trim(),
        exchange_rate: Number(rate.toFixed(4)),
      };

      let { error } = await supabase
        .from('transactions')
        .update(updatePayload)
        .eq('id', transaction.id);

      if (error && (error.message?.includes('exchange_rate') || error.code === '42703' || error.message?.includes('schema cache'))) {
        delete updatePayload.exchange_rate;
        const retry = await supabase
          .from('transactions')
          .update(updatePayload)
          .eq('id', transaction.id);
        error = retry.error;
      }

      if (error) {
        throw new Error(error.message || 'ไม่สามารถบันทึกการแก้ไขได้');
      }


      await saveTransactionCurrencyMeta(transaction.id, {
        originalPrice: parsedPrice,
        currency: currencyMode,
        fxRate: rate,
        assetId: transaction.asset_id,
      });

      Alert.alert('สำเร็จ', `อัปเดตรายการ ${transaction.symbol} เรียบร้อยแล้ว`);
      portfolioEvents.emitRefresh();
      onSuccess();
      onClose();
    } catch (err: any) {
      Alert.alert('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถบันทึกการแก้ไขได้');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete Transaction
  const handleDelete = async () => {
    Alert.alert(
      'ยืนยันการลบรายการ',
      `คุณแน่ใจหรือไม่ที่จะลบรายการ ${transaction.type === 'SELL' ? (isDeposit ? 'ถอนเงิน' : 'ขาย') : (isDeposit ? 'ฝากเงิน' : 'ซื้อ')} ${transaction.symbol} จำนวน ${parsedShares.toLocaleString()} ${isDeposit ? 'บาท' : 'หุ้น'} ของวันที่ ${txDate}?`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ลบรายการนี้',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              // 1. ตรวจสอบว่าสินทรัพย์นี้มีธุรกรรมอื่นอีกไหม
              const { count, error: countErr } = await supabase
                .from('transactions')
                .select('id', { count: 'exact', head: true })
                .eq('asset_id', transaction.asset_id);

              if (countErr) {
                console.warn('Count transactions error:', countErr.message);
              }

              const isOnlyTransaction = count !== null && count <= 1;

              // 2. ลบรายการธุรกรรม
              const { error: deleteErr } = await supabase
                .from('transactions')
                .delete()
                .eq('id', transaction.id);

              if (deleteErr) {
                throw new Error(deleteErr.message || 'ไม่สามารถลบรายการได้');
              }

              // 3. หากเป็นรายการเดียวของสินทรัพย์ นำออกจากพอร์ตอัตโนมัติ (ไม่ให้มี 0 หุ้นค้างใน Dashboard)
              if (isOnlyTransaction) {
                await supabase
                  .from('assets')
                  .update({ is_archived: true })
                  .eq('id', transaction.asset_id);
                // ยกเลิกการแจ้งเตือนวัน XD ที่ค้างอยู่ของสินทรัพย์นี้
                await cancelRemindersForSymbol(transaction.symbol);
                Alert.alert('สำเร็จ', `ลบรายการและนำ ${transaction.symbol} ออกจากพอร์ตเรียบร้อยแล้ว`);
              } else {
                Alert.alert('สำเร็จ', 'ลบรายการเรียบร้อยแล้ว ระบบคำนวณต้นทุนเฉลี่ยและยอดคงเหลือใหม่ให้อัตโนมัติ');
              }
              portfolioEvents.emitRefresh();
              onSuccess();
              onClose();
            } catch (err: any) {
              Alert.alert('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถลบรายการได้');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'android' ? 'height' : 'padding'}
        style={styles.modalOverlay}
      >
        <View style={styles.sheetContainer}>
          {/* Grab Handle */}
          <View style={styles.grabHandle} />

          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <View style={styles.headerTitleRow}>
                <Text style={styles.sheetTitle}>แก้ไขรายการธุรกรรม</Text>
                <View
                  style={[
                    styles.typeBadge,
                    transaction.type === 'SELL'
                      ? styles.typeBadgeSell
                      : isDeposit
                      ? styles.typeBadgeCash
                      : styles.typeBadgeBuy,
                  ]}
                >
                  <Text
                    style={[
                      styles.typeBadgeText,
                      transaction.type === 'SELL'
                        ? styles.typeBadgeTextSell
                        : isDeposit
                        ? styles.typeBadgeTextCash
                        : styles.typeBadgeTextBuy,
                    ]}
                  >
                    {transaction.type === 'SELL'
                      ? isDeposit
                        ? 'ถอนเงิน (WITHDRAW)'
                        : 'ขาย (SELL)'
                      : isDeposit
                      ? 'เงินฝาก (DEPOSIT)'
                      : 'ซื้อ (BUY)'}
                  </Text>
                </View>
              </View>
              <Text style={styles.sheetSubtitle}>
                {transaction.symbol} • {transaction.asset_type === 'STOCKS' ? 'หุ้น' : transaction.asset_type === 'FUNDS' ? 'กองทุน' : 'เงินฝาก'}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="close" size={18} color={colors.ink} />
            </TouchableOpacity>
          </View>

          <DashedDivider color="#A9CDB9" marginVertical={0} />

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* 1. Transaction Date Picker */}
            <Text style={styles.fieldLabel}>วันที่ทำรายการ (Transaction Date) *</Text>
            <TouchableOpacity
              style={styles.datePickerBtn}
              onPress={() => setIsCalendarVisible(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="calendar-outline" size={18} color="#1F7A52" />
              <Text style={styles.datePickerText}>{txDate || 'เลือกวันที่ทำรายการ'}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </TouchableOpacity>

            {/* 2. Shares / Deposit Amount */}
            <Text style={styles.fieldLabel}>
              {isDeposit ? 'ยอดเงินฝาก (บาท) *' : 'จำนวนหุ้น / หน่วยลงทุน *'}
            </Text>
            <TextInput
              style={styles.input}
              value={shares}
              onChangeText={setShares}
              keyboardType="decimal-pad"
              placeholder={isDeposit ? 'เช่น 50000' : 'เช่น 100'}
              placeholderTextColor="#94A3B8"
            />

            {/* 3. Price per Share (for STOCKS & FUNDS) */}
            {!isDeposit && (
              <>
                <View style={styles.labelRow}>
                  <Text style={styles.fieldLabelNoMargin}>ราคาต่อหุ้น / ต้นทุนต่อหน่วย *</Text>
                  {isUS && (
                    <View style={styles.currencyPillGroup}>
                      <TouchableOpacity
                        style={[styles.currencyPill, currencyMode === 'USD' && styles.currencyPillActive]}
                        onPress={() => setCurrencyMode('USD')}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.currencyPillText, currencyMode === 'USD' && styles.currencyPillTextActive]}>
                          USD ($)
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.currencyPill, currencyMode === 'THB' && styles.currencyPillActive]}
                        onPress={() => setCurrencyMode('THB')}
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
                  style={styles.input}
                  value={pricePerShare}
                  onChangeText={setPricePerShare}
                  keyboardType="decimal-pad"
                  placeholder={currencyMode === 'USD' ? 'เช่น 150.25' : 'เช่น 35.50'}
                  placeholderTextColor="#94A3B8"
                />

                {isUS && currencyMode === 'USD' && rate > 0 && (
                  <Text style={styles.convertedHint}>
                    💡 เรทประมาณการ: ฿{rate.toFixed(2)}/USD • แปลงเป็นเงินบาท: ฿{effectivePriceTHB.toFixed(2)}/หุ้น
                  </Text>
                )}
              </>
            )}

            {/* Live Volume Summary Box */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>มูลค่ารวมของรายการนี้:</Text>
                <Text style={styles.summaryValue}>
                  ฿{totalVolumeTHB.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
              {isUS && totalVolumeUSD > 0 && (
                <View style={styles.summaryRowSub}>
                  <Text style={styles.summarySubLabel}>มูลค่าดอลลาร์:</Text>
                  <Text style={styles.summarySubValue}>
                    ${totalVolumeUSD.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
              )}
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtonsContainer}>
              <TouchableOpacity
                style={[styles.saveButton, (isSubmitting || isDeleting) && styles.buttonDisabled]}
                onPress={handleSave}
                disabled={isSubmitting || isDeleting}
                activeOpacity={0.8}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={20} color={colors.accent} />
                    <Text style={styles.saveButtonText}>บันทึกการแก้ไข</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.deleteButton, (isSubmitting || isDeleting) && styles.buttonDisabled]}
                onPress={handleDelete}
                disabled={isSubmitting || isDeleting}
                activeOpacity={0.8}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color={colors.lossOnLight} />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={18} color={colors.lossOnLight} />
                    <Text style={styles.deleteButtonText}>ลบรายการนี้</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      {/* Calendar Picker Modal */}
      <CalendarPickerModal
        visible={isCalendarVisible}
        target="purchaseDate"
        currentDate={txDate}
        title="เลือกวันที่ทำรายการ"
        onClose={() => setIsCalendarVisible(false)}
        onSelectDate={(selected) => setTxDate(selected)}
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
    borderLeftWidth: borderWidth,
    borderRightWidth: borderWidth,
    borderColor: colors.ink,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
  },
  grabHandle: {
    width: 44,
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: '#A9CDB9',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: fonts.thai,
    marginTop: 2,
    fontWeight: '500',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: borderWidth,
    borderColor: colors.ink,
  },
  typeBadgeBuy: {
    backgroundColor: '#EAF3EE',
  },
  typeBadgeSell: {
    backgroundColor: '#FEE2E2',
  },
  typeBadgeCash: {
    backgroundColor: '#FEF3C7',
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: fonts.mono,
  },
  typeBadgeTextBuy: {
    color: '#1F7A52',
  },
  typeBadgeTextSell: {
    color: colors.lossOnLight,
  },
  typeBadgeTextCash: {
    color: colors.ink,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
    marginBottom: 6,
  },
  fieldLabelNoMargin: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  currencyPillGroup: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: radii.pill,
    padding: 2,
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
  input: {
    backgroundColor: colors.surface,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: 16,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 15,
    fontFamily: fonts.mono,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 14,
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: 16,
    paddingHorizontal: 14,
    minHeight: 48,
    marginBottom: 14,
    gap: 10,
  },
  datePickerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.mono,
    color: colors.ink,
  },
  convertedHint: {
    fontSize: 11.5,
    color: '#1F7A52',
    fontFamily: fonts.mono,
    fontWeight: '700',
    marginTop: -8,
    marginBottom: 14,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    shadowColor: colors.shadow,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
    marginBottom: 18,
    gap: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: fonts.thai,
    color: colors.muted,
  },
  summaryValue: {
    fontSize: 17,
    fontWeight: '800',
    fontFamily: fonts.mono,
    color: '#1F7A52',
  },
  summaryRowSub: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summarySubLabel: {
    fontSize: 11.5,
    color: colors.muted,
    fontFamily: fonts.thai,
  },
  summarySubValue: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: fonts.mono,
    color: colors.ink,
  },
  actionButtonsContainer: {
    gap: 10,
    marginTop: 6,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    minHeight: 50,
    borderRadius: radii.pill,
    gap: 8,
    shadowColor: colors.shadow,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  saveButtonText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    minHeight: 48,
    borderRadius: radii.pill,
    gap: 6,
    shadowColor: colors.shadow,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  deleteButtonText: {
    color: colors.lossOnLight,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

export default EditTransactionModal;
