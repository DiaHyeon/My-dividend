import React from 'react';
import { Text, TextProps, TextStyle, StyleProp } from 'react-native';
import { colors, fonts, minFontSize } from '../../theme/tokens';

type Variant = 'display' | 'mono' | 'monoRegular' | 'body' | 'bodyBold';
type Props = TextProps & { variant?: Variant; size?: number; color?: string; style?: StyleProp<TextStyle> };

const THAI = /[\u0E00-\u0E3E\u0E40-\u0E7F]/;
function hasThai(node: React.ReactNode): boolean {
  return React.Children.toArray(node).some((c) =>
    typeof c === 'string' || typeof c === 'number' ? THAI.test(String(c)) : React.isValidElement(c) ? hasThai((c.props as { children?: React.ReactNode }).children) : false
  );
}

const DEFAULT_SIZE: Record<Variant, number> = { display: 26, mono: 12, monoRegular: 11, body: 14, bodyBold: 14 };

/**
 * Theme text. Safe by design:
 *  - never below 11px
 *  - negative letterSpacing only for Latin/digits (Thai vowels would collide)
 *  - if a `display` / `mono` text contains Thai, it switches to the Thai font automatically
 * Example: <CalmText variant="display" size={40}>฿66,871.74</CalmText>
 */
export function CalmText({ variant = 'body', size, color = colors.ink, style, children, ...rest }: Props) {
  const fontSize = Math.max(size ?? DEFAULT_SIZE[variant], minFontSize);
  const thai = hasThai(children);
  let fontFamily: string = fonts.thai;
  if (variant === 'display') fontFamily = thai ? fonts.thaiBold : fonts.display;
  else if (variant === 'mono') fontFamily = thai ? fonts.thaiBold : fonts.mono;
  else if (variant === 'monoRegular') fontFamily = thai ? fonts.thai : fonts.monoRegular;
  else if (variant === 'bodyBold') fontFamily = fonts.thaiBold;
  const letterSpacing = variant === 'display' && !thai ? -fontSize * 0.03 : undefined;
  return (
    <Text {...rest} style={[{ fontFamily, fontSize, color, letterSpacing }, style]}>
      {children}
    </Text>
  );
}
