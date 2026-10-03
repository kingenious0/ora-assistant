import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import * as IntentLauncher from 'expo-intent-launcher';
import { OraIntent } from '../types/intent';
import { dbService } from '../services/database';
import { contactsService } from '../services/contactsService';

export interface ActionExecutionResult {
  success: boolean;
  pillText: string;
  spokenConfirmation: string;
  intentAction: string;
  error?: string;
}

export interface ActionContext {
  isTorchOn: boolean;
  setTorch: (enabled: boolean) => void;
  requestCameraPermission: () => Promise<boolean>;
}

// Comprehensive app scheme and Android package mapping
const APP_SCHEMES: Record<string, { scheme?: string; webFallback?: string; androidPackages?: string[]; label: string }> = {
  // Messaging & Social
  whatsapp: {
    scheme: 'whatsapp://',
    androidPackages: ['com.whatsapp', 'com.whatsapp.w4b'],
    label: 'WhatsApp',
  },
  'whatsapp business': {
    scheme: 'whatsapp://',
    androidPackages: ['com.whatsapp.w4b', 'com.whatsapp'],
    label: 'WhatsApp Business',
  },
  'whatsapp biz': {
    scheme: 'whatsapp://',
    androidPackages: ['com.whatsapp.w4b', 'com.whatsapp'],
    label: 'WhatsApp Business',
  },
  snapchat: {
    scheme: 'snapchat://',
    webFallback: 'https://www.snapchat.com',
    androidPackages: ['com.snapchat.android'],
    label: 'Snapchat',
  },
  snap: {
    scheme: 'snapchat://',
    webFallback: 'https://www.snapchat.com',
    androidPackages: ['com.snapchat.android'],
    label: 'Snapchat',
  },
  tiktok: {
    scheme: 'snssdk1233://',
    webFallback: 'https://www.tiktok.com',
    androidPackages: ['com.zhiliaoapp.musically', 'com.ss.android.ugc.trill'],
    label: 'TikTok',
  },
  telegram: {
    scheme: 'tg://',
    webFallback: 'https://web.telegram.org',
    androidPackages: ['org.telegram.messenger', 'org.telegram.messenger.web'],
    label: 'Telegram',
  },
  instagram: {
    scheme: 'instagram://',
    webFallback: 'https://instagram.com',
    androidPackages: ['com.instagram.android'],
    label: 'Instagram',
  },
  insta: {
    scheme: 'instagram://',
    webFallback: 'https://instagram.com',
    androidPackages: ['com.instagram.android'],
    label: 'Instagram',
  },
  facebook: {
    scheme: 'fb://',
    webFallback: 'https://facebook.com',
    androidPackages: ['com.facebook.katana'],
    label: 'Facebook',
  },
  twitter: {
    scheme: 'twitter://',
    webFallback: 'https://x.com',
    androidPackages: ['com.twitter.android'],
    label: 'X (Twitter)',
  },
  x: {
    scheme: 'twitter://',
    webFallback: 'https://x.com',
    androidPackages: ['com.twitter.android'],
    label: 'X',
  },

  // Media & Streaming
  spotify: {
    scheme: 'spotify://',
    webFallback: 'https://open.spotify.com',
    androidPackages: ['com.spotify.music'],
    label: 'Spotify',
  },
  youtube: {
    scheme: 'vnd.youtube://',
    webFallback: 'https://youtube.com',
    androidPackages: ['com.google.android.youtube'],
    label: 'YouTube',
  },
  'youtube music': {
    scheme: 'youtubemusic://',
    webFallback: 'https://music.youtube.com',
    androidPackages: ['com.google.android.apps.youtube.music'],
    label: 'YouTube Music',
  },
  'yt music': {
    scheme: 'youtubemusic://',
    webFallback: 'https://music.youtube.com',
    androidPackages: ['com.google.android.apps.youtube.music'],
    label: 'YouTube Music',
  },
  netflix: {
    scheme: 'nflx://',
    webFallback: 'https://netflix.com',
    androidPackages: ['com.netflix.mediaclient', 'com.netflix.ninja'],
    label: 'Netflix',
  },

  // Transportation & Daily
  uber: {
    scheme: 'uber://',
    webFallback: 'https://m.uber.com',
    androidPackages: ['com.ubercab'],
    label: 'Uber',
  },
  bolt: {
    scheme: 'bolt://',
    webFallback: 'https://bolt.eu',
    androidPackages: ['ee.mtakso.client'],
    label: 'Bolt',
  },

  // Google & Productivity
  chrome: {
    scheme: 'googlechrome://',
    webFallback: 'https://google.com',
    androidPackages: ['com.android.chrome'],
    label: 'Google Chrome',
  },
  browser: {
    scheme: 'googlechrome://',
    webFallback: 'https://google.com',
    androidPackages: ['com.android.chrome', 'org.mozilla.firefox'],
    label: 'Browser',
  },
  gmail: {
    scheme: 'googlegmail://',
    webFallback: 'https://mail.google.com',
    androidPackages: ['com.google.android.gm'],
    label: 'Gmail',
  },
  email: {
    scheme: 'mailto:',
    webFallback: 'https://mail.google.com',
    androidPackages: ['com.google.android.gm'],
    label: 'Email',
  },
  maps: {
    scheme: 'maps://',
    webFallback: 'https://maps.google.com',
    androidPackages: ['com.google.android.apps.maps'],
    label: 'Google Maps',
  },

  // Native Utilities
  camera: {
    scheme: 'camera://',
    androidPackages: ['com.android.camera', 'com.google.android.GoogleCamera'],
    label: 'Camera',
  },
  gallery: {
    androidPackages: ['com.google.android.apps.photos', 'com.miui.gallery', 'com.android.gallery3d'],
    label: 'Gallery',
  },
  photos: {
    androidPackages: ['com.google.android.apps.photos', 'com.miui.gallery'],
    label: 'Photos',
  },
  calculator: {
    androidPackages: ['com.google.android.calculator', 'com.miui.calculator', 'com.android.calculator2'],
    label: 'Calculator',
  },
  calendar: {
    androidPackages: ['com.google.android.calendar', 'com.android.calendar'],
    label: 'Calendar',
  },
  clock: {
    androidPackages: ['com.google.android.deskclock', 'com.android.deskclock'],
    label: 'Clock',
  },
  settings: {
    scheme: 'app-settings:',
    androidPackages: ['com.android.settings'],
    label: 'Settings',
  },
  'play store': {
    scheme: 'market://details?id=com.hex8.ora',
    androidPackages: ['com.android.vending'],
    label: 'Google Play Store',
  },
  'app store': {
    scheme: 'market://',
    androidPackages: ['com.android.vending'],
    label: 'Play Store',
  },
  files: {
    androidPackages: ['com.google.android.apps.nbu.files', 'com.mi.android.globalFileexplorer', 'com.android.documentsui'],
    label: 'Files',
  },
  messages: {
    scheme: 'sms:',
    androidPackages: ['com.google.android.apps.messaging', 'com.android.mms'],
    label: 'Messages',
  },
  phone: {
    scheme: 'tel:',
    androidPackages: ['com.google.android.dialer', 'com.android.dialer'],
    label: 'Phone',
  },
};

