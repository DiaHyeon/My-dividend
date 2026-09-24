import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

// Configure in-app notification behavior safely
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch {
  // Silently handled for Expo Go
}


/**
 * Initialize Android notification channel for XD reminders
 */
export async function initNotificationChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      if (typeof Notifications.setNotificationChannelAsync === 'function') {
        await Notifications.setNotificationChannelAsync('xd-reminders', {
          name: 'XD Reminders',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#059669',
          sound: 'default',
        });
      }
    } catch {
      // In Expo Go on Android, NotificationsChannelsProvider is null by design.
      // Silently catch to avoid triggering intrusive LogBox warning on user's device.
    }
  }
}

/**
 * Request notification permissions from user
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    return finalStatus === 'granted';
  } catch {
    return false;
  }
}

/**
 * Schedules a notification reminder 1 day before the XD date at 08:30 AM
 * Message: 🔔 [Symbol] ขึ้นเครื่องหมาย XD พรุ่งนี้! ถือหุ้นไว้เพื่อรับสิทธิเงินปันผล
 */
export async function scheduleXdReminder(
  symbol: string,
  xdDateString: string
): Promise<string | null> {
  if (!symbol || !xdDateString) return null;

  try {
    const parts = xdDateString.split('-').map(Number);
    if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
      console.warn('Invalid XD date format for reminder:', xdDateString);
      return null;
    }

    const [year, month, day] = parts;
    // Calculate 1 day before XD date at 08:30 AM
    const reminderDate = new Date(year, month - 1, day);
    reminderDate.setDate(reminderDate.getDate() - 1);
    reminderDate.setHours(8, 30, 0, 0);

    const title = 'แจ้งเตือนวัน XD';
    const body = `🔔 [${symbol}] ขึ้นเครื่องหมาย XD พรุ่งนี้! ถือหุ้นไว้เพื่อรับสิทธิเงินปันผล`;

    if (Platform.OS === 'web') {
      console.log(`[Notification Service Web] Scheduled XD reminder: ${body} for ${reminderDate.toLocaleString('th-TH')}`);
      return 'web-scheduled';
    }

    await initNotificationChannel();
    await requestNotificationPermissions();

    // If the reminder time has already passed in the past, skip scheduling (never trigger false alerts for historical dates)
    if (reminderDate.getTime() <= Date.now()) {
      return null;
    }

    const triggerDate = reminderDate;

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { symbol, xdDate: xdDateString },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: 'xd-reminders',
      },
    });

    console.log(`Scheduled XD notification [${notificationId}] for ${symbol} at ${triggerDate.toISOString()}`);
    
    // Save to local registry for cancellation tracking
    await saveScheduledReminder(notificationId, symbol, xdDateString);

    return notificationId;
  } catch (err: any) {
    console.log('[Notification notice] Local notification skipped in Expo Go:', err?.message);
    return null;
  }
}

const SCHEDULED_REMINDERS_STORAGE_KEY = '@my_dividend_scheduled_reminders_registry';

interface StoredReminder {
  notificationId: string;
  symbol: string;
  xdDate: string;
}

