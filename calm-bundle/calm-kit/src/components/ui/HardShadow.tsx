import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { colors, radii, shadowOffset } from '../../theme/tokens';

type Props = {
  /** 'sm' 3px, 'md' 4px (default), 'lg' 6px */
  size?: keyof typeof shadowOffset;
  radius?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/**
 * Non-blurred offset shadow that looks identical on iOS and Android
 * (elevation can't do this). A coloured View sits behind the content, shifted down-right.
 * The shadow extends `offset` px beyond the content: leave room, and avoid overflow:'hidden' on the parent.
 * Example: <HardShadow size="lg" radius={26}><View .../></HardShadow>
 */
export function HardShadow({ size = 'md', radius = radii.card, color = colors.shadow, style, children }: Props) {
  const o = shadowOffset[size];
  return (
    <View style={[{ position: 'relative' }, style]}>
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: o, left: o, right: -o, bottom: -o, backgroundColor: color, borderRadius: radius }}
      />
      {children}
    </View>
  );
}
