import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

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
} catch (e: any) {
  console.warn('Unable to configure notification handler:', e?.message);
}


/**
 * Initialize Android notification channel for XD reminders
 */
export async function initNotificationChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('xd-reminders', {
        name: 'XD Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#059669',
        sound: 'default',
      });
    } catch (err: any) {
      console.warn('Error setting notification channel:', err.message);
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
  } catch (err: any) {
    console.warn('Error requesting notification permissions:', err.message);
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

    // Trigger on reminderDate, or within 5 seconds if calculated time is in the past
    const triggerDate = reminderDate.getTime() > Date.now()
      ? reminderDate
      : new Date(Date.now() + 5000);

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
    return notificationId;
  } catch (err: any) {
    console.warn('Failed to schedule XD reminder notification:', err.message);
    return null;
  }
}
