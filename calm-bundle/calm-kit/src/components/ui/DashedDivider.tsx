import React from 'react';
import Svg, { Line } from 'react-native-svg';
import { colors } from '../../theme/tokens';

type Props = { color?: string; thickness?: number; marginVertical?: number };

/**
 * Full-width dashed line (borderStyle:'dashed' can't draw a single line reliably).
 * Use `color={colors.accent}` inside dark cards, default (sage) elsewhere.
 * Example: <DashedDivider marginVertical={12} />
 */
export function DashedDivider({ color = colors.shadow, thickness = 2, marginVertical = 8 }: Props) {
  return (
    <Svg width="100%" height={thickness} style={{ marginVertical }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Line x1="0" y1={thickness / 2} x2="100%" y2={thickness / 2} stroke={color} strokeWidth={thickness} strokeDasharray="6 4" />
    </Svg>
  );
}
