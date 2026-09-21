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
              <Ionicons name="apps-outline" size={18} color="#2563EB" />
              <Text style={styles.title}>{title}</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

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
                    <View style={[styles.iconBox, { backgroundColor: `${sec.color}15` }]}>
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
                    <Ionicons name="checkmark-circle" size={20} color="#2563EB" />
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
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  closeBtn: {
    padding: 4,
  },
  listScroll: {
    maxHeight: 380,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 4,
  },
  optionItemSelected: {
    backgroundColor: '#EFF6FF',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textCol: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  labelSelected: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  enLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  uncheckCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
});
