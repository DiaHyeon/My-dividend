import React from 'react';
import { Pressable, View } from 'react-native';
import { borderWidth, colors, minHitSize, radii } from '../../theme/tokens';
import { CalmText } from './CalmText';

type Props = {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
};

/**
 * Visual frame for bottom sheets: scrim + rounded sheet + grab handle + 44px close button.
 * Render it INSIDE the existing <Modal transparent animationType="slide"> of each current modal,
 * replacing only its outer container. Keep all the modal's own logic/content as children.
 * Example:
 *   <Modal visible transparent animationType="slide" onRequestClose={onClose}>
 *     <SheetFrame title="ต.ค. 2026" onClose={onClose}> ...existing content... </SheetFrame>
 *   </Modal>
 */
export function SheetFrame({ title, onClose, children }: Props) {
  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }}>
      <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="ปิด" />
      <View
        style={{
          backgroundColor: colors.surface,
          borderTopWidth: borderWidth,
          borderColor: colors.ink,
          borderTopLeftRadius: radii.sheet,
          borderTopRightRadius: radii.sheet,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 32,
        }}
      >
        <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 999, backgroundColor: colors.shadow, marginBottom: 12 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {title ? <CalmText variant="display" size={24}>{title}</CalmText> : <View />}
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="ปิด"
            style={{ width: minHitSize, height: minHitSize, borderRadius: 999, borderWidth, borderColor: colors.ink, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}
          >
            <CalmText variant="mono" size={16}>✕</CalmText>
          </Pressable>
        </View>
        {children}
      </View>
    </View>
  );
}
