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
          placeholderTextColor="#94A3B8"
        />
      </View>

      {/* 2. Cash Segment Selector */}
      <Text style={styles.label}>ประเภทบัญชีเงินฝาก (Segment)</Text>
      <View style={styles.sectorChipsContainer}>
        {getSectorsForType('CASH').map((sec) => (
          <TouchableOpacity
            key={sec.id}
            style={[
              styles.sectorChip,
              selectedSector === sec.id && { backgroundColor: sec.color, borderColor: sec.color },
            ]}
            onPress={() => onChangeSector(sec.id)}
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

      {/* 3. Deposit Amount & Interest Rate */}
      <Text style={styles.label}>จำนวนเงินฝาก (฿ THB) *</Text>
      <TextInput
        style={styles.input}
        value={depositAmount}
        onChangeText={onChangeDepositAmount}
        placeholder="ระบุจำนวนเงินฝาก เช่น 50000"
        placeholderTextColor="#94A3B8"
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>อัตราดอกเบี้ยต่อปี (% p.a.) *</Text>
      <TextInput
        style={styles.input}
        value={interestRate}
        onChangeText={onChangeInterestRate}
        placeholder="เช่น 1.5, 2.2, 3.0"
        placeholderTextColor="#94A3B8"
        keyboardType="decimal-pad"
      />

      {/* 3.1 Deposit Start Date */}
      {onChangeDepositDate && (
        <View style={styles.inputGroup}>
          <View style={styles.dateLabelRow}>
            <Text style={styles.label}>วันที่เริ่มฝาก (ปี-เดือน-วัน)</Text>
            <Text style={styles.dateHintText}>คำนวณดอกเบี้ยตามวันจริง</Text>
          </View>
          <TextInput
            style={styles.input}
            value={depositDate}
            onChangeText={onChangeDepositDate}
            placeholder="YYYY-MM-DD เช่น 2026-10-15"
            placeholderTextColor="#94A3B8"
          />
        </View>
      )}

      {/* 4. Payout Frequency */}
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

      {/* 5. Withholding Tax Rate & 20,000 THB Rule */}
      <View style={styles.taxHeaderRow}>
        <Text style={styles.label}>ภาษีดอกเบี้ยหัก ณ ที่จ่าย (%)</Text>
        <TouchableOpacity
          style={[styles.autoTaxToggleBtn, isAutoCashTax && styles.autoTaxToggleBtnActive]}
          onPress={onToggleAutoTax}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isAutoCashTax ? 'sparkles' : 'hand-left-outline'}
            size={12}
            color={isAutoCashTax ? '#059669' : '#64748B'}
          />
          <Text style={[styles.autoTaxToggleText, isAutoCashTax && styles.autoTaxToggleTextActive]}>
            {isAutoCashTax ? 'คำนวณอัตโนมัติ (เกณฑ์ 20,000฿)' : 'กำหนดเอง'}
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
            color={cashTaxEval.isExceededLimit ? '#D97706' : '#059669'}
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
          { label: '0% ยกเว้นภาษี (ไม่เกิน 20,000/ปลอดภาษี)', value: '0' },
          { label: '15% หัก ณ ที่จ่าย (เกิน 20,000/ฝากประจำ)', value: '15' },
        ].map((pill) => (
          <TouchableOpacity
            key={pill.value}
            style={[
              styles.taxPill,
              taxRatePercent === pill.value && styles.taxPillActive,
            ]}
            onPress={() => onChangeTaxRatePercent(pill.value)}
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
                {currentTaxPct === 0 ? 'ปลอดภาษี (0%)' : `หักภาษี ณ ที่จ่าย ${currentTaxPct}%`}
              </Text>
            </View>
          </View>

          {/* First Cycle Pro-Rata Box if Partial */}
          {firstPayout.isPartialCycle && (
            <View style={styles.firstCycleBox}>
              <View style={styles.firstCycleHeaderRow}>
                <View style={styles.firstCycleTitleGroup}>
                  <Ionicons name="time" size={15} color="#059669" />
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
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 14,
  },
  sectorChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  sectorChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 6,
  },
  sectorChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  sectorChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  frequencyRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  frequencyBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  frequencyBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  frequencyBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'center',
  },
  frequencyBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  taxHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  autoTaxToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    gap: 4,
  },
  autoTaxToggleBtnActive: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  autoTaxToggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  autoTaxToggleTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  taxAlertBox: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
  },
  taxAlertBoxNormal: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  taxAlertBoxExceeded: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  taxAlertContent: {
    flex: 1,
    marginLeft: 8,
  },
  taxAlertTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  taxAlertTitleNormal: {
    color: '#15803D',
  },
  taxAlertTitleExceeded: {
    color: '#B45309',
  },
  taxAlertDetail: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 15,
  },
  taxAlertQuota: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
    marginTop: 4,
  },
  taxPillRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  taxPill: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  taxPillActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  taxPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'center',
  },
  taxPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  cashPreviewCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginTop: 4,
    marginBottom: 14,
    gap: 6,
  },
  cashPreviewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#D1FAE5',
  },
  cashPreviewHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
  },
  taxStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  taxStatusBadgeFree: {
    backgroundColor: '#DCFCE7',
  },
  taxStatusBadgeTaxed: {
    backgroundColor: '#FEF3C7',
  },
  taxStatusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  taxStatusBadgeFreeText: {
    color: '#15803D',
  },
  taxStatusBadgeTaxedText: {
    color: '#B45309',
  },
  cashPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cashPreviewTotalRow: {
    paddingTop: 6,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: '#D1FAE5',
  },
  cashPreviewLabel: {
    fontSize: 12,
    color: '#065F46',
    fontWeight: '500',
  },
  cashPreviewHighlightLabel: {
    fontSize: 13,
    color: '#065F46',
    fontWeight: '700',
  },
  cashPreviewMuted: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  cashPreviewTax: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
  },
  cashPreviewHighlight: {
    fontSize: 17,
    fontWeight: '800',
    color: '#059669',
  },
  cashPreviewSub: {
    fontSize: 13,
    fontWeight: '700',
    color: '#047857',
  },
  dateLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  dateHintText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
  },
  firstCycleBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#6EE7B7',
    borderRadius: 10,
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
    gap: 5,
  },
  firstCycleLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
  firstCycleAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#059669',
  },
  firstCycleHint: {
    fontSize: 10.5,
    color: '#059669',
    lineHeight: 15,
  },
});

export default CashAssetForm;
