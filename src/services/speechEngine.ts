import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

export interface SpeechErrorInfo {
  code: number | null;
  name: string;
  description: string;
  isFatalForRetry: boolean;
}

export function parseSpeechError(error: any): SpeechErrorInfo {
  const errStr = String(error?.error || error || '').toLowerCase();
  const rawCode = typeof error === 'number' ? error : error?.code;

  if (rawCode === 1 || errStr.includes('network-timeout')) {
    return { code: 1, name: 'ERROR_NETWORK_TIMEOUT', description: 'Network operation timed out', isFatalForRetry: false };
  }
  if (rawCode === 2 || errStr.includes('network')) {
    return { code: 2, name: 'ERROR_NETWORK', description: 'Network error', isFatalForRetry: false };
  }
  if (rawCode === 3 || errStr.includes('audio')) {
    return { code: 3, name: 'ERROR_AUDIO', description: 'Audio recording hardware error', isFatalForRetry: true };
  }
  if (rawCode === 4 || errStr.includes('server')) {
    return { code: 4, name: 'ERROR_SERVER', description: 'Server sent error status', isFatalForRetry: false };
  }
  if (rawCode === 5 || errStr.includes('client') || errStr.includes('bad-grammar')) {
    return { code: 5, name: 'ERROR_CLIENT', description: 'Client side error or invalid parameter', isFatalForRetry: true };
  }
  if (rawCode === 6 || errStr.includes('speech-timeout') || errStr.includes('no-speech')) {
    return { code: 6, name: 'ERROR_SPEECH_TIMEOUT', description: 'No speech input detected', isFatalForRetry: false };
  }
  if (rawCode === 7 || errStr.includes('no-match')) {
    return { code: 7, name: 'ERROR_NO_MATCH', description: 'No recognition result matched', isFatalForRetry: false };
  }
  if (rawCode === 8 || errStr.includes('busy')) {
    return { code: 8, name: 'ERROR_RECOGNIZER_BUSY', description: 'RecognitionService is already busy', isFatalForRetry: true };
  }
  if (rawCode === 9 || errStr.includes('not-allowed') || errStr.includes('permission')) {
    return { code: 9, name: 'ERROR_INSUFFICIENT_PERMISSIONS', description: 'Insufficient audio permissions', isFatalForRetry: true };
  }
  if (errStr.includes('abort')) {
    return { code: null, name: 'ERROR_ABORTED', description: 'Session aborted', isFatalForRetry: true };
  }

  return { code: rawCode || null, name: `ERROR_${errStr.toUpperCase() || 'UNKNOWN'}`, description: errStr, isFatalForRetry: false };
}

/**
 * Offline Speech Engine Orchestrator
 * Solves the offline/airplane-mode speech recognition gap on Android (including Xiaomi HyperOS)
 * and enforces strict hardware session handshakes so microphone contention never crashes the HAL.
 */
class SpeechEngineService {
  private isDownloadingModel: boolean = false;
  private currentPackageIndex: number = 0;
  private isTransitioning: boolean = false;

  /**
   * Discovers and orders all native speech recognition engines on this device.
   * Priority:
   * 1. Google Speech Services (com.google.android.tts)
   * 2. Google App (com.google.android.googlequicksearchbox)
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
      const validServices = allServices.filter((pkg: string) => pkg !== 'com.hex8.ora');

      const priorityPackages = [
        'com.google.android.tts',
        'com.google.android.googlequicksearchbox',
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

  public getBestRecognitionPackage(): string | undefined {
    const candidates = this.getCandidatePackages();
    return candidates[0];
  }

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

  public supportsOffline(): boolean {
    if (Platform.OS !== 'android') return false;
    try {
      return ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
    } catch (_) {
      return false;
    }
  }

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
   * Mandatory Audio Session Handshake:
   * Completely aborts any current recording stream and enforces a hardware cooldown
   * (150-200ms) to allow Android's AudioFlinger / HAL to release exclusive PCM handles.
   */
  public async stopAndCooldown(delayMs: number = 200): Promise<void> {
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  /**
   * Starts a resilient speech recognition session with strict hardware mutual exclusion.
   */
  public async startListening(options: {
    continuous?: boolean;
    packageOverride?: string;
    onNotice?: (msg: string) => void;
  }): Promise<boolean> {
    if (this.isTransitioning) {
      console.log('[SpeechEngine] Transitioning, ignoring duplicate start call');
      return false;
    }

    try {
      this.isTransitioning = true;

      const permissionRes = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permissionRes.granted) {
        options.onNotice?.('Microphone Permission Denied');
        return false;
      }

      // 1. Enforce strict hardware handshake: stop any prior session and wait for HAL release
      try {
        const state = await ExpoSpeechRecognitionModule.getStateAsync();
        if (state !== 'inactive') {
          console.log(`[SpeechEngine] Engine state was "${state}", executing 200ms hardware cooldown`);
          await this.stopAndCooldown(200);
        }
      } catch (_) {
        await this.stopAndCooldown(150);
      }

      const pkg = options.packageOverride !== undefined ? options.packageOverride : this.getCurrentPackage();
      console.log(`[SpeechEngine] Starting speech recognition (continuous: ${options.continuous ?? false}) with package: ${pkg || 'default system recognizer'}`);

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
      const parsed = parseSpeechError(err);
      console.error(`[SpeechEngine] Failed to start recognition session: ${parsed.name} (${parsed.code}) - ${parsed.description}`, err);
      options.onNotice?.(`Speech Error: ${parsed.name}`);
      return false;
    } finally {
      this.isTransitioning = false;
    }
  }

  public abort(): void {
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch (_) {}
  }
}

export const speechEngine = new SpeechEngineService();


