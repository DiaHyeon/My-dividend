/**
 * Loads the three Calm fonts. Verify the export names against the installed packages
 * (open node_modules/@expo-google-fonts/<pkg>/index.d.ts) before relying on them.
 *
 * Install:
 *   npx expo install expo-font @expo-google-fonts/bricolage-grotesque \
 *     @expo-google-fonts/jetbrains-mono @expo-google-fonts/noto-sans-thai
 */
import { useFonts } from 'expo-font';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { JetBrainsMono_500Medium, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';
import { NotoSansThai_500Medium, NotoSansThai_700Bold } from '@expo-google-fonts/noto-sans-thai';

export function useCalmFonts() {
  return useFonts({
    BricolageGrotesque_800ExtraBold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
    NotoSansThai_500Medium,
    NotoSansThai_700Bold,
  });
}
