import { OraIntent, IntentResolution } from '../types/intent';
import { fuzzyMatch } from './fuzzy';
import { contactsService } from '../services/contactsService';

const COMMON_APPS = [
  'WhatsApp',
  'WhatsApp Business',
  'Snapchat',
  'TikTok',
  'Telegram',
  'YouTube',
  'YouTube Music',
  'Spotify',
  'Instagram',
  'Twitter',
  'X',
  'Facebook',
  'Chrome',
  'Camera',
  'Settings',
  'Maps',
  'Gmail',
  'Photos',
  'Gallery',
  'Calculator',
  'Calendar',
  'Clock',
  'Messages',
  'Phone',
  'Netflix',
  'Uber',
  'Bolt',
  'Files',
  'Play Store',
];

export class NeedleEngine {
  private knownApps: string[] = COMMON_APPS;
  private knownContacts: string[] = ['Mom', 'Dad', 'Sarah', 'Alex', 'David', 'John', 'Doctor', 'Office', 'Home'];

  public setAppsCatalog(apps: string[]) {
    this.knownApps = apps;
  }

  public setContactsCatalog(contacts: string[]) {
    this.knownContacts = contacts;
  }

  /**
   * Deterministically parses speech utterance into an OraIntent in sub-15ms.
   */
  public parse(transcript: string): IntentResolution {
    const startTime = performance.now();
    const latency = () => Math.round(performance.now() - startTime);
    const rawClean = transcript.trim().toLowerCase().replace(/[.,!?;:]/g, '');

    // A. Check if user ONLY spoke the wake word ("Hey Ora", "Ora", "Ok Ora", "Hello Ora", etc.)
    if (/^(?:hey|ok|okay|hi|hello)?\s*ora$/i.test(rawClean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'conversational', kind: 'wake_prompt' },
        confidence: 1.0,
        latencyMs: latency(),
        matchedTrigger: 'wake_word',
      };
    }

    let clean = rawClean;
    // Strip wake-word prefixes if user speaks "Hey Ora, ..."
    clean = clean.replace(/^(hey|ok|okay|hi|hello)?\s*ora\s*[,:]?\s*/i, '').trim() || clean;

    if (!clean) {
      return {
        rawTranscript: transcript,
        intent: null,
        confidence: 0,
        latencyMs: latency(),
        error: 'Empty transcript received',
      };
    }

    // B. Check if there is an active pending disambiguation choice
    const pendingDisambiguation = contactsService.getPendingDisambiguation();
    if (pendingDisambiguation && pendingDisambiguation.candidates.length > 0) {
      const candidates = pendingDisambiguation.candidates;
      let selectedIdx = -1;

      if (/\b(1|first|one|option 1|number 1|first one)\b/i.test(clean)) selectedIdx = 0;
      else if (/\b(2|second|two|option 2|number 2|second one)\b/i.test(clean) && candidates.length > 1) selectedIdx = 1;
      else if (/\b(3|third|three|option 3|number 3|third one)\b/i.test(clean) && candidates.length > 2) selectedIdx = 2;
      else if (/\b(4|fourth|four|option 4|number 4|fourth one)\b/i.test(clean) && candidates.length > 3) selectedIdx = 3;

      if (selectedIdx === -1) {
        for (let i = 0; i < candidates.length; i++) {
          if (clean.includes(candidates[i].name.toLowerCase())) {
            selectedIdx = i;
            break;
          }
        }
      }

      if (selectedIdx !== -1) {
        return {
          rawTranscript: transcript,
          intent: {
            action: 'disambiguate_choice',
            index: selectedIdx,
            name: candidates[selectedIdx].name,
          },
          confidence: 0.99,
          latencyMs: latency(),
          matchedTrigger: 'disambiguation_selection',
        };
      }
    }

