import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const GOAL_STORAGE_KEY = '@mydividend_monthly_goal';

export interface GoalPreset {
  id: string;
  level: number;
  label: string;
  icon: string;
  amount: number;
  description: string;
}

export const GOAL_PRESETS: GoalPreset[] = [
  {
    id: 'lvl1',
    level: 1,
    label: 'Level 1: กาแฟ & อินเทอร์เน็ต',
    icon: 'cafe-outline',
    amount: 1000,
    description: '฿1,000 / เดือน (฿12,000/ปี)',
  },
  {
    id: 'lvl2',
    level: 2,
    label: 'Level 2: ค่าน้ำ-ค่าไฟ-ค่าเน็ต',
    icon: 'flash-outline',
    amount: 3000,
    description: '฿3,000 / เดือน (฿36,000/ปี)',
  },
  {
    id: 'lvl3',
    level: 3,
    label: 'Level 3: ค่าอาหาร & กินอยู่พื้นฐาน',
    icon: 'restaurant-outline',
    amount: 10000,
    description: '฿10,000 / เดือน (฿120,000/ปี)',
  },
  {
    id: 'lvl4',
    level: 4,
    label: 'Level 4: อิสรภาพการเงิน (Lean FIRE)',
    icon: 'sunny-outline',
    amount: 30000,
    description: '฿30,000 / เดือน (฿360,000/ปี)',
  },
];

interface GoalSettingsModalProps {
  visible: boolean;
  currentGoal: number;
  onClose: () => void;
  onSave: (newGoal: number) => void;
}

