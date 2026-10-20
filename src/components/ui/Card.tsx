import React from 'react';
import { Pressable, View, ViewStyle, StyleProp } from 'react-native';
import { borderWidth, colors, radii } from '../../theme/tokens';
import { HardShadow } from './HardShadow';

type Props = {
  /** 'surface' = light card, 'dark' = ink card (hero / donut / performance) */
  variant?: 'surface' | 'dark';
  /** 'md' 4px for normal cards, 'lg' 6px for the featured card of a screen */
  shadow?: 'sm' | 'md' | 'lg' | 'none';
  padding?: number;
  radius?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/**
 * Example:
 *   <Card variant="dark" shadow="lg" padding={18}> ...hero content... </Card>
 *   <Card onPress={openCategory} accessibilityLabel="Stocks"> ... </Card>
 */
export function Card({ variant = 'surface', shadow = 'md', padding = 16, radius = radii.card, onPress, accessibilityLabel, style, children }: Props) {
  const body: ViewStyle = {
    backgroundColor: variant === 'dark' ? colors.ink : colors.surface,
    borderWidth,
    borderColor: colors.ink,
    borderRadius: radius,
    padding,
  };
  const inner = onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={[body, style]}>
      {children}
    </Pressable>
  ) : (
    <View style={[body, style]}>{children}</View>
  );
  if (shadow === 'none') return inner;
  return <HardShadow size={shadow} radius={radius}>{inner}</HardShadow>;
}