    // 1. Lock Phone / Screen
    if (/\b(lock|lock phone|lock screen|turn off screen|lock device|screen lock)\b/.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'lock_device' },
        confidence: 0.98,
        latencyMs: latency(),
        matchedTrigger: 'lock_device',
      };
    }

    // 2. Flashlight / Torch
    if (/\b(torch|flashlight|light)\b/.test(clean)) {
      const turnOff = /\b(off|kill|disable|stop)\b/.test(clean);
      const turnOn = /\b(on|enable|start|turn on)\b/.test(clean) || !turnOff;
      return {
        rawTranscript: transcript,
        intent: { action: 'toggle_flashlight', state: turnOn },
        confidence: 0.99,
        latencyMs: latency(),
        matchedTrigger: 'toggle_flashlight',
      };
    }

    // 3. Volume & Sound Controls
    if (/\b(volume up|increase volume|louder|turn up volume|raise volume)\b/.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'volume_control', direction: 'up' },
        confidence: 0.96,
        latencyMs: latency(),
        matchedTrigger: 'volume_control',
      };
    }
    if (/\b(volume down|decrease volume|lower volume|quieter|turn down volume)\b/.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'volume_control', direction: 'down' },
        confidence: 0.96,
        latencyMs: latency(),
        matchedTrigger: 'volume_control',
      };
    }
    if (/\b(max volume|maximum volume|full volume|loudest)\b/.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'volume_control', direction: 'max' },
        confidence: 0.96,
        latencyMs: latency(),
        matchedTrigger: 'volume_control',
      };
    }
    const volPercentMatch = clean.match(/\bvolume\s+(?:to\s+)?(\d{1,3})(?:\s*%)?\b/);
    if (volPercentMatch && volPercentMatch[1]) {
      const val = Math.min(100, Math.max(0, parseInt(volPercentMatch[1], 10)));
      return {
        rawTranscript: transcript,
        intent: { action: 'volume_control', direction: 'percent', value: val },
        confidence: 0.95,
        latencyMs: latency(),
        matchedTrigger: 'volume_control',
      };
    }

    // 4. Audio Ringer Mode (Mute / Silent / Vibrate)
    if (/\b(mute|silent|vibrate|unmute|sound on|normal sound|ringer)\b/.test(clean)) {
      let mode: 'silent' | 'vibrate' | 'normal' = 'normal';
      if (/\b(silent|mute)\b/.test(clean)) {
        mode = 'silent';
      } else if (/\b(vibrate)\b/.test(clean)) {
        mode = 'vibrate';
      } else {
        mode = 'normal';
      }
      return {
        rawTranscript: transcript,
        intent: { action: 'set_ringer_mode', mode },
        confidence: 0.97,
        latencyMs: latency(),
        matchedTrigger: 'set_ringer_mode',
      };
    }

    // 5. Settings Sections (Wi-Fi, Bluetooth, Display, Battery, Sound)
    if (/\b(wi-?fi|wifi)\s*(?:settings)?\b/.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'open_settings_section', section: 'wifi' },
        confidence: 0.97,
        latencyMs: latency(),
        matchedTrigger: 'open_settings_section',
      };
    }
    if (/\b(bluetooth)\s*(?:settings)?\b/.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'open_settings_section', section: 'bluetooth' },
        confidence: 0.97,
        latencyMs: latency(),
        matchedTrigger: 'open_settings_section',
      };
    }
    if (/\b(display|brightness)\s*(?:settings)?\b/.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'open_settings_section', section: 'display' },
        confidence: 0.96,
        latencyMs: latency(),
        matchedTrigger: 'open_settings_section',
      };
    }

    // 6. Battery Status
    if (/\b(battery|power level|battery level|battery percentage)\b/.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'get_battery_status' },
        confidence: 0.98,
        latencyMs: latency(),
        matchedTrigger: 'get_battery_status',
      };
    }

    // 7. Real Time & Date Queries
    if (/\b(what time is it|what is the time|current time|tell me the time|time now|what time)\b/.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'get_time_date', query: 'time' },
        confidence: 0.99,
        latencyMs: latency(),
        matchedTrigger: 'get_time_date',
      };
    }
    if (/\b(what day is it|what day is today|what is today|what day)\b/.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'get_time_date', query: 'day' },
        confidence: 0.98,
        latencyMs: latency(),
        matchedTrigger: 'get_time_date',
      };
    }
    if (/\b(what is today's date|what date is it|what's the date|current date|today's date|what date)\b/.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'get_time_date', query: 'date' },
        confidence: 0.98,
        latencyMs: latency(),
        matchedTrigger: 'get_time_date',
      };
    }

    // 8. Math & Calculations (e.g. "what is 25 times 14", "calculate 50 plus 20", "15 percent of 80")
    const mathMatch = clean.match(
      /(?:what is|calculate|solve|whats)?\s*(\d+(?:\.\d+)?\s*(?:\+|\-|\*|\/|x|times|multiplied by|plus|minus|divided by|over|percent of|%)\s*\d+(?:\.\d+)?(?:\s*(?:\+|\-|\*|\/|x|times|multiplied by|plus|minus|divided by|over)\s*\d+(?:\.\d+)?)*)/i
    );
    if (mathMatch && mathMatch[1] && /\d/.test(mathMatch[1]) && /(?:\+|\-|\*|\/|x|times|plus|minus|divided|percent|%)/i.test(mathMatch[1])) {
      return {
        rawTranscript: transcript,
        intent: { action: 'calculate_math', expression: mathMatch[1].trim() },
        confidence: 0.95,
        latencyMs: latency(),
        matchedTrigger: 'calculate_math',
      };
    }

    // 9. Notes & Memos (e.g. "take a note: buy milk", "note to self call Emmanuel")
    const noteMatch = clean.match(/^(?:take\s+(?:a\s+)?note|note\s+to\s+self|create\s+(?:a\s+)?note|new\s+note|write\s+down)\s*(?:that|saying|:)?\s*(.+)$/i);
    if (noteMatch && noteMatch[1]) {
      return {
        rawTranscript: transcript,
        intent: { action: 'take_note', text: noteMatch[1].trim() },
        confidence: 0.94,
        latencyMs: latency(),
        matchedTrigger: 'take_note',
      };
    }

    // 10. Web & YouTube Searches
    const ytMatch = clean.match(/^(?:search\s+youtube\s+for|find\s+on\s+youtube|youtube\s+search(?:\s+for)?|play\s+on\s+youtube)\s+(.+)$/i);
    if (ytMatch && ytMatch[1]) {
      return {
        rawTranscript: transcript,
        intent: { action: 'web_search', query: ytMatch[1].trim(), engine: 'youtube' },
        confidence: 0.95,
        latencyMs: latency(),
        matchedTrigger: 'web_search',
      };
    }
    const webMatch = clean.match(/^(?:search\s+google\s+for|google\s+search(?:\s+for)?|search\s+(?:the\s+)?web\s+for|search\s+for|look\s+up)\s+(.+)$/i);
    if (webMatch && webMatch[1]) {
      return {
        rawTranscript: transcript,
        intent: { action: 'web_search', query: webMatch[1].trim(), engine: 'google' },
        confidence: 0.93,
        latencyMs: latency(),
        matchedTrigger: 'web_search',
      };
    }

    // 11. Conversational & Identity
    if (/\b(who are you|what is your name|who made you|what are you)\b/.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'conversational', kind: 'identity' },
        confidence: 0.98,
        latencyMs: latency(),
        matchedTrigger: 'conversational',
      };
    }
    if (/\b(tell me a joke|say something funny|make me laugh|joke)\b/.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'conversational', kind: 'joke' },
        confidence: 0.98,
        latencyMs: latency(),
        matchedTrigger: 'conversational',
      };
    }
    if (/\b(what can you do|help me|features|commands|capabilities|what do you do)\b/.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'conversational', kind: 'capabilities' },
        confidence: 0.98,
        latencyMs: latency(),
        matchedTrigger: 'conversational',
      };
    }
    if (/^(hello|hi|good morning|good afternoon|good evening|hey)$/.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'conversational', kind: 'greeting' },
        confidence: 0.95,
        latencyMs: latency(),
        matchedTrigger: 'conversational',
      };
    }

    // 12. Make Call (e.g. "call Emmanuel", "dial Mom", "call Adwoa on SIM 2", "call 0244123456")
    const callMatch = clean.match(/^(?:please\s+)?(?:call|dial|phone|ring)\s+(?:to\s+)?(.+)$/i);
    if (callMatch && callMatch[1]) {
      let rawTarget = callMatch[1].trim();

      // Dual-SIM detection: "on SIM 2", "using SIM 1", "with SIM 2", "SIM 1", "SIM two"
      let simSlot: number | undefined;
      const simPattern = /\b(?:on|using|with|via)?\s*sim\s*(1|2|one|two)\b/i;
      const simMatch = rawTarget.match(simPattern);
      if (simMatch) {
        const slotVal = simMatch[1].toLowerCase();
        simSlot = (slotVal === '2' || slotVal === 'two') ? 2 : 1;
        rawTarget = rawTarget.replace(simPattern, '').trim();
      }

      // If user specified direct phone numbers (e.g. "call 0244123456", "dial +18005550199")
      if (/^[\d+()\-\s]{3,}$/.test(rawTarget)) {
        return {
          rawTranscript: transcript,
          intent: { action: 'make_call', contact: rawTarget, sim_slot: simSlot },
          confidence: 0.98,
          latencyMs: latency(),
          matchedTrigger: 'make_call',
        };
      }

      const deviceContacts = contactsService.getContactNames();
      const candidateList = deviceContacts.length > 0 ? deviceContacts : this.knownContacts;
      const fuzzyTarget = fuzzyMatch(rawTarget, candidateList, 2);
      const finalContact = fuzzyTarget ? fuzzyTarget.match : rawTarget;
      return {
        rawTranscript: transcript,
        intent: { action: 'make_call', contact: finalContact, sim_slot: simSlot },
        confidence: fuzzyTarget ? 0.96 : 0.88,
        latencyMs: latency(),
        matchedTrigger: 'make_call',
      };
    }

    // 13. Send SMS (e.g. "text Emmanuel I'm outside", "send message to Adwoa: call me")
    const smsMatch = clean.match(
      /^(?:send\s+(?:an?\s+)?(?:sms|text|message)|text|sms|message)\s+(?:to\s+)?([a-z0-9\s]+?)\s+(?:that|saying|with|:)?\s*(.+)$/i
    );
    if (smsMatch && smsMatch[1] && smsMatch[2]) {
      const rawContact = smsMatch[1].trim();
      const messageBody = smsMatch[2].trim();
      const deviceContacts = contactsService.getContactNames();
      const candidateList = deviceContacts.length > 0 ? deviceContacts : this.knownContacts;
      const fuzzyTarget = fuzzyMatch(rawContact, candidateList, 2);
      const finalContact = fuzzyTarget ? fuzzyTarget.match : rawContact;
      return {
        rawTranscript: transcript,
        intent: { action: 'send_sms', contact: finalContact, message: messageBody },
        confidence: 0.94,
        latencyMs: latency(),
        matchedTrigger: 'send_sms',
      };
    }

    // 14. Notification Reply
    const replyMatch = clean.match(
      /^(?:reply(?:\s+to)?|answer|respond(?:\s+to)?)\s+(?:on\s+)?(whatsapp|telegram|sms|messages)?\s*(?:with|saying|that)?\s*(.+)$/i
    );
    if (replyMatch && replyMatch[2]) {
      const app = (replyMatch[1] || 'whatsapp').toLowerCase();
      const replyText = replyMatch[2].trim();
      return {
        rawTranscript: transcript,
        intent: { action: 'reply_notification', app, text: replyText },
        confidence: 0.91,
        latencyMs: latency(),
        matchedTrigger: 'reply_notification',
      };
    }

    // 15. Alarms & Timers
    if (/\b(alarm|wake me up|timer)\b/.test(clean)) {
      const isTimer = /\b(timer)\b/.test(clean);
      const timeMatch = clean.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d+\s*(?:minutes?|mins?|seconds?|hours?))/i);
      const resolvedTime = timeMatch ? timeMatch[1] : '07:00 AM';
      return {
        rawTranscript: transcript,
        intent: {
          action: 'set_clock_alert',
          time: resolvedTime,
          type: isTimer ? 'timer' : 'alarm',
          label: 'Ora Voice Alert',
        },
        confidence: 0.93,
        latencyMs: latency(),
        matchedTrigger: 'set_clock_alert',
      };
    }

    // 16. Launch App (e.g. "open WhatsApp Business", "launch Snapchat", "open camera")
    const launchMatch = clean.match(/^(?:open|launch|start|run|play)\s+(?:app\s+)?(.+)$/i);
    if (launchMatch && launchMatch[1]) {
      const rawApp = launchMatch[1].trim();
      const fuzzyApp = fuzzyMatch(rawApp, this.knownApps, 2);
      const finalApp = fuzzyApp ? fuzzyApp.match : rawApp;
      return {
        rawTranscript: transcript,
        intent: { action: 'launch_app', app: finalApp },
        confidence: fuzzyApp ? 0.96 : 0.88,
        latencyMs: latency(),
        matchedTrigger: 'launch_app',
      };
    }

    // Also support direct app name utterances (e.g. user just says "WhatsApp Business", "Snapchat", "TikTok", "Calculator")
    const directAppFuzzy = fuzzyMatch(clean, this.knownApps, 1);
    if (directAppFuzzy) {
      return {
        rawTranscript: transcript,
        intent: { action: 'launch_app', app: directAppFuzzy.match },
        confidence: 0.92,
        latencyMs: latency(),
        matchedTrigger: 'launch_app',
      };
    }

    // Unmatched / Grammar Rejection
    return {
      rawTranscript: transcript,
      intent: null,
      confidence: 0,
      latencyMs: latency(),
      error: `No deterministic action matched: "${transcript}"`,
    };
  }
}

export const needle = new NeedleEngine();
