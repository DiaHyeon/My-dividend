/**
 * Calm Mint design tokens — the single source of truth for the theme.
 * Never hard-code a hex colour, radius, or font name in a screen. Import from here.
 */
import type { TextStyle, ViewStyle } from 'react-native';

export const colors = {
  bg: '#EAF3EE',            // page background
  surface: '#FBFFFD',       // light cards, sheets, tab bar
  ink: '#123D2A',           // text, borders, dark cards
  accent: '#6FCDA8',        // mint: ONLY on dark surfaces, or as a pill/bar fill. Never as text on `surface`.
  shadow: '#A9CDB9',        // hard shadow + dashed lines
  track: '#D5E6DC',         // progress-bar rail
  divider: '#C9DDD1',
  muted: '#4F6B5C',         // secondary text, placeholders (passes contrast on surface)
  projected: '#BFE9D3',     // projected / pending bars
  gainOnLight: '#1F7A52',
  lossOnLight: '#B4412D',
  gainOnDark: '#6FCDA8',
  lossOnDark: '#F5A593',
  scrim: 'rgba(18, 61, 42, 0.45)',
} as const;

/** Asset-category + chart colours (same set in Overview bars, donut, legends). */
export const chartColors = {
  stocks: '#6FCDA8',
  funds: '#C7B8F5',
  cash: '#F2C879',
  benchmark: '#C7B8F5',
} as const;

export const radii = { card: 26, sheet: 30, field: 16, pill: 999 } as const;
export const borderWidth = 2;
/** Hard (non-blurred) shadow offsets in px. */
export const shadowOffset = { sm: 3, md: 4, lg: 6 } as const;
export const minFontSize = 11;
export const minHitSize = 44;

/**
 * Font family NAMES must equal the export names of the @expo-google-fonts packages.
 * On React Native each weight is its own family: do NOT also set fontWeight when using these.
 */
export const fonts = {
  display: 'BricolageGrotesque_800ExtraBold', // Latin letters + digits only (no Thai glyphs)
  mono: 'JetBrainsMono_700Bold',
  monoRegular: 'JetBrainsMono_500Medium',
  thai: 'NotoSansThai_500Medium',
  thaiBold: 'NotoSansThai_700Bold',
} as const;

/** Text-field look for forms / modals (AddAsset, EditAsset, Sell, Import...). */
export const inputStyle: ViewStyle & TextStyle = {
  backgroundColor: colors.surface,
  borderWidth: borderWidth,
  borderColor: colors.ink,
  borderRadius: radii.field,
  paddingHorizontal: 14,
  minHeight: minHitSize,
  color: colors.ink,
  fontFamily: fonts.thai,
  fontSize: 15,
};

export type Trend = { glyph: '▲' | '▼' | ''; color: string };

/**
 * Colour + glyph for a gain/loss number. Always render the glyph next to the number:
 * colour alone is not enough (colour-blind users, bright sunlight).
 */
export function trend(value: number, onDark = false): Trend {
  if (value > 0) return { glyph: '▲', color: onDark ? colors.gainOnDark : colors.gainOnLight };
  if (value < 0) return { glyph: '▼', color: onDark ? colors.lossOnDark : colors.lossOnLight };
  return { glyph: '', color: onDark ? colors.surface : colors.ink };
}
