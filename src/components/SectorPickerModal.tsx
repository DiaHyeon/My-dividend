// คอมโพเนนต์ป๊อปอัปเลือกกลุ่มอุตสาหกรรม (Sector / Segment Picker Modal) สำหรับจัดหมวดหมู่สินทรัพย์หุ้น กองทุน และเงินฝาก
import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AssetType } from '../types/database';
import { getSectorsForType, SectorDefinition } from '../services/sectorService';
import { colors, borderWidth, radii, fonts } from '../theme/tokens';
import { DashedDivider } from './ui/DashedDivider';

export interface SectorPickerModalProps {
  visible: boolean;
  assetType: AssetType;
  selectedSector: string;
  onSelectSector: (sectorId: string) => void;
  onClose: () => void;
}

export const SectorPickerModal: React.FC<SectorPickerModalProps> = ({
  visible,
  assetType,
  selectedSector,
  onSelectSector,
  onClose,
}) => {
  if (!visible) return null;

  const sectors: SectorDefinition[] = getSectorsForType(assetType);

  const title =
    assetType === 'FUNDS'
      ? 'เลือกประเภทกองทุน'
      : assetType === 'CASH'
      ? 'เลือกประเภทบัญชีเงินฝาก'
      : 'เลือกกลุ่มอุตสาหกรรม (Segment)';

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
            <View style={styles.titleRow}>
              <View style={styles.iconCircle}>
                <Ionicons name="apps-outline" size={17} color="#1F7A52" />
              </View>
              <Text style={styles.title}>{title}</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={18} color={colors.ink} />
            </TouchableOpacity>
          </View>

          <DashedDivider color="#A9CDB9" marginVertical={10} />

          {/* Sector Options List */}
          <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
            {sectors.map((sec) => {
              const isSelected = selectedSector === sec.id;
              return (
                <TouchableOpacity
                  key={sec.id}
                  style={[styles.optionItem, isSelected && styles.optionItemSelected]}
                  onPress={() => {
                    onSelectSector(sec.id);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.optionLeft}>
                    <View style={[styles.iconBox, { backgroundColor: `${sec.color}18` }]}>
                      <Ionicons name={sec.icon as any} size={17} color={sec.color} />
                    </View>
                    <View style={styles.textCol}>
                      <Text style={[styles.label, isSelected && styles.labelSelected]}>
                        {sec.label}
                      </Text>
                      {sec.enLabel && <Text style={styles.enLabel}>{sec.enLabel}</Text>}
                    </View>
                  </View>
                  {isSelected ? (
                    <Ionicons name="checkmark-circle" size={22} color="#1F7A52" />
                  ) : (
                    <View style={styles.uncheckCircle} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.scrim,
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
    width: '90%',
    maxWidth: 360,
    maxHeight: '75%',
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    padding: 16,
    shadowColor: colors.shadow,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: '#EAF3EE',
    borderWidth: borderWidth,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listScroll: {
    maxHeight: 380,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginBottom: 6,
    borderWidth: borderWidth,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
  },
  optionItemSelected: {
    backgroundColor: '#EAF3EE',
    borderColor: colors.ink,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textCol: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  labelSelected: {
    color: '#1F7A52',
  },
  enLabel: {
    fontSize: 11.5,
    fontFamily: fonts.mono,
    color: colors.muted,
    marginTop: 1,
  },
  uncheckCircle: {
    width: 20,
    height: 20,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: '#A9CDB9',
  },
});

