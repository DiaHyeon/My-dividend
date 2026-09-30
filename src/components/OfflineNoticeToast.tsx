import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, Animated, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { subscribeOfflineNotice } from '../services/portfolioCacheService';

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
      <Ionicons name="information-circle-outline" size={17} color="#94A3B8" style={styles.icon} />
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
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.85)',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    zIndex: 9999,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
      web: {
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
      },
    }),
  },
  icon: {
    marginRight: 6,
  },
  text: {
    fontSize: 12,
    fontWeight: '500',
    color: '#CBD5E1',
    letterSpacing: -0.2,
  },
});
