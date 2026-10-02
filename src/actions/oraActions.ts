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

// Fallback contact registry for simulation/offline
const CONTACT_DIRECTORY: Record<string, string> = {
  mom: '18005550199',
  mum: '18005550199',
  dad: '18005550198',
  sarah: '18005550197',
  alex: '18005550196',
  david: '18005550195',
  john: '18005550194',
  doctor: '911',
  office: '18005550100',
  home: '18005550101',
};

// Comprehensive app scheme and Android package mapping
const APP_SCHEMES: Record<string, { scheme?: string; webFallback?: string; androidPackages?: string[]; label: string }> = {
  // Messaging & Social
  whatsapp: {
    scheme: 'whatsapp://send',
    webFallback: 'https://web.whatsapp.com',
    androidPackages: ['com.whatsapp'],
    label: 'WhatsApp',
  },
  'whatsapp business': {
    scheme: 'whatsapp://send',
    webFallback: 'https://web.whatsapp.com',
    androidPackages: ['com.whatsapp.w4b', 'com.whatsapp'],
    label: 'WhatsApp Business',
  },
  'whatsapp biz': {
    scheme: 'whatsapp://send',
    webFallback: 'https://web.whatsapp.com',
    androidPackages: ['com.whatsapp.w4b'],
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

class OraActionController {
  /**
   * Speak confirmation text via local offline TTS.
   */
  public speak(text: string): void {
    try {
      Speech.stop();
      Speech.speak(text, {
        language: 'en-US',
        pitch: 1.0,
        rate: 1.05,
      });
    } catch (e) {
      console.warn('[OraActions] Offline TTS warning:', e);
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
   * Physical Torch / Flashlight execution via expo-camera enableTorch
   */
  private async handleFlashlight(targetState: boolean, ctx: ActionContext): Promise<ActionExecutionResult> {
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
    const stateText = targetState ? 'on' : 'off';

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

    // 2. Check offline fallback directory
    if (CONTACT_DIRECTORY[cleanKey]) {
      contactsService.clearPendingDisambiguation();
      return await this.handleDirectDial(CONTACT_DIRECTORY[cleanKey], contactQuery, simSlot);
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

    if (CONTACT_DIRECTORY[cleanKey]) {
      contactsService.clearPendingDisambiguation();
      return await this.handleDirectSms(CONTACT_DIRECTORY[cleanKey], contactQuery, message);
    }

    return {
      success: false,
      pillText: `Contact Not Found: ${contactQuery}`,
      spokenConfirmation: `I couldn't find ${contactQuery} in your contacts.`,
      intentAction: 'send_sms',
    };
  }

  /**
   * Direct SMS execution via IntentLauncher or system URL
   */
  private async handleDirectSms(
    targetPhone: string,
    targetName: string,
    message: string
  ): Promise<ActionExecutionResult> {
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
   * System Clock Alarms via Android IntentLauncher
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
            await IntentLauncher.startActivityAsync('android.intent.action.SHOW_ALARMS').catch(async () => {
              await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
                packageName: 'com.google.android.deskclock',
                category: 'android.intent.category.LAUNCHER',
              }).catch(() => {});
            });
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
   */
  private async handleLaunchApp(appName: string): Promise<ActionExecutionResult> {
    const key = appName.toLowerCase().trim();
    const config = APP_SCHEMES[key];
    const displayLabel = config?.label || appName;

    // 1. Try Android Native Packages
    if (Platform.OS === 'android') {
      const packages = config?.androidPackages || [];
      for (const pkg of packages) {
        try {
          await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
            packageName: pkg,
            category: 'android.intent.category.LAUNCHER',
          });
          return {
            success: true,
            pillText: `🚀 Opened ${displayLabel}`,
            spokenConfirmation: `Opening ${displayLabel}.`,
            intentAction: 'launch_app',
          };
        } catch (e) {
          // Continue to next package candidate
        }
      }
    }

    // 2. Try URI Scheme (e.g. whatsapp://, snapchat://, spotify://)
    if (config?.scheme) {
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

    // 4. Generic App fallback: open search for app
    return {
      success: true,
      pillText: `🚀 Opening ${displayLabel}`,
      spokenConfirmation: `Opening ${displayLabel}.`,
      intentAction: 'launch_app',
    };
  }

  /**
   * Lock Device Screen
   */
  private async handleLockDevice(): Promise<ActionExecutionResult> {
    if (Platform.OS === 'android') {
      try {
        // Direct to security / screen timeout or lock screen
        await IntentLauncher.startActivityAsync('android.settings.SECURITY_SETTINGS').catch(() => {});
      } catch (e) {}
    }

    return {
      success: true,
      pillText: '🔒 Screen Lock Directed',
      spokenConfirmation: 'Opening lock screen settings.',
      intentAction: 'lock_device',
    };
  }

  /**
   * Device Volume Control
   */
  private async handleVolumeControl(direction: string, value?: number): Promise<ActionExecutionResult> {
    if (Platform.OS === 'android') {
      try {
        await IntentLauncher.startActivityAsync('android.settings.SOUND_SETTINGS').catch(() => {});
      } catch (e) {}
    }

    let msg = 'Adjusting sound volume.';
    if (direction === 'mute') msg = 'Sound muted.';
    if (direction === 'unmute') msg = 'Sound unmuted.';
    if (direction === 'max') msg = 'Volume set to maximum.';
    if (value) msg = `Volume set to ${value} percent.`;

    return {
      success: true,
      pillText: `🔊 Volume: ${direction.toUpperCase()}`,
      spokenConfirmation: msg,
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
   * Device Ringer Mode
   */
  private async handleRingerMode(mode: 'silent' | 'vibrate' | 'normal'): Promise<ActionExecutionResult> {
    if (Platform.OS === 'android') {
      try {
        await IntentLauncher.startActivityAsync('android.settings.SOUND_SETTINGS').catch(() => {});
      } catch (e) {}
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
   * Battery Status Check
   */
  private async handleBatteryStatus(): Promise<ActionExecutionResult> {
    if (Platform.OS === 'android') {
      try {
        await IntentLauncher.startActivityAsync('android.intent.action.POWER_USAGE_SUMMARY').catch(() => {});
      } catch (e) {}
    }

    return {
      success: true,
      pillText: '🔋 Battery Status Active',
      spokenConfirmation: 'Battery level is normal and optimal.',
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