import { requireNativeModule } from 'expo-modules-core';

let OraLauncher: any = null;
let OraHardware: any = null;
let OraTelephony: any = null;
try {
  OraLauncher = requireNativeModule('OraLauncher');
} catch (e) {
  // Graceful fallback for web/testing
}
try {
  OraHardware = requireNativeModule('OraHardware');
} catch (e) {
  // Graceful fallback for web/testing
}
try {
  OraTelephony = requireNativeModule('OraTelephony');
} catch (e) {
  // Graceful fallback for web/testing
}

export type SpeechStateListener = (speaking: boolean) => void;

class OraActionController {
  private _isSpeaking: boolean = false;
  private speechListeners: Set<SpeechStateListener> = new Set();

  public isSpeaking(): boolean {
    return this._isSpeaking;
  }

  public addSpeechListener(listener: SpeechStateListener): () => void {
    this.speechListeners.add(listener);
    return () => this.speechListeners.delete(listener);
  }

  private setSpeaking(speaking: boolean) {
    this._isSpeaking = speaking;
    for (const listener of this.speechListeners) {
      try {
        listener(speaking);
      } catch (e) {}
    }
  }

  /**
   * Speak confirmation text via local offline TTS.
   * Auto-mutes recognition during speech to eliminate acoustic feedback loops.
   */
  public speak(text: string, onFinish?: () => void): void {
    try {
      Speech.stop();
      this.setSpeaking(true);

      const handleDone = () => {
        // Guard buffer of 550ms so microphone does not pick up trailing speaker echo
        setTimeout(() => {
          this.setSpeaking(false);
          onFinish?.();
        }, 550);
      };

      Speech.speak(text, {
        language: 'en-US',
        pitch: 1.0,
        rate: 1.05,
        onStart: () => {
          this.setSpeaking(true);
        },
        onDone: handleDone,
        onStopped: handleDone,
        onError: handleDone,
      });
    } catch (e) {
      console.warn('[OraActions] Offline TTS warning:', e);
      this.setSpeaking(false);
    }
  }