export const GoalSettingsModal: React.FC<GoalSettingsModalProps> = ({
  visible,
  currentGoal,
  onClose,
  onSave,
}) => {
  const [selectedPresetId, setSelectedPresetId] = useState<string>('lvl2');
  const [customAmountText, setCustomAmountText] = useState<string>('');
  const [isCustom, setIsCustom] = useState<boolean>(false);

  useEffect(() => {
    if (visible) {
      const match = GOAL_PRESETS.find((p) => p.amount === currentGoal);
      if (match) {
        setSelectedPresetId(match.id);
        setIsCustom(false);
        setCustomAmountText('');
      } else {
        setSelectedPresetId('custom');
        setIsCustom(true);
        setCustomAmountText(currentGoal > 0 ? currentGoal.toString() : '3000');
      }
    }
  }, [visible, currentGoal]);

  const handleSelectPreset = (preset: GoalPreset) => {
    setSelectedPresetId(preset.id);
    setIsCustom(false);
    setCustomAmountText('');
  };

  const handleSelectCustom = () => {
    setSelectedPresetId('custom');
    setIsCustom(true);
    if (!customAmountText) {
      setCustomAmountText(currentGoal > 0 ? currentGoal.toString() : '5000');
    }
  };

  const handleConfirm = async () => {
    let finalAmount = 3000;
    if (isCustom) {
      const parsed = parseFloat(customAmountText.replace(/,/g, ''));
      finalAmount = !isNaN(parsed) && parsed > 0 ? parsed : 3000;
    } else {
      const preset = GOAL_PRESETS.find((p) => p.id === selectedPresetId);
      finalAmount = preset ? preset.amount : 3000;
    }

    try {
      await AsyncStorage.setItem(GOAL_STORAGE_KEY, finalAmount.toString());
    } catch (err) {
      console.warn('Failed to save goal to AsyncStorage', err);
    }

    onSave(finalAmount);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheetContainer}>
          {/* Sheet Handle */}
          <View style={styles.dragHandle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIconCircle}>
                <Ionicons name="flag-outline" size={18} color="#059669" />
              </View>
              <View>
                <Text style={styles.title}>เป้าหมายกระแสเงินสดรายเดือน</Text>
                <Text style={styles.subtitle}>กำหนดเป้าหมายปันผล & ดอกเบี้ยเพื่อพิชิตในชีวิตจริง</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionLabel}>เลือกระดับเป้าหมาย (Milestone Presets)</Text>

            {GOAL_PRESETS.map((preset) => {
              const isSelected = !isCustom && selectedPresetId === preset.id;
              return (
                <TouchableOpacity
                  key={preset.id}
                  style={[styles.presetCard, isSelected && styles.presetCardSelected]}
                  activeOpacity={0.7}
                  onPress={() => handleSelectPreset(preset)}
                >
                  <View style={styles.presetLeft}>
                    <View
                      style={[
                        styles.presetIconBox,
                        isSelected ? styles.presetIconBoxSelected : styles.presetIconBoxInactive,
                      ]}
                    >
                      <Ionicons
                        name={preset.icon as any}
                        size={18}
                        color={isSelected ? '#059669' : '#64748B'}
                      />
                    </View>
                    <View style={styles.presetTextCol}>
                      <Text style={[styles.presetLabel, isSelected && styles.presetLabelSelected]}>
                        {preset.label}
                      </Text>
                      <Text style={styles.presetDesc}>{preset.description}</Text>
                    </View>
                  </View>

                  <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                    {isSelected && <View style={styles.radioInnerDot} />}
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Custom Option */}
            <TouchableOpacity
              style={[styles.presetCard, isCustom && styles.presetCardSelected]}
              activeOpacity={0.7}
              onPress={handleSelectCustom}
            >
              <View style={styles.presetLeft}>
                <View
                  style={[
                    styles.presetIconBox,
                    isCustom ? styles.presetIconBoxSelected : styles.presetIconBoxInactive,
                  ]}
                >
                  <Ionicons
                    name="create-outline"
                    size={18}
                    color={isCustom ? '#059669' : '#64748B'}
                  />
                </View>
                <View style={styles.presetTextCol}>
                  <Text style={[styles.presetLabel, isCustom && styles.presetLabelSelected]}>
                    กำหนดเป้าหมายเอง (Custom Target)
                  </Text>
                  <Text style={styles.presetDesc}>ระบุตัวเลขบาทต่อเดือนที่ต้องการ</Text>
                </View>
              </View>

              <View style={[styles.radioCircle, isCustom && styles.radioCircleSelected]}>
                {isCustom && <View style={styles.radioInnerDot} />}
              </View>
            </TouchableOpacity>

            {isCustom && (
              <View style={styles.customInputBox}>
                <Text style={styles.inputPrefix}>฿</Text>
                <TextInput
                  style={styles.customTextInput}
                  keyboardType="numeric"
                  placeholder="เช่น 5,000"
                  placeholderTextColor="#94A3B8"
                  value={customAmountText}
                  onChangeText={setCustomAmountText}
                  autoFocus
                />
                <Text style={styles.inputSuffix}>/ เดือน</Text>
              </View>
            )}

            <View style={{ height: 24 }} />
          </ScrollView>

          {/* Action Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>ยกเลิก</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleConfirm} activeOpacity={0.8}>
              <Ionicons name="checkmark" size={18} color="#FFFFFF" />
              <Text style={styles.saveBtnText}>บันทึกเป้าหมาย</Text>
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
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  backdrop: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 20,
  },
  dragHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#CBD5E1',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  closeBtn: {
    padding: 6,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 12,
  },
  presetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  presetCardSelected: {
    backgroundColor: '#F0FDF4',
    borderColor: '#10B981',
  },
  presetLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  presetIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetIconBoxSelected: {
    backgroundColor: '#D1FAE5',
  },
  presetIconBoxInactive: {
    backgroundColor: '#F1F5F9',
  },
  presetTextCol: {
    flex: 1,
  },
  presetLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  presetLabelSelected: {
    color: '#065F46',
  },
  presetDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: '#10B981',
  },
  radioInnerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
  },
  customInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
    marginBottom: 12,
  },
  inputPrefix: {
    fontSize: 18,
    fontWeight: '700',
    color: '#059669',
    marginRight: 6,
  },
  customTextInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    padding: 0,
  },
  inputSuffix: {
    fontSize: 13,
    color: '#64748B',
    marginLeft: 6,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
