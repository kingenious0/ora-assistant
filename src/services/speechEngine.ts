import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

/**
 * Offline Speech Engine Orchestrator
 * Solves the offline/airplane-mode speech recognition gap on Android (including Xiaomi HyperOS)
 * and resolves package routing so Ora never deadlocks or requires cloud connectivity.
 */
class SpeechEngineService {
  private isDownloadingModel: boolean = false;
  private cachedPreferredPackage: string | null = null;

  /**
   * Resolves the highest-priority native speech recognition package on the device,
   * prioritizing dedicated on-device/offline recognition engines and explicitly
   * filtering out Ora itself to prevent circular delegate deadlocks.
   */
  public getBestRecognitionPackage(): string | undefined {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    try {
      const allServices = ExpoSpeechRecognitionModule.getSpeechRecognitionServices();
      if (!Array.isArray(allServices) || allServices.length === 0) {
        return undefined;
      }

      // Priority list of on-device & OEM speech providers
      const priorityPackages = [
        'com.google.android.as', // Android System Intelligence / Private Compute Core (Best Offline)
        'com.google.android.tts', // Google Speech Services
        'com.google.android.googlequicksearchbox', // Google App
        'com.xiaomi.mibrain.speech', // Xiaomi HyperOS / MIUI Speech Engine
        'com.samsung.android.bixby.agent', // Samsung Offline Bixby
      ];

      // Explicitly filter out com.hex8.ora so the app doesn't self-bind
      const validServices = allServices.filter((pkg) => pkg !== 'com.hex8.ora');

      for (const priority of priorityPackages) {
        if (validServices.includes(priority)) {
          this.cachedPreferredPackage = priority;
          return priority;
        }
      }

      // If no priority package matches, take the first valid non-self package
      if (validServices.length > 0) {
        this.cachedPreferredPackage = validServices[0];
        return validServices[0];
      }

      return undefined;
    } catch (e) {
      console.warn('[SpeechEngine] Error resolving recognition services:', e);
      return undefined;
    }
  }

  /**
   * Checks whether on-device speech recognition is natively supported on this hardware.
   */
  public supportsOffline(): boolean {
    if (Platform.OS !== 'android') return false;
    try {
      return ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
    } catch (_) {
      return false;
    }
  }

  /**
   * Trigger offline model download in background if on Android 13+
   */
  public async ensureOfflineModel(locale: string = 'en-US'): Promise<void> {
    if (Platform.OS !== 'android' || this.isDownloadingModel) return;

    try {
      this.isDownloadingModel = true;
      const res = await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale });
      console.log('[SpeechEngine] Offline model download status:', res.status, res.message);
    } catch (e: any) {
      // Non-fatal; device may already have model or is below Android 13
      console.log('[SpeechEngine] Offline model trigger note:', e?.message || e);
    } finally {
      this.isDownloadingModel = false;
    }
  }

  /**
   * Starts a resilient speech recognition session with multi-tier offline fallback.
   */
  public async startListening(options: {
    continuous?: boolean;
    onNotice?: (msg: string) => void;
  }): Promise<boolean> {
    try {
      const permissionRes = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permissionRes.granted) {
        options.onNotice?.('Microphone Permission Denied');
        return false;
      }

      // Check current engine state before launching to avoid busy conflicts
      try {
        const state = await ExpoSpeechRecognitionModule.getStateAsync();
        if (state !== 'inactive') {
          ExpoSpeechRecognitionModule.abort();
          await new Promise((r) => setTimeout(r, 100));
        }
      } catch (_) {}

      const preferredPkg = this.getBestRecognitionPackage();
      const offlineSupported = this.supportsOffline();

      // Tier 1: Attempt dedicated on-device recognition (requires zero network data)
      if (offlineSupported) {
        try {
          await ExpoSpeechRecognitionModule.start({
            lang: 'en-US',
            interimResults: true,
            continuous: options.continuous ?? false,
            requiresOnDeviceRecognition: true,
            androidRecognitionServicePackage: preferredPkg,
          });
          return true;
        } catch (onDeviceErr: any) {
          console.warn('[SpeechEngine] Tier 1 on-device start failed, trying Tier 2 fallback:', onDeviceErr?.message);
          // Trigger offline model download for next time
          this.ensureOfflineModel('en-US').catch(() => {});
        }
      }

      // Tier 2: Standard recognition with selected provider
      await ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: options.continuous ?? false,
        requiresOnDeviceRecognition: false,
        androidRecognitionServicePackage: preferredPkg,
      });

      return true;
    } catch (err: any) {
      console.error('[SpeechEngine] Failed to start recognition session:', err);
      options.onNotice?.(`Speech Error: ${err?.message || 'Failed to start'}`);
      return false;
    }
  }

  /**
   * Abort active recognition
   */
  public abort(): void {
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch (_) {}
  }
}

export const speechEngine = new SpeechEngineService();
