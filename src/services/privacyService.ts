// บริการจัดการโหมดความเป็นส่วนตัว (Privacy Mode) แบบ Global พร้อมจัดเก็บสถานะในเครื่องและซิงค์การซ่อนยอดเงินทุกหน้าจอ
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRIVACY_MODE_STORAGE_KEY = '@my_dividend_privacy_mode';

type PrivacyListener = (isPrivate: boolean) => void;
const listeners = new Set<PrivacyListener>();
let currentPrivacyMode: boolean = false;
let isInitialized = false;

// โหลดค่าเริ่มต้นจาก AsyncStorage ทันทีเมื่อแอปเริ่มทำงาน
AsyncStorage.getItem(PRIVACY_MODE_STORAGE_KEY)
  .then((stored) => {
    if (stored !== null) {
      currentPrivacyMode = stored === 'true';
    }
    isInitialized = true;
    listeners.forEach((l) => l(currentPrivacyMode));
  })
  .catch((err) => {
    console.warn('[PrivacyService] Initial load error:', err);
    isInitialized = true;
  });

/**
 * ดึงสถานะโหมดความเป็นส่วนตัวปัจจุบัน (แคช 0ms ในหน่วยความจำ)
 */
export async function getPrivacyMode(): Promise<boolean> {
  if (isInitialized) return currentPrivacyMode;
  try {
    const stored = await AsyncStorage.getItem(PRIVACY_MODE_STORAGE_KEY);
    if (stored !== null) {
      currentPrivacyMode = stored === 'true';
    }
  } catch (err) {
    console.warn('[PrivacyService] Error loading privacy mode:', err);
  }
  isInitialized = true;
  return currentPrivacyMode;
}

/**
 * สลับหรือตั้งค่าโหมดความเป็นส่วนตัว และแจ้งเตือนทุกหน้าจอพร้อมกันแบบ Real-time
 */
export async function setPrivacyMode(enabled: boolean): Promise<void> {
  currentPrivacyMode = enabled;
  isInitialized = true;
  try {
    await AsyncStorage.setItem(PRIVACY_MODE_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch (err) {
    console.warn('[PrivacyService] Error saving privacy mode:', err);
  }
  listeners.forEach((listener) => {
    try {
      listener(enabled);
    } catch (e) {
      console.warn('[PrivacyService] Listener error:', e);
    }
  });
}

/**
 * ฟังก์ชัน Subscribe เพื่อรับการแจ้งเตือนเมื่อสถานะโหมดความเป็นส่วนตัวเปลี่ยน
 */
export function subscribePrivacyMode(listener: PrivacyListener): () => void {
  listeners.add(listener);
  listener(currentPrivacyMode);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Custom React Hook สำหรับใช้งาน Privacy Mode ทุกหน้าจอได้ทันทีแบบซิงค์ 100%
 */
export function usePrivacyMode() {
  const [isPrivate, setIsPrivate] = useState<boolean>(currentPrivacyMode);

  useEffect(() => {
    const unsubscribe = subscribePrivacyMode((val) => {
      setIsPrivate(val);
    });
    return unsubscribe;
  }, []);

  const toggle = useCallback(() => {
    setPrivacyMode(!currentPrivacyMode);
  }, []);

  return {
    isPrivate,
    toggle,
    setPrivate: setPrivacyMode,
  };
}

/**
 * ฟังก์ชันช่วยจัดรูปแบบตัวเลขเงิน โดยคำนึงถึง Privacy Mode
 */
export function formatMaskedMoney(
  amount: number,
  isPrivate: boolean,
  digits: number = 2,
  currency: 'THB' | 'USD' = 'THB'
): string {
  const symbol = currency === 'USD' ? '$' : '฿';
  if (isPrivate) {
    return `${symbol}••••••`;
  }
  return `${symbol}${amount.toLocaleString('th-TH', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}
