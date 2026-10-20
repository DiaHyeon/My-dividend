import React from 'react';
import { Pressable, View, ViewStyle, StyleProp } from 'react-native';
import { borderWidth, colors, minHitSize, radii } from '../../theme/tokens';
import { CalmText } from './CalmText';
import { HardShadow } from './HardShadow';

type Props = {
  label?: string;
  /** any icon element (Ionicons etc.); it is tinted by you, use the same colour as the label */
  icon?: React.ReactNode;
  variant?: 'ink' | 'surface' | 'accent';
  hardShadow?: boolean;
  /** 44 (default) or e.g. 60 for a round FAB when label is omitted */
  height?: number;
  round?: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const LOOK = {
  ink: { bg: colors.ink, fg: colors.accent },
  surface: { bg: colors.surface, fg: colors.ink },
  accent: { bg: colors.accent, fg: colors.ink },
} as const;

/**
 * Example:
 *   <CapsuleButton variant="ink" label="นำเข้า CSV" onPress={...} />
 *   <CapsuleButton variant="ink" round height={60} hardShadow icon={<Ionicons name="add" size={28} color={colors.accent} />} accessibilityLabel="เพิ่มสินทรัพย์" onPress={...} />
 */
export function CapsuleButton({ label, icon, variant = 'ink', hardShadow = false, height = minHitSize, round = false, disabled, onPress, accessibilityLabel, style }: Props) {
  const l = LOOK[variant];
  const body: ViewStyle = {
    backgroundColor: l.bg,
    borderWidth,
    borderColor: colors.ink,
    borderRadius: radii.pill,
    minHeight: Math.max(height, minHitSize),
    minWidth: round ? Math.max(height, minHitSize) : undefined,
    paddingHorizontal: round ? 0 : 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    opacity: disabled ? 0.5 : 1,
  };
  const btn = (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled }} style={[body, style]}>
      {icon ? <View>{icon}</View> : null}
      {label ? <CalmText variant="mono" size={12} color={l.fg}>{label}</CalmText> : null}
    </Pressable>
  );
  return hardShadow ? <HardShadow size="md" radius={radii.pill}>{btn}</HardShadow> : btn;
}
