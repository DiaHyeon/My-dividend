import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, Animated, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { subscribeOfflineNotice } from '../services/portfolioCacheService';
import { colors, fonts, radii } from '../theme/tokens';

export const OfflineNoticeToast: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('เชื่อมต่อไม่ได้ · แสดงข้อมูลล่าสุดในเครื่อง');

  const opacityAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(12)).current;
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeOfflineNotice((customMessage) => {
      if (customMessage) {
        setMessage(customMessage);
      } else {
        setMessage('เชื่อมต่อไม่ได้ · แสดงข้อมูลล่าสุดในเครื่อง');
      }

      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }

      setVisible(true);

      // Animate in
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(translateYAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto dismiss after 2.6 seconds
      hideTimerRef.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(translateYAnim, {
            toValue: 8,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setVisible(false);
        });
      }, 2600);
    });

    return () => {
      unsubscribe();
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [opacityAnim, translateYAnim]);

  if (!visible) return null;

  // Position nicely above docked bottom bar
  const bottomOffset = Math.max(insets.bottom, 10) + 64;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        {
          bottom: bottomOffset,
          opacity: opacityAnim,
          transform: [{ translateY: translateYAnim }],
        },
      ]}
    >
      <Ionicons name="information-circle" size={17} color={colors.accent} style={styles.icon} />
      <Text style={styles.text} numberOfLines={1}>
        {message}
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderWidth: 2,
    borderColor: colors.gainOnLight,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    zIndex: 9999,
    ...Platform.select({
      ios: {
        shadowColor: colors.ink,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
      web: {
        boxShadow: '0 4px 16px rgba(18, 61, 42, 0.35)',
      },
    }),
  },
  icon: {
    marginRight: 8,
  },
  text: {
    fontFamily: fonts.thai,
    fontSize: 12.5,
    color: '#EAF3EE',
    letterSpacing: -0.2,
  },
});
