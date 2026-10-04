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

      // 0. Cancellation check
      if (/^(?:cancel|never\s*mind|stop|forget\s*it|no|exit|close)$/i.test(clean)) {
        return {
          rawTranscript: transcript,
          intent: {
            action: 'disambiguate_choice',
            index: -1,
          },
          confidence: 0.99,
          latencyMs: latency(),
          matchedTrigger: 'disambiguation_cancellation',
        };
      }

      let selectedIdx = -1;

      // 1. Ordinals & Strict Number Choices (e.g. "first one", "the second", "option 3", "number 2", "1", "2")
      // MUST NOT loosely match the word "one" in arbitrary sentences!
      if (/^(?:1|one|first|the\s+first|first\s+one|option\s+1|number\s+1|choice\s+1)$/i.test(clean) ||
          /\b(?:first\s+one|the\s+first\s+one|the\s+first|option\s+1|number\s+1|choice\s+1)\b/i.test(clean)) {
        selectedIdx = 0;
      } else if (/^(?:2|two|second|the\s+second|second\s+one|option\s+2|number\s+2|choice\s+2)$/i.test(clean) ||
                 /\b(?:second\s+one|the\s+second\s+one|the\s+second|option\s+2|number\s+2|choice\s+2)\b/i.test(clean)) {
        if (candidates.length > 1) selectedIdx = 1;
      } else if (/^(?:3|three|third|the\s+third|third\s+one|option\s+3|number\s+3|choice\s+3)$/i.test(clean) ||
                 /\b(?:third\s+one|the\s+third\s+one|the\s+third|option\s+3|number\s+3|choice\s+3)\b/i.test(clean)) {
        if (candidates.length > 2) selectedIdx = 2;
      } else if (/^(?:4|four|fourth|the\s+fourth|fourth\s+one|option\s+4|number\s+4|choice\s+4)$/i.test(clean) ||
                 /\b(?:fourth\s+one|the\s+fourth\s+one|the\s+fourth|option\s+4|number\s+4|choice\s+4)\b/i.test(clean)) {
        if (candidates.length > 3) selectedIdx = 3;
      }

      // 2. Ending phone digits match (e.g. user says "the one ending in 1234" or "1234")
      if (selectedIdx === -1) {
        const digitsMatch = clean.match(/\b(\d{3,6})\b/);
        if (digitsMatch) {
          const digits = digitsMatch[1];
          const matchedByDigits = candidates.findIndex((c) => c.cleanPhone.endsWith(digits));
          if (matchedByDigits !== -1) {
            selectedIdx = matchedByDigits;
          }
        }
      }

      // 3. Distinctive candidate name token matching
      if (selectedIdx === -1) {
        const origQuery = (pendingDisambiguation.query || '').toLowerCase().trim();
        const strippedClean = clean.replace(/^(?:call|text|message|dial|the|select|choose)\s+/i, '').trim();

        // Only attempt name matching if user didn't just repeat the ambiguous search query
        if (strippedClean && strippedClean !== origQuery) {
          const matchingCandidates: number[] = [];
          for (let i = 0; i < candidates.length; i++) {
            const candLower = candidates[i].name.toLowerCase();
            // Candidate must contain the specific distinguishing token
            if (candLower.includes(strippedClean) || strippedClean.includes(candLower)) {
              matchingCandidates.push(i);
            } else {
              // Check individual distinctive tokens (e.g. "Work", "Mobile", "Smith")
              const tokens = candLower.split(/[\s,().-]+/).filter((t) => t.length > 2 && t !== origQuery);
              if (tokens.some((t) => strippedClean.includes(t))) {
                matchingCandidates.push(i);
              }
            }
          }
          // Only select if UNAMBIGUOUS (exactly 1 candidate matched)
          if (matchingCandidates.length === 1) {
            selectedIdx = matchingCandidates[0];
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

    // 1.1 Global Accessibility Actions (Screenshot, Home, Recents, Notifications, Quick Settings, Power Menu)
    if (/^(?:take\s+(?:a\s+)?screenshot|capture\s+(?:the\s+)?screen|screenshot(?:\s+this|\s+now)?|screen\s+capture)$/i.test(clean) || /\b(take\s+(?:a\s+)?screenshot|capture\s+(?:the\s+)?screen)\b/i.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'system_action', command: 'screenshot' },
        confidence: 0.98,
        latencyMs: latency(),
        matchedTrigger: 'system_action',
      };
    }

    if (/^(?:go\s+home|go\s+to\s+home\s*screen|home\s*screen|take\s+me\s+home|minimize(?:\s+all)?|exit\s+to\s+home)$/i.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'system_action', command: 'home' },
        confidence: 0.98,
        latencyMs: latency(),
        matchedTrigger: 'system_action',
      };
    }

    if (/^(?:recent\s+apps|show\s+recents|open\s+recents|app\s+switcher|switch\s+apps|show\s+open\s+apps|multitask(?:ing)?)$/i.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'system_action', command: 'recents' },
        confidence: 0.98,
        latencyMs: latency(),
        matchedTrigger: 'system_action',
      };
    }

    if (/^(?:open\s+notifications|show\s+notifications|pull\s+down\s+notifications|notification\s+shade|view\s+notifications)$/i.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'system_action', command: 'notifications' },
        confidence: 0.98,
        latencyMs: latency(),
        matchedTrigger: 'system_action',
      };
    }

    if (/^(?:open\s+quick\s+settings|quick\s+settings|show\s+quick\s+settings|control\s+center)$/i.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'system_action', command: 'quick_settings' },
        confidence: 0.98,
        latencyMs: latency(),
        matchedTrigger: 'system_action',
      };
    }

    if (/^(?:power\s+menu|power\s+dialog|power\s+options|show\s+power\s+menu|restart\s+menu)$/i.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'system_action', command: 'power_dialog' },
        confidence: 0.98,
        latencyMs: latency(),
        matchedTrigger: 'system_action',
      };
    }

    // 2. Flashlight / Torch
    if (/\b(torch|flashlight|flash\s*light|flash|light)\b/i.test(clean) && !/\b(flight|lightweight|daylight|highlight)\b/i.test(clean)) {
      const turnOff = /\b(off|kill|disable|stop|turn\s+off|shut\s+off)\b/i.test(clean);
      const turnOn = /\b(on|enable|start|turn\s+on)\b/i.test(clean) || !turnOff;
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

    // 3.5 Media Playback & Music Controls
    // App-specific music playback e.g. "play Burna Boy on Spotify", "play Asake on YouTube"
    const mediaAppMatch = clean.match(/^(?:play|listen\s+to|put\s+on)\s+(.+?)\s+on\s+(spotify|youtube(?:\s+music)?)$/i);
    if (mediaAppMatch && mediaAppMatch[1] && mediaAppMatch[2]) {
      const targetApp = mediaAppMatch[2].toLowerCase().includes('spotify') ? 'spotify' : 'youtube';
      return {
        rawTranscript: transcript,
        intent: { action: 'media_control', command: 'play', query: mediaAppMatch[1].trim(), app: targetApp },
        confidence: 0.98,
        latencyMs: latency(),
        matchedTrigger: 'media_control',
      };
    }

    // Media transport keys (play, pause, next, previous, stop)
    if (/^(?:pause|pause\s+(?:the\s+)?(?:music|song|playback|track)|stop\s+(?:music|playback))$/i.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'media_control', command: 'pause' },
        confidence: 0.98,
        latencyMs: latency(),
        matchedTrigger: 'media_control',
      };
    }

    if (/^(?:play\s+(?:the\s+)?(?:music|song)|resume\s+(?:the\s+)?(?:music|song|playback)|unpause|resume|^play$)$/i.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'media_control', command: 'play' },
        confidence: 0.97,
        latencyMs: latency(),
        matchedTrigger: 'media_control',
      };
    }

    if (/^(?:next\s+(?:song|track)|skip\s+(?:this\s+)?(?:song|track)|skip|^next$)$/i.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'media_control', command: 'next' },
        confidence: 0.98,
        latencyMs: latency(),
        matchedTrigger: 'media_control',
      };
    }

    if (/^(?:previous\s+(?:song|track)|prev\s+(?:song|track)|last\s+song|go\s+back\s+(?:a\s+)?song|^previous$|^prev$)$/i.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'media_control', command: 'previous' },
        confidence: 0.97,
        latencyMs: latency(),
        matchedTrigger: 'media_control',
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

    // 5. Settings Sections (Wi-Fi, Bluetooth, Display, Sound, Battery, Apps, Accessibility, General)
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
    if (/\b(sound|volume)\s+settings\b/.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'open_settings_section', section: 'sound' },
        confidence: 0.96,
        latencyMs: latency(),
        matchedTrigger: 'open_settings_section',
      };
    }
    if (/\b(app|apps|application|applications)\s+settings\b/.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'open_settings_section', section: 'apps' },
        confidence: 0.96,
        latencyMs: latency(),
        matchedTrigger: 'open_settings_section',
      };
    }
    if (/\b(accessibility)\s*(?:settings)?\b/.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'open_settings_section', section: 'accessibility' },
        confidence: 0.97,
        latencyMs: latency(),
        matchedTrigger: 'open_settings_section',
      };
    }
    if (/^(?:open\s+)?settings$/i.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'open_settings_section', section: 'general' },
        confidence: 0.98,
        latencyMs: latency(),
        matchedTrigger: 'open_settings_section',
      };
    }

    // 5.5 Navigation & Turn-by-Turn Directions
    const navMatch = clean.match(/^(?:navigate(?:\s+to)?|directions(?:\s+to)?|take\s+me\s+to|drive\s+to|route\s+to|how\s+do\s+i\s+get\s+to)\s+(.+)$/i);
    if (navMatch && navMatch[1]) {
      return {
        rawTranscript: transcript,
        intent: { action: 'navigate_to', destination: navMatch[1].trim() },
        confidence: 0.96,
        latencyMs: latency(),
        matchedTrigger: 'navigate_to',
      };
    }

    // 5.6 Email Drafting
    const emailMatch = clean.match(/^(?:send|draft|write|compose)\s+(?:an?\s+)?email\s+(?:to\s+)?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|[a-z0-9\s]+?)(?:\s+(?:about|subject|saying|with|body)\s+(.+))?$/i);
    if (emailMatch && emailMatch[1]) {
      const recipient = emailMatch[1].trim();
      const body = emailMatch[2]?.trim();
      return {
        rawTranscript: transcript,
        intent: { action: 'draft_email', recipient, body },
        confidence: 0.94,
        latencyMs: latency(),
        matchedTrigger: 'draft_email',
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
    if (/\b(i love you|love you|do you love me)\b/.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'conversational', kind: 'affection' },
        confidence: 0.98,
        latencyMs: latency(),
        matchedTrigger: 'conversational',
      };
    }
    if (/\b(thank you|thanks|thanks a lot|thank you so much)\b/.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'conversational', kind: 'gratitude' },
        confidence: 0.98,
        latencyMs: latency(),
        matchedTrigger: 'conversational',
      };
    }
    if (/\b(how are you|how are you doing|how's it going|how are things)\b/.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'conversational', kind: 'status' },
        confidence: 0.98,
        latencyMs: latency(),
        matchedTrigger: 'conversational',
      };
    }
    if (/\b(who are you|what is your name|who made you)\b/.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'conversational', kind: 'identity' },
        confidence: 0.98,
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

      return {
        rawTranscript: transcript,
        intent: { action: 'make_call', contact: rawTarget, sim_slot: simSlot },
        confidence: 0.95,
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
      return {
        rawTranscript: transcript,
        intent: { action: 'send_sms', contact: rawContact, message: messageBody },
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

    // 15. Dismiss & Show Alarms
    if (/^(?:dismiss|stop|turn\s+off|cancel|silence)\s+(?:the\s+)?(?:alarm|timer)$/i.test(clean) || /^(?:dismiss|silence)\s+alarm$/i.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'dismiss_alarm' },
        confidence: 0.98,
        latencyMs: latency(),
        matchedTrigger: 'dismiss_alarm',
      };
    }

    if (/^(?:show|open|view|list|check)\s+(?:all\s+)?(?:my\s+)?alarms$/i.test(clean) || /^(?:my\s+alarms)$/i.test(clean)) {
      return {
        rawTranscript: transcript,
        intent: { action: 'show_alarms' },
        confidence: 0.98,
        latencyMs: latency(),
        matchedTrigger: 'show_alarms',
      };
    }

    // 15.5 Alarms & Timers (Silent Background Clock API)
    if (/\b(alarm|wake me up|timer|countdown)\b/.test(clean)) {
      const isTimer = /\b(timer|countdown|in\s+\d+\s*(?:minutes?|seconds?|hours?))\b/.test(clean);
      const timeMatch = clean.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d+\s*(?:minutes?|mins?|seconds?|secs?|hours?|hrs?))/i);
      const resolvedTime = timeMatch ? timeMatch[1] : (isTimer ? '5 minutes' : '07:00 AM');
      return {
        rawTranscript: transcript,
        intent: {
          action: 'set_clock_alert',
          time: resolvedTime,
          type: isTimer ? 'timer' : 'alarm',
          label: 'Ora Voice Alert',
        },
        confidence: 0.94,
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
