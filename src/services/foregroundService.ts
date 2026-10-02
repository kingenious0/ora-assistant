import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const CHANNEL_ID = 'ora-voice-foreground-service';
const NOTIFICATION_ID = 'ora-active-listener';

class ForegroundVoiceManager {
  private isRunning: boolean = false;

  /**
   * Initializes the Android Foreground Notification Channel.
   */
  public async setupChannel(): Promise<void> {
    if (Platform.OS !== 'android') return;

    try {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Ora Voice Assistant Service',
        description: 'Persistent low-power listener for Ora voice commands and wake words.',
        importance: Notifications.AndroidImportance.LOW,
        vibrationPattern: null,
        enableLights: false,
        enableVibrate: false,
        showBadge: false,
      });
    } catch (e) {
      console.warn('[ForegroundVoiceManager] Failed to set notification channel:', e);
    }
  }

  /**
   * Displays the persistent Android notification informing the OS and user that Ora is listening.
   */
  public async startForegroundNotification(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        const req = await Notifications.requestPermissionsAsync();
        if (req.status !== 'granted') {
          console.warn('[ForegroundVoiceManager] Notification permission not granted.');
          return false;
        }
      }

      await this.setupChannel();

      await Notifications.scheduleNotificationAsync({
        identifier: NOTIFICATION_ID,
        content: {
          title: 'Ora Assistant Active',
          body: 'Listening for "Hey Ora" • 100% On-Device Engine',
          priority: Notifications.AndroidNotificationPriority.LOW,
          sticky: true,
          autoDismiss: false,
          color: '#F59E0B',
        },
        trigger: null, // Immediate
      });

      this.isRunning = true;
      return true;
    } catch (e) {
      console.warn('[ForegroundVoiceManager] Start error:', e);
      return false;
    }
  }

  /**
   * Dismisses the persistent notification when hands-free is disabled.
   */
  public async stopForegroundNotification(): Promise<void> {
    if (Platform.OS !== 'android') return;

    try {
      await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
      this.isRunning = false;
    } catch (e) {
      console.warn('[ForegroundVoiceManager] Stop error:', e);
    }
  }

  public getStatus(): boolean {
    return this.isRunning;
  }
}

export const foregroundVoiceManager = new ForegroundVoiceManager();