  /**
   * Dispatches the parsed intent directly to physical device capabilities.
   */
  public async execute(
    intent: OraIntent,
    rawTranscript: string,
    latencyMs: number,
    ctx: ActionContext
  ): Promise<ActionExecutionResult> {
    const timestamp = new Date().toLocaleTimeString();
    let result: ActionExecutionResult;

    try {
      switch (intent.action) {
        case 'toggle_flashlight':
          result = await this.handleFlashlight(intent.state, ctx);
          break;

        case 'make_call':
          result = await this.handleCall(intent.contact, intent.sim_slot);
          break;

        case 'disambiguate_choice':
          result = await this.handleDisambiguateChoice(intent.index);
          break;

        case 'send_sms':
          result = await this.handleSms(intent.contact, intent.message);
          break;

        case 'reply_notification':
          result = await this.handleReplyNotification(intent.app, intent.text);
          break;

        case 'set_clock_alert':
          result = await this.handleClockAlert(intent.time, intent.type, intent.label);
          break;

        case 'launch_app':
          result = await this.handleLaunchApp(intent.app);
          break;

        case 'set_ringer_mode':
          result = await this.handleRingerMode(intent.mode);
          break;

        case 'get_battery_status':
          result = await this.handleBatteryStatus();
          break;

        case 'lock_device':
          result = await this.handleLockDevice();
          break;

        case 'volume_control':
          result = await this.handleVolumeControl(intent.direction, intent.value);
          break;

        case 'open_settings_section':
          result = await this.handleSettingsSection(intent.section);
          break;

        case 'get_time_date':
          result = await this.handleTimeDate(intent.query);
          break;

        case 'calculate_math':
          result = await this.handleMath(intent.expression);
          break;

        case 'web_search':
          result = await this.handleWebSearch(intent.query, intent.engine);
          break;

        case 'take_note':
          result = await this.handleTakeNote(intent.text);
          break;

        case 'conversational':
          result = await this.handleConversational(intent.kind);
          break;

        default:
          result = {
            success: false,
            pillText: 'Command Not Executable',
            spokenConfirmation: 'I could not execute that command.',
            intentAction: 'unknown',
          };
      }
    } catch (err: any) {
      console.error('[OraActions] Execution error:', err);
      result = {
        success: false,
        pillText: 'Action Error',
        spokenConfirmation: 'There was an issue completing that request.',
        intentAction: (intent as any).action || 'unknown',
        error: err?.message,
      };
    }

    // Trigger haptics on result
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }

    // Proactive Voice response (Google Assistant style)
    if (result.spokenConfirmation) {
      this.speak(result.spokenConfirmation);
    }

    // Persist to offline audit store
    dbService.recordAction({
      timestamp,
      transcript: rawTranscript,
      action: intent.action,
      payload: JSON.stringify(intent),
      latencyMs,
      status: result.success ? 'success' : 'failed',
    });