async function getStoredReminders(): Promise<StoredReminder[]> {
  try {
    const raw = await AsyncStorage.getItem(SCHEDULED_REMINDERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveScheduledReminder(notificationId: string, symbol: string, xdDate: string): Promise<void> {
  try {
    const list = await getStoredReminders();
    // Remove existing for same symbol & date to prevent duplicates
    const filtered = list.filter((r) => !(r.symbol === symbol && r.xdDate === xdDate));
    filtered.push({ notificationId, symbol, xdDate });
    await AsyncStorage.setItem(SCHEDULED_REMINDERS_STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // ignore
  }
}

/**
 * Cancels a specific scheduled reminder by notification ID
 */
export async function cancelXdReminder(notificationId: string): Promise<void> {
  if (!notificationId || Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    const list = await getStoredReminders();
    const updated = list.filter((r) => r.notificationId !== notificationId);
    await AsyncStorage.setItem(SCHEDULED_REMINDERS_STORAGE_KEY, JSON.stringify(updated));
    console.log(`[Notification Service] Cancelled notification [${notificationId}]`);
  } catch (err: any) {
    console.warn('Error cancelling notification:', err?.message);
  }
}

/**
 * Cancels all scheduled reminders for a specific stock symbol (e.g. when sold or deleted)
 */
export async function cancelRemindersForSymbol(symbol: string): Promise<void> {
  if (!symbol || Platform.OS === 'web') return;
  try {
    const list = await getStoredReminders();
    const targetReminders = list.filter((r) => r.symbol.toUpperCase() === symbol.toUpperCase());
    for (const r of targetReminders) {
      try {
        await Notifications.cancelScheduledNotificationAsync(r.notificationId);
      } catch {
        // ignore
      }
    }
    const remaining = list.filter((r) => r.symbol.toUpperCase() !== symbol.toUpperCase());
    await AsyncStorage.setItem(SCHEDULED_REMINDERS_STORAGE_KEY, JSON.stringify(remaining));
    console.log(`[Notification Service] Cancelled ${targetReminders.length} reminder(s) for ${symbol}`);
  } catch (err: any) {
    console.warn(`Error cancelling reminders for ${symbol}:`, err?.message);
  }
}

/**
 * Cancels all scheduled notifications across the entire app
 */
export async function cancelAllXdReminders(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await AsyncStorage.removeItem(SCHEDULED_REMINDERS_STORAGE_KEY);
    console.log('[Notification Service] Cancelled all scheduled notifications');
  } catch (err: any) {
    console.warn('Error cancelling all notifications:', err?.message);
  }
}

/**
 * Automatically cleans up orphaned notifications for symbols that are no longer held
 */
export async function cleanOrphanedReminders(activeHoldings: { symbol: string; net_shares?: number }[]): Promise<number> {
  if (Platform.OS === 'web') return 0;
  try {
    const activeSymbols = new Set(
      activeHoldings
        .filter((h) => Number(h.net_shares || 0) > 0)
        .map((h) => h.symbol.toUpperCase())
    );

    const list = await getStoredReminders();
    const orphaned = list.filter((r) => !activeSymbols.has(r.symbol.toUpperCase()));

    for (const r of orphaned) {
      try {
        await Notifications.cancelScheduledNotificationAsync(r.notificationId);
      } catch {
        // ignore
      }
    }

    const remaining = list.filter((r) => activeSymbols.has(r.symbol.toUpperCase()));
    await AsyncStorage.setItem(SCHEDULED_REMINDERS_STORAGE_KEY, JSON.stringify(remaining));
    
    if (orphaned.length > 0) {
      console.log(`[Notification Service] Cleaned up ${orphaned.length} orphaned notification(s)`);
    }
    return orphaned.length;
  } catch (err: any) {
    console.warn('Error cleaning orphaned notifications:', err?.message);
    return 0;
  }
}

/**
 * Synchronizes upcoming XD reminders from the database for all active (non-archived) assets.
 * Schedules reminders for unexpired upcoming XD dates that haven't been scheduled yet.
 */
export async function syncAllUpcomingXdReminders(): Promise<number> {
  if (Platform.OS === 'web') return 0;
  try {
    const todayStr = new Date().toISOString().split('T')[0];

    // Fetch upcoming dividend schedules for active assets
    const { data: schedules, error } = await supabase
      .from('dividend_schedules')
      .select('id, dpu, xd_date, asset_id, assets(symbol, is_archived)')
      .gte('xd_date', todayStr);

    if (error || !schedules || schedules.length === 0) {
      return 0;
    }

    const currentReminders = await getStoredReminders();
    let scheduledCount = 0;

    for (const item of schedules) {
      const asset = item.assets as unknown as { symbol: string; is_archived: boolean } | null;
      if (!asset || asset.is_archived || !asset.symbol) continue;

      const symbol = asset.symbol;
      const xdDate = item.xd_date;

      // Check if already registered
      const alreadyScheduled = currentReminders.some(
        (r) => r.symbol.toUpperCase() === symbol.toUpperCase() && r.xdDate === xdDate
      );

      if (!alreadyScheduled) {
        const notifId = await scheduleXdReminder(symbol, xdDate);
        if (notifId) {
          scheduledCount++;
        }
      }
    }

    if (scheduledCount > 0) {
      console.log(`[Notification Service] Synchronized ${scheduledCount} new upcoming XD reminder(s)`);
    }

    return scheduledCount;
  } catch (err: any) {
    console.warn('[Notification Service] Error syncing upcoming XD reminders:', err?.message);
    return 0;
  }
}

/**
 * Sends or schedules a test notification (useful for testing on Expo Go / device)
 */
export async function sendTestNotificationNow(delaySeconds: number = 3): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    await initNotificationChannel();
    await requestNotificationPermissions();

    const title = '🔔 ทดสอบการแจ้งเตือน XD Reminders';
    const body = 'ระบบแจ้งเตือนวันขึ้นเครื่องหมายเงินปันผลของ My dividend พร้อมทำงานเรียบร้อยแล้ว!';

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, delaySeconds),
        repeats: false,
        channelId: 'xd-reminders',
      },
    });

    return notificationId;
  } catch (err: any) {
    console.warn('[Notification Service] Test notification error:', err?.message);
    return null;
  }
}
