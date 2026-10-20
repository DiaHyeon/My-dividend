import React from 'react';
import { Pressable, View, ViewStyle, StyleProp } from 'react-native';
import { borderWidth, colors, radii } from '../../theme/tokens';
import { CalmText } from './CalmText';

export type PillKind = 'outline' | 'outlineDark' | 'ink' | 'accent' | 'lossDark' | 'dashed';
type Props = {
  kind?: PillKind;
  label: string;
  size?: 'sm' | 'md';
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const LOOK: Record<PillKind, { bg: string; fg: string; border: string; dashed?: boolean }> = {
  outline: { bg: 'transparent', fg: colors.ink, border: colors.ink },
  outlineDark: { bg: 'transparent', fg: colors.surface, border: colors.shadow }, // outline pill on a dark card
  ink: { bg: colors.ink, fg: colors.accent, border: colors.ink },
  accent: { bg: colors.accent, fg: colors.ink, border: colors.ink },       // e.g. gain badge, [Dividend]
  lossDark: { bg: colors.lossOnDark, fg: colors.ink, border: colors.ink }, // loss badge on dark cards
  dashed: { bg: colors.surface, fg: colors.ink, border: colors.ink, dashed: true }, // [Special]
};

/**
 * Capsule tag / badge / filter chip.
 * Examples:
 *   <Pill kind="accent" label="▲ +0.47%" />       gain badge on a dark card
 *   <Pill kind="lossDark" label="▼ -0.10%" />      loss badge on a dark card
 *   <Pill kind="ink" label="Received" />
 *   <Pill kind="outline" label="Interest" />
 *   <Pill kind="outlineDark" label="ปีแรก" />       outline pill on a dark card
 *   <Pill kind="outline" label="หุ้น" onPress={...} />  filter chip (hit area is padded to 44px)
 */
export function Pill({ kind = 'outline', label, size = 'sm', onPress, accessibilityLabel, style }: Props) {
  const l = LOOK[kind];
  const body: ViewStyle = {
    backgroundColor: l.bg,
    borderWidth,
    borderColor: l.border,
    borderStyle: l.dashed ? 'dashed' : 'solid',
    borderRadius: radii.pill,
    paddingHorizontal: size === 'sm' ? 10 : 14,
    paddingVertical: size === 'sm' ? 2 : 6,
    alignSelf: 'flex-start',
  };
  const text = <CalmText variant="mono" size={size === 'sm' ? 11 : 12} color={l.fg}>{label}</CalmText>;
  if (!onPress) return <View style={[body, style]}>{text}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} style={[body, style]}>
      {text}
    </Pressable>
  );
}