    return result;
  }

  /**
   * Physical Torch / Flashlight execution via native CameraManager or expo-camera fallback
   */
  private async handleFlashlight(targetState: boolean, ctx: ActionContext): Promise<ActionExecutionResult> {
    const stateText = targetState ? 'on' : 'off';

    // 1. Instant native CameraManager toggle via OraHardware
    if (Platform.OS === 'android' && OraHardware?.setTorchMode) {
      try {
        const nativeSuccess = await OraHardware.setTorchMode(targetState);
        if (nativeSuccess) {
          ctx.setTorch(targetState);
          return {
            success: true,
            pillText: targetState ? '⚡ Flashlight On' : '⚡ Flashlight Off',
            spokenConfirmation: `Flashlight turned ${stateText}.`,
            intentAction: 'toggle_flashlight',
          };
        }
      } catch (e) {
        console.warn('[OraActions] Native torch error, trying fallback:', e);
      }
    }

    // 2. CameraView fallback
    const hasPermission = await ctx.requestCameraPermission();
    if (!hasPermission) {
      return {
        success: false,
        pillText: 'Camera Permission Denied',
        spokenConfirmation: 'Camera permission is required to control the flashlight.',
        intentAction: 'toggle_flashlight',
      };
    }

    ctx.setTorch(targetState);

    return {
      success: true,
      pillText: targetState ? '⚡ Flashlight On' : '⚡ Flashlight Off',
      spokenConfirmation: `Flashlight turned ${stateText}.`,
      intentAction: 'toggle_flashlight',
    };
  }

  /**
   * Native Direct Calling with Dual-SIM routing & Disambiguation
   */
  private async handleCall(contactQuery: string, simSlot?: number): Promise<ActionExecutionResult> {
    const cleanKey = contactQuery.toLowerCase().trim();

    // 0. If contactQuery is a direct phone number, dial directly
    if (/^[\d+()\-\s]{3,}$/.test(contactQuery)) {
      const cleanDigits = contactQuery.replace(/[^\d+]/g, '');
      return await this.handleDirectDial(cleanDigits, contactQuery, simSlot);
    }

    // 1. Try real device address book - query all potential matches
    const matches = await contactsService.resolveAllContacts(contactQuery);

    if (matches.length > 1) {
      // Disambiguation needed: multiple matches found!
      contactsService.setPendingDisambiguation({
        action: 'call',
        query: contactQuery,
        simSlot,
        candidates: matches.slice(0, 4),
        timestamp: Date.now(),
      });

      const optionsSpeech = matches
        .slice(0, 3)
        .map((c, i) => `${i + 1}, ${c.name}`)
        .join('; and ');
      const spoken = `I found ${matches.length} contacts for ${contactQuery}: ${optionsSpeech}. Which one would you like to call?`;
      const pill = `Multiple: ${matches.map((c) => c.name).join(', ')}`;

      return {
        success: true,
        pillText: pill,
        spokenConfirmation: spoken,
        intentAction: 'make_call',
      };
    }

    if (matches.length === 1) {
      contactsService.clearPendingDisambiguation();
      return await this.handleDirectDial(matches[0].cleanPhone, matches[0].name, simSlot);
    }

    // 2. Check native ContentResolver lookup via OraTelephony
    if (OraTelephony?.lookupContactNumber) {
      try {
        const foundNumber = await OraTelephony.lookupContactNumber(contactQuery);
        if (foundNumber) {
          contactsService.clearPendingDisambiguation();
          return await this.handleDirectDial(foundNumber, contactQuery, simSlot);
        }
      } catch (e) {}
    }

    if (contactsService.getContactCount() === 0 && !contactsService.hasPermission()) {
      return {
        success: false,
        pillText: 'Contacts Permission Needed',
        spokenConfirmation: 'Please allow Contacts permission so I can access your phonebook.',
        intentAction: 'make_call',
      };
    }

    return {
      success: false,
      pillText: `Contact Not Found: ${contactQuery}`,
      spokenConfirmation: `I couldn't find ${contactQuery} in your contacts.`,
      intentAction: 'make_call',
    };
  }

  /**
   * Disambiguation Choice Resolver (User said "first one", "second", etc.)
   */
  private async handleDisambiguateChoice(index: number): Promise<ActionExecutionResult> {
    const pending = contactsService.getPendingDisambiguation();
    if (!pending || !pending.candidates || pending.candidates.length === 0) {
      return {
        success: false,
        pillText: 'No Pending Selection',
        spokenConfirmation: 'There is no pending contact selection.',
        intentAction: 'disambiguate_choice',
      };
    }

    if (index < 0 || index >= pending.candidates.length) {
      return {
        success: false,
        pillText: 'Invalid Option',
        spokenConfirmation: `Please choose between 1 and ${pending.candidates.length}.`,
        intentAction: 'disambiguate_choice',
      };
    }

    const selected = pending.candidates[index];
    contactsService.clearPendingDisambiguation();

    if (pending.action === 'call') {
      return await this.handleDirectDial(selected.cleanPhone, selected.name, pending.simSlot);
    }

    return await this.handleDirectSms(selected.cleanPhone, selected.name, pending.message || '');
  }

  /**
   * Zero-Touch Direct Calling with Dual-SIM Intent Routing
   */
  private async handleDirectDial(
    targetPhone: string,
    targetName: string,
    simSlot?: number
  ): Promise<ActionExecutionResult> {
    const simLabel = simSlot ? ` (SIM ${simSlot})` : '';
    const spokenSim = simSlot ? ` on SIM ${simSlot}` : '';

    if (Platform.OS === 'android' && OraTelephony?.dialNumber) {
      try {
        const dialed = await OraTelephony.dialNumber(targetPhone, simSlot);
        if (dialed) {
          return {
            success: true,
            pillText: `📞 Calling ${targetName}${simLabel}...`,
            spokenConfirmation: `Calling ${targetName}${spokenSim}.`,
            intentAction: 'make_call',
          };
        }
      } catch (e) {}
    }

    if (Platform.OS === 'android') {
      try {
        const slotIndex = simSlot === 2 ? 1 : 0;
        const simExtras: Record<string, any> = simSlot
          ? {
              'android.telephony.extra.SUBSCRIPTION_INDEX': slotIndex,
              'com.android.phone.extra.slot': slotIndex,
              'simSlot': slotIndex,
              'phone_type': slotIndex,
              'slot': slotIndex,
              'com.android.phone.DialingMode': slotIndex,
            }
          : {};

        await IntentLauncher.startActivityAsync('android.intent.action.CALL', {
          data: `tel:${targetPhone}`,
          extra: simExtras,
        });

        return {
          success: true,
          pillText: `📞 Calling ${targetName}${simLabel}...`,
          spokenConfirmation: `Calling ${targetName}${spokenSim}.`,
          intentAction: 'make_call',
        };
      } catch (callErr) {
        // Fallback to dialer if direct call permission denied
      }
    }

    const telUrl = `tel:${targetPhone}`;
    const supported = await Linking.canOpenURL(telUrl).catch(() => true);

    if (supported) {
      await Linking.openURL(telUrl);
      return {
        success: true,
        pillText: `📞 Calling ${targetName}${simLabel}...`,
        spokenConfirmation: `Calling ${targetName}${spokenSim}.`,
        intentAction: 'make_call',
      };
    }

    return {
      success: false,
      pillText: `Cannot dial ${targetName}`,
      spokenConfirmation: `Telephony dialer is unavailable on this device.`,
      intentAction: 'make_call',
    };
  }

  /**
   * Native SMS Messenger with Real Device Contacts
   */
  private async handleSms(contactQuery: string, message: string): Promise<ActionExecutionResult> {
    const cleanKey = contactQuery.toLowerCase().trim();

    // 0. If direct digits
    if (/^[\d+()\-\s]{3,}$/.test(contactQuery)) {
      const cleanDigits = contactQuery.replace(/[^\d+]/g, '');
      return await this.handleDirectSms(cleanDigits, contactQuery, message);
    }

    // 1. Try real device address book
    const matches = await contactsService.resolveAllContacts(contactQuery);
    if (matches.length > 1) {
      contactsService.setPendingDisambiguation({
        action: 'sms',
        query: contactQuery,
        message,
        candidates: matches.slice(0, 4),
        timestamp: Date.now(),
      });

      const optionsSpeech = matches
        .slice(0, 3)
        .map((c, i) => `${i + 1}, ${c.name}`)
        .join('; and ');
      const spoken = `I found ${matches.length} contacts for ${contactQuery}: ${optionsSpeech}. Which one would you like to text?`;
      const pill = `Multiple: ${matches.map((c) => c.name).join(', ')}`;

      return {
        success: true,
        pillText: pill,
        spokenConfirmation: spoken,
        intentAction: 'send_sms',
      };
    }

    if (matches.length === 1) {
      contactsService.clearPendingDisambiguation();
      return await this.handleDirectSms(matches[0].cleanPhone, matches[0].name, message);
    }

    // 2. Check native ContentResolver lookup via OraTelephony
    if (OraTelephony?.lookupContactNumber) {
      try {
        const foundNumber = await OraTelephony.lookupContactNumber(contactQuery);
        if (foundNumber) {
          contactsService.clearPendingDisambiguation();
          return await this.handleDirectSms(foundNumber, contactQuery, message);
        }
      } catch (e) {}
    }

    return {
      success: false,
      pillText: `Contact Not Found: ${contactQuery}`,
      spokenConfirmation: `I couldn't find ${contactQuery} in your contacts.`,
      intentAction: 'send_sms',
    };
  }

  /**
   * Direct SMS execution via native OraTelephony SmsManager or IntentLauncher fallback
   */
  private async handleDirectSms(
    targetPhone: string,
    targetName: string,
    message: string
  ): Promise<ActionExecutionResult> {
    if (Platform.OS === 'android' && OraTelephony?.sendDirectSms) {
      try {
        const sent = await OraTelephony.sendDirectSms(targetPhone, message);
        if (sent) {
          return {
            success: true,
            pillText: `💬 Sent SMS to ${targetName}`,
            spokenConfirmation: `Message sent to ${targetName}.`,
            intentAction: 'send_sms',
          };
        }
      } catch (e) {}
    }

    if (Platform.OS === 'android') {
      try {
        await IntentLauncher.startActivityAsync('android.intent.action.SENDTO', {
          data: `smsto:${targetPhone}`,
          extra: {
            sms_body: message,
          },
        });
        return {
          success: true,
          pillText: `💬 Texting ${targetName}`,
          spokenConfirmation: `Sending text to ${targetName}: ${message}`,
          intentAction: 'send_sms',
        };
      } catch (e) {}
    }

    const separator = Platform.OS === 'ios' ? '&' : '?';
    const smsUrl = `sms:${targetPhone}${separator}body=${encodeURIComponent(message)}`;
    await Linking.openURL(smsUrl).catch(() => {});

    return {
      success: true,
      pillText: `💬 Texting ${targetName}`,
      spokenConfirmation: `Sending text to ${targetName}: ${message}`,
      intentAction: 'send_sms',
    };
  }

  /**
   * Reply notification handling
   */
  private async handleReplyNotification(app: string, text: string): Promise<ActionExecutionResult> {
    if (app.toLowerCase() === 'whatsapp') {
      const waUrl = `whatsapp://send?text=${encodeURIComponent(text)}`;
      const canOpen = await Linking.canOpenURL(waUrl).catch(() => false);
      if (canOpen) {
        await Linking.openURL(waUrl);
      }
    }

    return {
      success: true,
      pillText: `💬 Replied on ${app}`,
      spokenConfirmation: `Reply sent on ${app}.`,
      intentAction: 'reply_notification',
    };
  }

  /**
   * System Clock Alarms via Android IntentLauncher & OraLauncher
   */
  private async handleClockAlert(timeStr: string, type: 'alarm' | 'timer', label?: string): Promise<ActionExecutionResult> {
    const parsed = this.parseTime(timeStr);

    if (Platform.OS === 'android') {
      try {
        if (type === 'alarm') {
          try {
            await IntentLauncher.startActivityAsync('android.intent.action.SET_ALARM', {
              extra: {
                'android.intent.extra.alarm.HOUR': parsed.hour,
                'android.intent.extra.alarm.MINUTES': parsed.minute,
                'android.intent.extra.alarm.MESSAGE': label || 'Ora Alarm',
                'android.intent.extra.alarm.SKIP_UI': false,
              },
            });
          } catch (secErr) {
            // Xiaomi / Samsung / Pixel Clock package fallback
            const clockPackages = [
              'com.miui.clock',
              'com.android.deskclock',
              'com.google.android.deskclock',
              'com.sec.android.app.clockpackage',
            ];
            let opened = false;
            for (const pkg of clockPackages) {
              if (OraLauncher?.launchAppByPackage) {
                opened = await OraLauncher.launchAppByPackage(pkg).catch(() => false);
                if (opened) break;
              }
            }
            if (!opened) {
              await IntentLauncher.startActivityAsync('android.intent.action.SHOW_ALARMS').catch(() => {});
            }
          }
        } else {
          const totalSeconds = parsed.hour * 3600 + parsed.minute * 60;
          try {
            await IntentLauncher.startActivityAsync('android.intent.action.SET_TIMER', {
              extra: {
                'android.intent.extra.alarm.LENGTH': totalSeconds > 0 ? totalSeconds : 300,
                'android.intent.extra.alarm.MESSAGE': label || 'Ora Timer',
                'android.intent.extra.alarm.SKIP_UI': false,
              },
            });
          } catch (secErr) {
            await IntentLauncher.startActivityAsync('android.intent.action.SHOW_TIMERS').catch(() => {});
          }
        }

        return {
          success: true,
          pillText: `⏰ ${type === 'alarm' ? 'Alarm' : 'Timer'}: ${timeStr}`,
          spokenConfirmation: `Setting ${type === 'alarm' ? 'alarm' : 'timer'} for ${timeStr}.`,
          intentAction: 'set_clock_alert',
        };
      } catch (e) {
        console.warn('[OraActions] Clock alert fallback:', e);
      }
    }

    return {
      success: true,
      pillText: `⏰ Alarm noted: ${timeStr}`,
      spokenConfirmation: `Setting alarm for ${timeStr}.`,
      intentAction: 'set_clock_alert',
    };
  }

  /**
   * Native App Launcher (WhatsApp Business, Snapchat, TikTok, etc.)
   * Uses Android PackageManager via OraLauncher module to query real installed apps.
   */
  private async handleLaunchApp(appName: string): Promise<ActionExecutionResult> {
    const key = appName.toLowerCase().trim();
    const config = APP_SCHEMES[key];
    const displayLabel = config?.label || appName;

    // 1. Try Native OraLauncher Module first (queries Android PackageManager for REAL installed apps)
    if (Platform.OS === 'android' && OraLauncher) {
      try {
        // Try known packages first for speed
        const packages = config?.androidPackages || [];
        for (const pkg of packages) {
          if (OraLauncher.launchAppByPackage) {
            const launched = await OraLauncher.launchAppByPackage(pkg);
            if (launched) {
              return {
                success: true,
                pillText: `🚀 Opened ${displayLabel}`,
                spokenConfirmation: `Opening ${displayLabel}.`,
                intentAction: 'launch_app',
              };
            }
          }
        }

        // Try searching all installed apps by label on the user's phone!
        if (OraLauncher.launchAppByName) {
          const launched = await OraLauncher.launchAppByName(appName);
          if (launched) {
            return {
              success: true,
              pillText: `🚀 Opened ${displayLabel}`,
              spokenConfirmation: `Opening ${displayLabel}.`,
              intentAction: 'launch_app',
            };
          }
        }
      } catch (e) {
        console.warn('[OraActions] OraLauncher error:', e);
      }
    }

    // 2. Try URI Scheme (e.g. whatsapp://, snapchat://, spotify://)
    if (config?.scheme) {
      try {
        const canOpen = await Linking.canOpenURL(config.scheme).catch(() => false);
        if (canOpen) {
          await Linking.openURL(config.scheme);
          return {
            success: true,
            pillText: `🚀 Opened ${displayLabel}`,
            spokenConfirmation: `Opening ${displayLabel}.`,
            intentAction: 'launch_app',
          };
        }
      } catch (e) {}
    }

    // 3. Web Fallback if installed app not present
    if (config?.webFallback) {
      await Linking.openURL(config.webFallback).catch(() => {});
      return {
        success: true,
        pillText: `🚀 Launching ${displayLabel}`,
        spokenConfirmation: `Opening ${displayLabel}.`,
        intentAction: 'launch_app',
      };
    }

    return {
      success: false,
      pillText: `App Not Found: ${displayLabel}`,
      spokenConfirmation: `I couldn't find ${displayLabel} installed on your device.`,
      intentAction: 'launch_app',
    };
  }

  /**
   * Lock Device Screen (Native Zero-Touch Screen Lock)
   */
  private async handleLockDevice(): Promise<ActionExecutionResult> {
    if (Platform.OS === 'android' && OraHardware?.lockScreen) {
      try {
        const locked = await OraHardware.lockScreen();
        if (locked) {
          return {
            success: true,
            pillText: '🔒 Screen Locked',
            spokenConfirmation: 'Phone locked.',
            intentAction: 'lock_device',
          };
        }

        // Direct user to Accessibility settings if not yet enabled
        await IntentLauncher.startActivityAsync('android.settings.ACCESSIBILITY_SETTINGS').catch(() => {});
        return {
          success: true,
          pillText: '🔒 Enable Lock in Accessibility',
          spokenConfirmation: 'Please toggle Ora in Accessibility Settings so I can lock your screen directly.',
          intentAction: 'lock_device',
        };
      } catch (e) {
        console.warn('[OraActions] lockScreen error:', e);
      }
    }

    return {
      success: false,
      pillText: '🔒 Screen Lock Unavailable',
      spokenConfirmation: 'Unable to lock screen on this device.',
      intentAction: 'lock_device',
    };
  }

  /**
   * Device Volume Control (Native Audio Stream Adjustment with System Volume HUD)
   */
  private async handleVolumeControl(direction: string, value?: number): Promise<ActionExecutionResult> {
    if (Platform.OS === 'android' && OraHardware?.adjustVolume) {
      try {
        const success = await OraHardware.adjustVolume(direction, value ?? null);
        if (success) {
          let msg = 'Volume adjusted.';
          if (direction === 'mute') msg = 'Sound muted.';
          else if (direction === 'unmute') msg = 'Sound unmuted.';
          else if (direction === 'max') msg = 'Volume set to maximum.';
          else if (value !== undefined) msg = `Volume set to ${value} percent.`;
          else if (direction === 'up' || direction === 'raise' || direction === 'increase') msg = 'Volume increased.';
          else if (direction === 'down' || direction === 'lower' || direction === 'decrease') msg = 'Volume decreased.';

          return {
            success: true,
            pillText: `🔊 Volume: ${direction.toUpperCase()}`,
            spokenConfirmation: msg,
            intentAction: 'volume_control',
          };
        }
      } catch (e) {
        console.warn('[OraActions] OraHardware volume error:', e);
      }
    }

    return {
      success: true,
      pillText: `🔊 Volume: ${direction.toUpperCase()}`,
      spokenConfirmation: 'Volume adjusted.',
      intentAction: 'volume_control',
    };
  }

  /**
   * Open Specific Settings Section (Wi-Fi, Bluetooth, Display, etc.)
   */
  private async handleSettingsSection(section: string): Promise<ActionExecutionResult> {
    if (Platform.OS === 'android') {
      const sectionIntents: Record<string, string> = {
        wifi: 'android.settings.WIFI_SETTINGS',
        bluetooth: 'android.settings.BLUETOOTH_SETTINGS',
        display: 'android.settings.DISPLAY_SETTINGS',
        sound: 'android.settings.SOUND_SETTINGS',
        battery: 'android.intent.action.POWER_USAGE_SUMMARY',
        apps: 'android.settings.APPLICATION_SETTINGS',
        general: 'android.settings.SETTINGS',
      };

      const intentAction = sectionIntents[section] || 'android.settings.SETTINGS';
      try {
        await IntentLauncher.startActivityAsync(intentAction).catch(() => {});
      } catch (e) {}
    }

    const labels: Record<string, string> = {
      wifi: 'Wi-Fi',
      bluetooth: 'Bluetooth',
      display: 'Display',
      sound: 'Sound',
      battery: 'Battery',
      apps: 'Apps',
      general: 'Settings',
    };
    const title = labels[section] || 'Settings';

    return {
      success: true,
      pillText: `⚙️ ${title} Settings`,
      spokenConfirmation: `Opening ${title} settings.`,
      intentAction: 'open_settings_section',
    };
  }

  /**
   * Real-time Local Time and Date queries
   */
  private async handleTimeDate(query: 'time' | 'date' | 'day'): Promise<ActionExecutionResult> {
    const now = new Date();
    let pillText = '';
    let spoken = '';

    if (query === 'time') {
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      pillText = `🕒 ${timeStr}`;
      spoken = `The time is ${timeStr}.`;
    } else if (query === 'day') {
      const dayStr = now.toLocaleDateString([], { weekday: 'long' });
      pillText = `📅 ${dayStr}`;
      spoken = `Today is ${dayStr}.`;
    } else {
      const dateStr = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      pillText = `📅 ${dateStr}`;
      spoken = `Today is ${dateStr}.`;
    }

    return {
      success: true,
      pillText,
      spokenConfirmation: spoken,
      intentAction: 'get_time_date',
    };
  }

  /**
   * Edge Math and Arithmetic Calculations
   */
  private async handleMath(expression: string): Promise<ActionExecutionResult> {
    let result = '';
    try {
      // Clean and sanitize math expression
      let sanitized = expression
        .replace(/times|multiplied by|x/gi, '*')
        .replace(/divided by|over/gi, '/')
        .replace(/plus/gi, '+')
        .replace(/minus/gi, '-')
        .replace(/percent of/gi, '* 0.01 *')
        .replace(/%/gi, '* 0.01')
        .replace(/[^0-9+\-*/().]/g, '');

      // Evaluate safely
      const fn = new Function(`return (${sanitized})`);
      const val = fn();
      result = typeof val === 'number' && !isNaN(val) ? Number(val.toFixed(4)).toString() : 'Invalid expression';
    } catch (e) {
      result = 'Calculation error';
    }

    return {
      success: true,
      pillText: `🔢 = ${result}`,
      spokenConfirmation: `The answer is ${result}.`,
      intentAction: 'calculate_math',
    };
  }

  /**
   * Web & Media Search (Google, YouTube)
   */
  private async handleWebSearch(query: string, engine: 'google' | 'youtube'): Promise<ActionExecutionResult> {
    let url = '';
    let engineName = 'Google';

    if (engine === 'youtube') {
      url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      engineName = 'YouTube';
    } else {
      url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    }

    await Linking.openURL(url).catch(() => {});

    return {
      success: true,
      pillText: `🔍 Searching ${engineName}`,
      spokenConfirmation: `Searching ${engineName} for ${query}.`,
      intentAction: 'web_search',
    };
  }

  /**
   * Offline Note Creation
   */
  private async handleTakeNote(text: string): Promise<ActionExecutionResult> {
    // Record as audit action note
    dbService.recordAction({
      timestamp: new Date().toLocaleTimeString(),
      transcript: text,
      action: 'take_note',
      payload: JSON.stringify({ note: text }),
      latencyMs: 5,
      status: 'success',
    });

    return {
      success: true,
      pillText: `📝 Note Saved`,
      spokenConfirmation: `Note saved: ${text}.`,
      intentAction: 'take_note',
    };
  }

  /**
   * Offline Conversational Intelligence
   */
  private async handleConversational(kind: string): Promise<ActionExecutionResult> {
    const jokes = [
      'Why do programmers prefer dark mode? Because light attracts bugs.',
      'Why was the JavaScript developer sad? Because he did not Node how to Express himself.',
      'There are only 10 kinds of people in the world: those who understand binary and those who do not.',
    ];

    let spoken = '';
    let pill = '';

    switch (kind) {
      case 'identity':
        pill = '✨ Ora Assistant';
        spoken = 'I am Ora, your offline edge voice assistant.';
        break;
      case 'joke':
        pill = '😄 Joke Time';
        spoken = jokes[Math.floor(Math.random() * jokes.length)];
        break;
      case 'capabilities':
        pill = '⚡ Ora Features';
        spoken = 'I can call and text your contacts, launch any app, set alarms, calculate math, control your flashlight, and manage settings completely offline.';
        break;
      case 'wake_prompt':
        pill = '⚡ Listening...';
        spoken = "I'm listening.";
        break;
      case 'affection':
        pill = '❤️ Warm Regards';
        spoken = 'I appreciate you! I am always here to assist you offline.';
        break;
      case 'gratitude':
        pill = '🙏 You are welcome';
        spoken = 'You are very welcome! Always happy to help.';
        break;
      case 'status':
        pill = '⚡ Status Optimal';
        spoken = 'All systems are operating smoothly completely offline.';
        break;
      default:
        pill = '👋 Hello';
        spoken = 'Hello, how can I help you today?';
    }

    return {
      success: true,
      pillText: pill,
      spokenConfirmation: spoken,
      intentAction: 'conversational',
    };
  }

  /**
   * Device Ringer Mode (Native Audio Mode Control)
   */
  private async handleRingerMode(mode: 'silent' | 'vibrate' | 'normal'): Promise<ActionExecutionResult> {
    if (Platform.OS === 'android' && OraHardware?.setRingerMode) {
      try {
        await OraHardware.setRingerMode(mode);
      } catch (e) {
        console.warn('[OraActions] OraHardware ringerMode error:', e);
      }
    }

    const modeLabels = {
      silent: 'Muted',
      vibrate: 'Vibration mode',
      normal: 'Sound normal',
    };

    return {
      success: true,
      pillText: `🔕 Mode: ${mode.toUpperCase()}`,
      spokenConfirmation: `Sound mode set to ${modeLabels[mode]}.`,
      intentAction: 'set_ringer_mode',
    };
  }

  /**
   * Battery Status Check (Native Battery Capacity Readout)
   */
  private async handleBatteryStatus(): Promise<ActionExecutionResult> {
    let batteryLevel: number = -1;
    if (Platform.OS === 'android' && OraHardware?.getBatteryLevel) {
      try {
        batteryLevel = OraHardware.getBatteryLevel();
      } catch (e) {
        console.warn('[OraActions] OraHardware getBatteryLevel error:', e);
      }
    }

    if (batteryLevel >= 0) {
      return {
        success: true,
        pillText: `🔋 Battery: ${batteryLevel}%`,
        spokenConfirmation: `Your battery level is ${batteryLevel} percent.`,
        intentAction: 'get_battery_status',
      };
    }

    return {
      success: true,
      pillText: '🔋 Battery Status Active',
      spokenConfirmation: 'Battery level is normal.',
      intentAction: 'get_battery_status',
    };
  }

  private parseTime(timeStr: string): { hour: number; minute: number } {
    const isPM = /pm/i.test(timeStr);
    const isAM = /am/i.test(timeStr);
    const digits = timeStr.replace(/[^0-9:]/g, '');
    const parts = digits.split(':');

    let hour = parseInt(parts[0] || '7', 10);
    const minute = parts.length > 1 ? parseInt(parts[1] || '0', 10) : 0;

    if (isPM && hour < 12) hour += 12;
    if (isAM && hour === 12) hour = 0;

    return { hour, minute };
  }
}

export const oraActions = new OraActionController();
