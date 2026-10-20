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
import { SheetFrame } from './ui/SheetFrame';
import { Pill } from './ui/Pill';
import { CalmText } from './ui/CalmText';
import { CapsuleButton } from './ui/CapsuleButton';
import { colors, fonts, inputStyle } from '../theme/tokens';

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
        style={{ flex: 1 }}
      >
        <SheetFrame title="ตั้งเป้าหมายเงินปันผล" onClose={onClose}>
          <CalmText variant="monoRegular" size={12} color={colors.muted} style={{ marginBottom: 12 }}>
            กำหนดเป้าหมายปันผล & ดอกเบี้ยเพื่อพิชิตในชีวิตจริง
          </CalmText>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            <CalmText variant="bodyBold" size={13} color={colors.ink} style={{ marginBottom: 10 }}>
              เลือกระดับเป้าหมาย (Milestone Presets)
            </CalmText>

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
                        color={colors.ink}
                      />
                    </View>
                    <View style={styles.presetTextCol}>
                      <CalmText variant="bodyBold" size={13} color={colors.ink}>
                        {preset.label}
                      </CalmText>
                      <CalmText variant="monoRegular" size={11} color={colors.muted} style={{ marginTop: 2 }}>
                        {preset.description}
                      </CalmText>
                    </View>
                  </View>

                  <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                    {isSelected && <Ionicons name="checkmark" size={12} color={colors.surface} />}
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
                    color={colors.ink}
                  />
                </View>
                <View style={styles.presetTextCol}>
                  <CalmText variant="bodyBold" size={13} color={colors.ink}>
                    กำหนดเป้าหมายเอง (Custom Target)
                  </CalmText>
                  <CalmText variant="monoRegular" size={11} color={colors.muted} style={{ marginTop: 2 }}>
                    ระบุตัวเลขบาทต่อเดือนที่ต้องการ
                  </CalmText>
                </View>
              </View>

              <View style={[styles.radioCircle, isCustom && styles.radioCircleSelected]}>
                {isCustom && <Ionicons name="checkmark" size={12} color={colors.surface} />}
              </View>
            </TouchableOpacity>

            {isCustom && (
              <View style={styles.customInputBox}>
                <CalmText variant="mono" size={16} color={colors.ink} style={{ marginRight: 6 }}>
                  ฿
                </CalmText>
                <TextInput
                  style={[styles.customTextInput, { fontFamily: fonts.mono }]}
                  keyboardType="numeric"
                  placeholder="เช่น 5,000"
                  placeholderTextColor={colors.muted}
                  value={customAmountText}
                  onChangeText={setCustomAmountText}
                  autoFocus
                />
                <CalmText variant="monoRegular" size={12} color={colors.muted} style={{ marginLeft: 6 }}>
                  / เดือน
                </CalmText>
              </View>
            )}

            <View style={{ height: 16 }} />
          </ScrollView>

          {/* Action Footer */}
          <View style={styles.footer}>
            <View style={{ flex: 1 }}>
              <CapsuleButton variant="surface" label="ยกเลิก" onPress={onClose} />
            </View>
            <View style={{ flex: 1.5 }}>
              <CapsuleButton
                variant="ink"
                label="บันทึกเป้าหมาย"
                icon={<Ionicons name="checkmark" size={16} color={colors.accent} />}
                onPress={handleConfirm}
              />
            </View>
          </View>
        </SheetFrame>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  scrollArea: {
    maxHeight: 440,
  },
  presetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    minHeight: 52,
  },
  presetCardSelected: {
    backgroundColor: colors.track,
    borderColor: colors.ink,
  },
  presetLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  presetIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetIconBoxSelected: {
    backgroundColor: colors.accent,
  },
  presetIconBoxInactive: {
    backgroundColor: colors.surface,
  },
  presetTextCol: {
    flex: 1,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  radioCircleSelected: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  customInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
    marginBottom: 10,
    minHeight: 48,
  },
  customTextInput: {
    flex: 1,
    fontSize: 16,
    color: colors.ink,
    padding: 0,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 12,
  },
});
