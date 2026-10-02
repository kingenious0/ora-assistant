import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';

export interface SpeechRecognitionResult {
  text: string;
  success: boolean;
  error?: string;
}

class SpeechRecognitionService {
  /**
   * Prompts the native Android / Web speech recognition dialog to capture spoken voice.
   */
  public async promptVoiceRecognition(): Promise<SpeechRecognitionResult> {
    if (Platform.OS === 'android') {
      try {
        const result = await IntentLauncher.startActivityAsync(
          'android.speech.action.RECOGNIZE_SPEECH',
          {
            extra: {
              'android.speech.extra.LANGUAGE_MODEL': 'free_form',
              'android.speech.extra.PROMPT': 'Say a command to Ora...',
              'android.speech.extra.MAX_RESULTS': 1,
            },
          }
        );

        if (result.resultCode === -1 && result.extra) {
          const extras = result.extra as Record<string, any>;
          const results =
            extras['android.speech.extra.RESULTS'] ||
            extras['RESULTS'] ||
            extras['voice_results'];

          if (Array.isArray(results) && results.length > 0) {
            return {
              text: results[0],
              success: true,
            };
          }
          if (typeof results === 'string') {
            return {
              text: results,
              success: true,
            };
          }
        }

        return {
          text: '',
          success: false,
          error: 'No speech recognized',
        };
      } catch (err: any) {
        console.warn('[SpeechService] Native Android speech recognition error:', err);
        return {
          text: '',
          success: false,
          error: err?.message || 'Speech recognition unavailable',
        };
      }
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return new Promise((resolve) => {
        const SpeechRec =
          (window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition;

        if (!SpeechRec) {
          resolve({
            text: '',
            success: false,
            error: 'Web speech recognition not supported in this browser',
          });
          return;
        }

        try {
          const recognition = new SpeechRec();
          recognition.lang = 'en-US';
          recognition.continuous = false;
          recognition.interimResults = false;

          recognition.onresult = (event: any) => {
            const transcript = event.results?.[0]?.[0]?.transcript || '';
            resolve({
              text: transcript,
              success: Boolean(transcript),
            });
          };

          recognition.onerror = (event: any) => {
            resolve({
              text: '',
              success: false,
              error: event?.error || 'Recognition error',
            });
          };

          recognition.onend = () => {
            // Handled by onresult or onerror
          };

          recognition.start();
        } catch (e: any) {
          resolve({
            text: '',
            success: false,
            error: e?.message || 'Failed to start web speech',
          });
        }
      });
    }

    return {
      text: '',
      success: false,
      error: 'Platform speech recognition unsupported',
    };
  }
}

export const speechService = new SpeechRecognitionService();
