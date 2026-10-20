import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getSectorsForType } from '../services/sectorService';
import {
  evaluateCashTax,
  calculateAnnualGrossInterest,
  calculateScheduleCashPayout,
} from '../services/taxService';
import { getLocalDateString } from '../utils/dateUtils';
import { colors, borderWidth, radii, fonts } from '../theme/tokens';

export interface CashAssetFormProps {
  accountName: string;
  onChangeAccountName: (text: string) => void;
  selectedSector: string;
  onChangeSector: (sectorId: string) => void;
  depositAmount: string;
  onChangeDepositAmount: (text: string) => void;
  interestRate: string;
  onChangeInterestRate: (text: string) => void;
  interestFrequency: 'MONTHLY' | 'SEMI_ANNUAL' | 'ANNUAL';
  onChangeInterestFrequency: (freq: 'MONTHLY' | 'SEMI_ANNUAL' | 'ANNUAL') => void;
  taxRatePercent: string;
  onChangeTaxRatePercent: (rate: string) => void;
  isAutoCashTax: boolean;
  onToggleAutoTax: () => void;
  depositDate?: string;
  onChangeDepositDate?: (date: string) => void;
}

export const CashAssetForm: React.FC<CashAssetFormProps> = ({
  accountName,
  onChangeAccountName,
  selectedSector,
  onChangeSector,
  depositAmount,
  onChangeDepositAmount,
  interestRate,
  onChangeInterestRate,
  interestFrequency,
  onChangeInterestFrequency,
  taxRatePercent,
  onChangeTaxRatePercent,
  isAutoCashTax,
  onToggleAutoTax,
  depositDate,
  onChangeDepositDate,
}) => {
  const parsedDeposit = parseFloat(depositAmount) || 0;
  const parsedInterestRate = parseFloat(interestRate) || 0;
  const currentTaxPct = parseFloat(taxRatePercent) || 0;

  // Evaluate tax rule and calculations
  const cashTaxEval = evaluateCashTax(parsedDeposit, parsedInterestRate, selectedSector);
  const grossAnnual = calculateAnnualGrossInterest(parsedDeposit, parsedInterestRate);
  const annualTax = grossAnnual * (currentTaxPct / 100);
  const netAnnual = grossAnnual - annualTax;
  const divisor = interestFrequency === 'MONTHLY' ? 12 : interestFrequency === 'SEMI_ANNUAL' ? 2 : 1;
  const netPerPeriod = netAnnual / divisor;

  // Calculate upcoming first payout pro-rata based on deposit date
  const effectiveDepositDate = (depositDate && depositDate.trim()) || getLocalDateString();
  let nextScheduleDate = `${new Date().getFullYear()}-12-31`;

  try {
    const dDate = new Date(effectiveDepositDate);
    const dYear = isNaN(dDate.getFullYear()) ? new Date().getFullYear() : dDate.getFullYear();
    const dMonth = isNaN(dDate.getMonth()) ? new Date().getMonth() : dDate.getMonth();
    const dDay = isNaN(dDate.getDate()) ? new Date().getDate() : dDate.getDate();

    if (interestFrequency === 'SEMI_ANNUAL') {
      if (dMonth < 5 || (dMonth === 5 && dDay <= 30)) {
        nextScheduleDate = `${dYear}-06-30`;
      } else {
        nextScheduleDate = `${dYear}-12-31`;
      }
    } else if (interestFrequency === 'MONTHLY') {
      if (dDay <= 28) {
        const mStr = String(dMonth + 1).padStart(2, '0');
        nextScheduleDate = `${dYear}-${mStr}-28`;
      } else {
        const nextM = (dMonth + 1) % 12;
        const nextY = dMonth === 11 ? dYear + 1 : dYear;
        const mStr = String(nextM + 1).padStart(2, '0');
        nextScheduleDate = `${nextY}-${mStr}-28`;
      }
    } else {
      nextScheduleDate = `${dYear}-12-31`;
    }
  } catch {
    nextScheduleDate = `${new Date().getFullYear()}-12-31`;
  }

  const firstPayout = calculateScheduleCashPayout(
    parsedDeposit,
    parsedInterestRate,
    currentTaxPct / 100,
    effectiveDepositDate,
    nextScheduleDate,
    interestFrequency
  );

  return (
    <View style={styles.container}>
      {/* 1. Account / Bank Name */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>ชื่อบัญชี / สถาบันการเงิน *</Text>
        <TextInput
          style={styles.input}
          value={accountName}
          onChangeText={onChangeAccountName}
          placeholder="เช่น Dime! Save (3.0%), Kept, K-eSavings, ฝากประจำ"
          placeholderTextColor={colors.muted}
        />
      </View>

      {/* 2. Cash Segment Selector */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>ประเภทบัญชีเงินฝาก (Segment)</Text>
        <View style={styles.sectorChipsContainer}>
          {getSectorsForType('CASH').map((sec) => (
            <TouchableOpacity
              key={sec.id}
              style={[
                styles.sectorChip,
                selectedSector === sec.id && styles.sectorChipActive,
              ]}
              onPress={() => onChangeSector(sec.id)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.sectorChipText,
                  selectedSector === sec.id && styles.sectorChipTextActive,
                ]}
              >
                {sec.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 3. Deposit Amount & Interest Rate */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>จำนวนเงินฝาก (฿ THB) *</Text>
        <TextInput
          style={[styles.input, styles.monoInput]}
          value={depositAmount}
          onChangeText={onChangeDepositAmount}
          placeholder="ระบุจำนวนเงินฝาก เช่น 50000"
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>อัตราดอกเบี้ยต่อปี (% p.a.) *</Text>
        <TextInput
          style={[styles.input, styles.monoInput]}
          value={interestRate}
          onChangeText={onChangeInterestRate}
          placeholder="เช่น 1.5, 2.2, 3.0"
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
        />
      </View>

      {/* 3.1 Deposit Start Date */}
      {onChangeDepositDate && (
        <View style={styles.inputGroup}>
          <View style={styles.dateLabelRow}>
            <Text style={styles.label}>วันที่เริ่มฝาก (ปี-เดือน-วัน)</Text>
            <Text style={styles.dateHintText}>คำนวณดอกเบี้ยตามวันจริง</Text>
          </View>
          <View style={styles.dateInputContainer}>
            <TextInput
              style={styles.dateInput}
              value={depositDate}
              onChangeText={onChangeDepositDate}
              placeholder="YYYY-MM-DD เช่น 2026-10-15"
              placeholderTextColor={colors.muted}
            />
            <Ionicons name="calendar-outline" size={18} color={colors.ink} />
          </View>
        </View>
      )}

      {/* 4. Payout Frequency */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>รอบการจ่ายดอกเบี้ย</Text>
        <View style={styles.frequencyRow}>
          {[
            { label: 'ทุกเดือน (Monthly)', value: 'MONTHLY' },
            { label: 'ทุก 6 เดือน (มิ.ย./ธ.ค.)', value: 'SEMI_ANNUAL' },
            { label: 'ปีละครั้ง (ธ.ค.)', value: 'ANNUAL' },
          ].map((freq) => (
            <TouchableOpacity
              key={freq.value}
              style={[
                styles.frequencyBtn,
                interestFrequency === freq.value && styles.frequencyBtnActive,
              ]}
              onPress={() => onChangeInterestFrequency(freq.value as any)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.frequencyBtnText,
                  interestFrequency === freq.value && styles.frequencyBtnTextActive,
                ]}
              >
                {freq.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 5. Withholding Tax Rate & 20,000 THB Rule */}
      <View style={styles.taxSectionCard}>
        <View style={styles.taxHeaderRow}>
          <Text style={styles.taxSectionTitle}>ภาษีดอกเบี้ยหัก ณ ที่จ่าย (%)</Text>
          <TouchableOpacity
            style={[styles.autoTaxToggleBtn, isAutoCashTax && styles.autoTaxToggleBtnActive]}
            onPress={onToggleAutoTax}
            activeOpacity={0.7}
          >
            <Text style={styles.autoTaxToggleText}>
              {isAutoCashTax ? '✦ คำนวณอัตโนมัติ (เกณฑ์ 20,000฿)' : '✎ กำหนดเอง'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Smart Tax Rule Explanation Banner */}
        {parsedDeposit > 0 && parsedInterestRate > 0 && (
          <View
            style={[
              styles.taxAlertBox,
              cashTaxEval.isExceededLimit ? styles.taxAlertBoxExceeded : styles.taxAlertBoxNormal,
            ]}
          >
            <Ionicons
              name={cashTaxEval.isExceededLimit ? 'alert-circle' : 'shield-checkmark'}
              size={18}
              color={cashTaxEval.isExceededLimit ? '#D97706' : '#1F7A52'}
              style={{ marginTop: 1 }}
            />
            <View style={styles.taxAlertContent}>
              <Text
                style={[
                  styles.taxAlertTitle,
                  cashTaxEval.isExceededLimit ? styles.taxAlertTitleExceeded : styles.taxAlertTitleNormal,
                ]}
              >
                {cashTaxEval.isFixedDeposit
                  ? 'เงินฝากประจำ: อัตราปกติหัก 15%'
                  : cashTaxEval.isExceededLimit
                  ? 'ดอกเบี้ยเกินเกณฑ์ 20,000 บาท/ปี (หักภาษี 15%)'
                  : 'ได้รับยกเว้นภาษี (ดอกเบี้ยไม่เกิน 20,000 บาท/ปี)'}
              </Text>
              <Text style={styles.taxAlertDetail}>{cashTaxEval.explanation}</Text>
              {!cashTaxEval.isFixedDeposit && !cashTaxEval.isExceededLimit && (
                <Text style={styles.taxAlertQuota}>
                  💡 โควตาดอกเบี้ยปลอดภาษีคงเหลือ: ฿
                  {cashTaxEval.remainingLimit.toLocaleString('th-TH', { maximumFractionDigits: 2 })}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Tax Override Pills */}
        <View style={styles.taxPillRow}>
          {[
            { label: '0% ยกเว้น', value: '0' },
            { label: '15% หัก ณ ที่จ่าย', value: '15' },
          ].map((pill) => (
            <TouchableOpacity
              key={pill.value}
              style={[
                styles.taxPill,
                taxRatePercent === pill.value && styles.taxPillActive,
              ]}
              onPress={() => onChangeTaxRatePercent(pill.value)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.taxPillText,
                  taxRatePercent === pill.value && styles.taxPillTextActive,
                ]}
              >
                {pill.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 6. Cash Live Preview Card */}
      {parsedDeposit > 0 && parsedInterestRate > 0 && (
        <View style={styles.cashPreviewCard}>
          <View style={styles.cashPreviewHeaderRow}>
            <Text style={styles.cashPreviewHeaderTitle}>ประมาณการกระแสเงินสดดอกเบี้ย</Text>
            <View
              style={[
                styles.taxStatusBadge,
                currentTaxPct === 0 ? styles.taxStatusBadgeFree : styles.taxStatusBadgeTaxed,
              ]}
            >
              <Text
                style={[
                  styles.taxStatusBadgeText,
                  currentTaxPct === 0 ? styles.taxStatusBadgeFreeText : styles.taxStatusBadgeTaxedText,
                ]}
              >
                {currentTaxPct === 0 ? 'ปลอดภาษี (0%)' : `หัก ณ ที่จ่าย ${currentTaxPct}%`}
              </Text>
            </View>
          </View>

          {/* First Cycle Pro-Rata Box if Partial */}
          {firstPayout.isPartialCycle && (
            <View style={styles.firstCycleBox}>
              <View style={styles.firstCycleHeaderRow}>
                <View style={styles.firstCycleTitleGroup}>
                  <Ionicons name="time" size={15} color="#1F7A52" />
                  <Text style={styles.firstCycleLabel}>
                    งวดแรกที่จะได้รับจริง ({firstPayout.daysLabel}):
                  </Text>
                </View>
                <Text style={styles.firstCycleAmount}>
                  ฿{firstPayout.netInterest.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
              <Text style={styles.firstCycleHint}>
                🕒 คำนวณดอกเบี้ยรายวันสะสม {firstPayout.daysHeld} วัน ({effectiveDepositDate} ถึง {nextScheduleDate}) ตามเกณฑ์ธนาคาร
              </Text>
            </View>
          )}

          <View style={styles.cashPreviewRow}>
            <Text style={styles.cashPreviewLabel}>ดอกเบี้ยรวมก่อนหักภาษี (Gross):</Text>
            <Text style={styles.cashPreviewMuted}>
              ฿{grossAnnual.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} /ปี
            </Text>
          </View>

          {currentTaxPct > 0 && (
            <View style={styles.cashPreviewRow}>
              <Text style={styles.cashPreviewLabel}>ภาษีหัก ณ ที่จ่าย ({currentTaxPct}%):</Text>
              <Text style={styles.cashPreviewTax}>
                -฿{annualTax.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} /ปี
              </Text>
            </View>
          )}

          <View style={[styles.cashPreviewRow, styles.cashPreviewTotalRow]}>
            <Text style={styles.cashPreviewHighlightLabel}>ดอกเบี้ยรับสุทธิต่อปี (Net Inflow):</Text>
            <Text style={styles.cashPreviewHighlight}>
              ฿{netAnnual.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>

          <View style={styles.cashPreviewRow}>
            <Text style={styles.cashPreviewLabel}>
              ดอกเบี้ยรับสุทธิต่องวดปกติ ({interestFrequency === 'MONTHLY' ? 'ต่อเดือน' : interestFrequency === 'SEMI_ANNUAL' ? 'งวดละ 6 เดือน' : 'ต่อปี'}):
            </Text>
            <Text style={styles.cashPreviewSub}>
              ฿{netPerPeriod.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {firstPayout.isPartialCycle ? '(เต็มงวด)' : ''}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: 16,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 15,
    fontFamily: fonts.thai,
    color: colors.ink,
    marginBottom: 14,
  },
  monoInput: {
    fontFamily: fonts.mono,
    fontWeight: '700',
  },
  dateLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  dateHintText: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 11,
    color: '#1F7A52',
  },
  dateInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: 16,
    paddingHorizontal: 14,
    minHeight: 48,
    marginBottom: 14,
  },
  dateInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: fonts.mono,
    color: colors.ink,
  },
  sectorChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  sectorChip: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectorChipActive: {
    backgroundColor: colors.ink,
  },
  sectorChipText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
    textAlign: 'center',
  },
  sectorChipTextActive: {
    color: colors.accent,
  },
  frequencyRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  frequencyBtn: {
    flex: 1,
    minHeight: 56,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 22,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frequencyBtnActive: {
    backgroundColor: colors.ink,
  },
  frequencyBtnText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
    textAlign: 'center',
  },
  frequencyBtnTextActive: {
    color: colors.accent,
  },
  taxSectionCard: {
    backgroundColor: '#EAF3EE',
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: 22,
    padding: 14,
    marginBottom: 14,
    gap: 12,
  },
  taxHeaderRow: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 8,
  },
  taxSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  autoTaxToggleBtn: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
  },
  autoTaxToggleBtnActive: {
    backgroundColor: colors.accent,
  },
  autoTaxToggleText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: fonts.mono,
    color: colors.ink,
  },
  taxAlertBox: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 16,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
  },
  taxAlertBoxNormal: {
    backgroundColor: colors.surface,
  },
  taxAlertBoxExceeded: {
    backgroundColor: '#FEF3C7',
  },
  taxAlertContent: {
    flex: 1,
    marginLeft: 8,
  },
  taxAlertTitle: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    marginBottom: 2,
  },
  taxAlertTitleNormal: {
    color: '#1F7A52',
  },
  taxAlertTitleExceeded: {
    color: '#B45309',
  },
  taxAlertDetail: {
    fontSize: 11,
    fontFamily: fonts.thai,
    color: colors.muted,
    lineHeight: 16,
  },
  taxAlertQuota: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: fonts.mono,
    color: '#1F7A52',
    marginTop: 4,
  },
  taxPillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  taxPill: {
    flex: 1,
    minHeight: 44,
    backgroundColor: colors.surface,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taxPillActive: {
    backgroundColor: colors.ink,
  },
  taxPillText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
    textAlign: 'center',
  },
  taxPillTextActive: {
    color: colors.accent,
  },
  cashPreviewCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 14,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    shadowColor: colors.shadow,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
    marginTop: 4,
    marginBottom: 14,
    gap: 8,
  },
  cashPreviewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingBottom: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: '#A9CDB9',
  },
  cashPreviewHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  taxStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  taxStatusBadgeFree: {
    backgroundColor: colors.accent,
  },
  taxStatusBadgeTaxed: {
    backgroundColor: '#FDE68A',
  },
  taxStatusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: fonts.mono,
  },
  taxStatusBadgeFreeText: {
    color: colors.ink,
  },
  taxStatusBadgeTaxedText: {
    color: '#92400E',
  },
  cashPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cashPreviewTotalRow: {
    paddingTop: 8,
    marginTop: 4,
    borderTopWidth: 1.5,
    borderTopColor: '#A9CDB9',
  },
  cashPreviewLabel: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: fonts.thai,
    fontWeight: '500',
  },
  cashPreviewHighlightLabel: {
    fontSize: 14,
    color: colors.ink,
    fontFamily: fonts.thaiBold,
    fontWeight: '700',
  },
  cashPreviewMuted: {
    fontSize: 13,
    color: colors.ink,
    fontFamily: fonts.mono,
    fontWeight: '600',
  },
  cashPreviewTax: {
    fontSize: 13,
    color: colors.lossOnLight,
    fontFamily: fonts.mono,
    fontWeight: '700',
  },
  cashPreviewHighlight: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: fonts.mono,
    color: '#1F7A52',
  },
  cashPreviewSub: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: fonts.mono,
    color: colors.ink,
  },
  firstCycleBox: {
    backgroundColor: '#EAF3EE',
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: 14,
    padding: 10,
    marginBottom: 6,
  },
  firstCycleHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  firstCycleTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  firstCycleLabel: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  firstCycleAmount: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fonts.mono,
    color: '#1F7A52',
  },
  firstCycleHint: {
    fontSize: 11,
    color: colors.muted,
    fontFamily: fonts.thai,
    lineHeight: 15,
  },
});

export default CashAssetForm;

