import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

/**
 * Offline Speech Engine Orchestrator
 * Solves the offline/airplane-mode speech recognition gap on Android (including Xiaomi HyperOS)
 * and resolves package routing so Ora never deadlocks or requires cloud connectivity.
 */
class SpeechEngineService {
  private isDownloadingModel: boolean = false;
  private currentPackageIndex: number = 0;

  /**
   * Discovers and orders all native speech recognition engines on this device.
   * Priority:
   * 1. Google App (com.google.android.googlequicksearchbox) - universally supported and stable
   * 2. Google Speech Services (com.google.android.tts)
   * 3. Xiaomi Speech Engine (com.xiaomi.mibrain.speech) - native on HyperOS / MIUI
   * 4. Samsung Bixby (com.samsung.android.bixby.agent)
   * 5. Android System Intelligence (com.google.android.as)
   * Explicitly excludes Ora itself (com.hex8.ora) to prevent circular delegate deadlocks.
   */
  public getCandidatePackages(): (string | undefined)[] {
    if (Platform.OS !== 'android') {
      return [undefined];
    }

    try {
      const allServices = ExpoSpeechRecognitionModule.getSpeechRecognitionServices() || [];
      const validServices = allServices.filter((pkg) => pkg !== 'com.hex8.ora');

      const priorityPackages = [
        'com.google.android.googlequicksearchbox',
        'com.google.android.tts',
        'com.xiaomi.mibrain.speech',
        'com.samsung.android.bixby.agent',
        'com.google.android.as',
      ];

      const ordered: (string | undefined)[] = [];

      // Add matching priority packages
      for (const priority of priorityPackages) {
        if (validServices.includes(priority) && !ordered.includes(priority)) {
          ordered.push(priority);
        }
      }

      // Add any remaining non-self packages
      for (const service of validServices) {
        if (!ordered.includes(service)) {
          ordered.push(service);
        }
      }

      // If no valid packages found, include undefined (system default)
      if (ordered.length === 0) {
        ordered.push(undefined);
      }

      return ordered;
    } catch (e) {
      console.warn('[SpeechEngine] Error resolving recognition services:', e);
      return [undefined];
    }
  }

  /**
   * Returns the best candidate package for speech recognition.
   */
  public getBestRecognitionPackage(): string | undefined {
    const candidates = this.getCandidatePackages();
    return candidates[0];
  }

  /**
   * Cycle to next available package if the current one throws an error.
   */
  public cycleNextPackage(): string | undefined {
    const candidates = this.getCandidatePackages();
    this.currentPackageIndex = (this.currentPackageIndex + 1) % candidates.length;
    return candidates[this.currentPackageIndex];
  }

  public getCurrentPackage(): string | undefined {
    const candidates = this.getCandidatePackages();
    return candidates[this.currentPackageIndex % candidates.length];
  }

  public resetPackageIndex(): void {
    this.currentPackageIndex = 0;
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
   * Safe optional background trigger for offline language pack
   */
  public async ensureOfflineModel(locale: string = 'en-US'): Promise<void> {
    if (Platform.OS !== 'android' || this.isDownloadingModel) return;

    try {
      this.isDownloadingModel = true;
      const res = await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale });
      console.log('[SpeechEngine] Offline model download status:', res.status, res.message);
    } catch (e: any) {
      console.log('[SpeechEngine] Offline model trigger note:', e?.message || e);
    } finally {
      this.isDownloadingModel = false;
    }
  }

  /**
   * Starts a resilient speech recognition session.
   * CRITICAL: We do NOT pass `requiresOnDeviceRecognition: true` by default because
   * on Android devices (like Xiaomi) without the pre-downloaded 62MB pack,
   * `requiresOnDeviceRecognition: true` causes Android's SpeechRecognizer to immediately
   * throw ERROR_LANGUAGE_UNAVAILABLE (13) or ERROR_CLIENT (5) and shut down the microphone!
   * Instead, we pass `EXTRA_PREFER_OFFLINE: true` via androidIntentOptions, which tells
   * the recognizer to use on-device models if available, but safely fall back without crashing.
   */
  public async startListening(options: {
    continuous?: boolean;
    packageOverride?: string;
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
          await new Promise((r) => setTimeout(r, 120));
        }
      } catch (_) {}

      const pkg = options.packageOverride !== undefined ? options.packageOverride : this.getCurrentPackage();

      console.log(`[SpeechEngine] Starting recognition with package: ${pkg || 'default system recognizer'}`);

      await ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: options.continuous ?? false,
        requiresOnDeviceRecognition: false, // Prevents fatal ERROR_LANGUAGE_UNAVAILABLE
        androidRecognitionServicePackage: pkg,
        androidIntentOptions: {
          EXTRA_PREFER_OFFLINE: true, // Offline-preferred intent without hard crash
        },
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

