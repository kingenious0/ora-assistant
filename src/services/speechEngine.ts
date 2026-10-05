import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

export interface SpeechErrorInfo {
  code: number | null;
  name: string;
  description: string;
  isFatalForRetry: boolean;
}

export function parseSpeechError(error: any): SpeechErrorInfo {
  const errStr = String(error?.error || error?.message || error || '').toLowerCase();
  const rawCode = typeof error === 'number' ? error : (error?.code ?? null);

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
    return { code: 5, name: 'ERROR_CLIENT', description: 'Client side error or invalid parameter', isFatalForRetry: false };
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
    return { code: null, name: 'ERROR_ABORTED', description: 'Session aborted', isFatalForRetry: false };
  }

  return { code: rawCode, name: `ERROR_${(errStr || 'unknown').toUpperCase()}`, description: errStr, isFatalForRetry: false };
}

/**
 * Offline Speech Engine Orchestrator
 * Solves the offline/airplane-mode speech recognition gap on Android (including Xiaomi HyperOS)
 * and enforces strict hardware session handshakes so microphone contention never crashes the HAL.
 *
 * KEY FIX: ERROR_CLIENT (5) is NOT treated as fatal — on Xiaomi HyperOS with EXTRA_PREFER_OFFLINE,
 * Google Speech services return ERROR_CLIENT when the online model validation times out but
 * offline recognition is still available and working. This was causing premature session termination.
 */
class SpeechEngineService {
  private isDownloadingModel: boolean = false;
  private currentPackageIndex: number = 0;

  // Locks and transition flags
  private activeSessionPromise: Promise<boolean> | null = null;
  private sessionActive: boolean = false;
  private isCooldown: boolean = false;
  private isStarting: boolean = false;

  public isTransitioning(): boolean {
    return this.isCooldown || this.isStarting;
  }

  /**
   * Discovers and orders all native speech recognition engines on this device.
   * Priority:
   * 0. undefined (Android System Default Speech Recognizer — binds directly to Settings.Secure.VOICE_RECOGNITION_SERVICE without package restrictions)
   * 1. Google Speech Services (com.google.android.tts)
   * 2. Google App (com.google.android.googlequicksearchbox)
   * 3. Xiaomi Speech Engine (com.xiaomi.mibrain.speech)
   * 4. Android System Intelligence (com.google.android.as)
   * 5. Samsung Bixby (com.samsung.android.bixby.agent)
   * Explicitly excludes Ora itself (com.hex8.ora) to prevent circular delegate deadlocks.
   */
  public getCandidatePackages(): (string | undefined)[] {
    if (Platform.OS !== 'android') {
      return [undefined];
    }

    try {
      const allServices: string[] = ExpoSpeechRecognitionModule.getSpeechRecognitionServices() || [];
      const validServices = allServices.filter((pkg: string) => pkg !== 'com.hex8.ora');

      const priorityPackages = [
        'com.google.android.tts',
        'com.google.android.googlequicksearchbox',
        'com.xiaomi.mibrain.speech',
        'com.google.android.as',
        'com.samsung.android.bixby.agent',
      ];

      // Always prioritize undefined (system default resolver) as Candidate 0
      const ordered: (string | undefined)[] = [undefined];

      // Add matching priority packages next as fallbacks
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
   * to allow Android's AudioFlinger / HAL to release exclusive PCM handles.
   */
  public async stopAndCooldown(delayMs: number = 250): Promise<void> {
    this.sessionActive = false;
    this.isCooldown = true;
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch (_) {}
    try {
      // Wait for AudioFlinger to release the PCM lock
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } finally {
      this.isCooldown = false;
    }
  }

  // Mutex lock to serialize startListening calls without permanent deadlocks
  private startLock: Promise<void> = Promise.resolve();

  /**
   * Starts a resilient speech recognition session with strict hardware mutual exclusion.
   * Uses a timeout-protected mutex lock so sequential starts never deadlock each other.
   */
  public async startListening(options: {
    continuous?: boolean;
    packageOverride?: string;
    onNotice?: (msg: string) => void;
  }): Promise<boolean> {
    const previousLock = this.startLock;
    let releaseLock: () => void;
    this.startLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    try {
      // Wait for any prior start to settle, with a 1500ms safety timeout to prevent permanent hanging
      await Promise.race([
        previousLock,
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
      return await this._doStartListening(options);
    } catch (e: any) {
      console.warn('[SpeechEngine] startListening exception:', e);
      return false;
    } finally {
      releaseLock!();
    }
  }

  private async _doStartListening(options: {
    continuous?: boolean;
    packageOverride?: string;
    onNotice?: (msg: string) => void;
  }): Promise<boolean> {
    this.isStarting = true;
    let pkg = options.packageOverride !== undefined ? options.packageOverride : this.getCurrentPackage();

    try {
      // 1. Fast permission check without triggering blocking dialogs if already granted
      let hasMicPermission = false;
      try {
        const permStatus = await ExpoSpeechRecognitionModule.getPermissionsAsync();
        hasMicPermission = permStatus?.granted ?? false;
      } catch (_) {}

      if (!hasMicPermission) {
        try {
          const req = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
          hasMicPermission = req?.granted ?? false;
        } catch (_) {}
      }

      if (!hasMicPermission) {
        options.onNotice?.('Microphone Permission Required');
        return false;
      }

      // 2. State cleanup: abort prior active recognizer cleanly
      try {
        const state = await ExpoSpeechRecognitionModule.getStateAsync();
        if (state !== 'inactive') {
          console.log(`[SpeechEngine] State was "${state}" — aborting prior session`);
          ExpoSpeechRecognitionModule.abort();
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      } catch (_) {}

      console.log(
        `[SpeechEngine] Starting native recognizer (continuous: ${options.continuous ?? false}) pkg: ${pkg || 'system-default'}`
      );

      this.sessionActive = true;

      const startOptions: any = {
        lang: 'en-US',
        interimResults: true,
        continuous: options.continuous ?? false,
        requiresOnDeviceRecognition: false,
        androidIntentOptions: {
          EXTRA_PREFER_OFFLINE: true,
        },
      };

      if (pkg) {
        startOptions.androidRecognitionServicePackage = pkg;
      }

      ExpoSpeechRecognitionModule.start(startOptions);
      return true;
    } catch (err: any) {
      // Fallback: If a specific package failed on start, attempt system-default immediately
      if (pkg) {
        console.warn(`[SpeechEngine] Failed with package "${pkg}". Retrying with system default...`);
        try {
          await this.stopAndCooldown(200);
          this.sessionActive = true;
          ExpoSpeechRecognitionModule.start({
            lang: 'en-US',
            interimResults: true,
            continuous: options.continuous ?? false,
            requiresOnDeviceRecognition: false,
          });
          return true;
        } catch (fallbackErr) {
          console.error('[SpeechEngine] Fallback to system-default failed:', fallbackErr);
        }
      }

      this.sessionActive = false;
      const parsed = parseSpeechError(err);
      console.error(
        `[SpeechEngine] Failed to start: ${parsed.name} (${parsed.code}) — ${parsed.description}`,
        err
      );
      options.onNotice?.(`Speech Error: ${parsed.name}`);
      return false;
    } finally {
      this.isStarting = false;
    }
  }

  public isActive(): boolean {
    return this.sessionActive;
  }

  public abort(): void {
    this.sessionActive = false;
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch (_) {}
  }
}

export const speechEngine = new SpeechEngineService();
