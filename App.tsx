import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Platform,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
  PermissionsAndroid,
  StatusBar,
  AppState,
} from 'react-native';
import * as Linking from 'expo-linking';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeOut,
  FadeInUp,
  FadeOutDown,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { OraOrb } from './src/components/OraOrb';
import { OrbMode } from './src/types/intent';
import { needle } from './src/engine/needle';
import { oraActions } from './src/actions/oraActions';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { contactsService, DisambiguationContext } from './src/services/contactsService';
import { foregroundVoiceManager } from './src/services/foregroundService';
import { speechEngine, parseSpeechError } from './src/services/speechEngine';
import { requireNativeModule } from 'expo-modules-core';

let OraHardware: any = null;
try {
  OraHardware = requireNativeModule('OraHardware');
} catch (e) {}

interface QuickPromptChip {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  command: string;
}

const QUICK_PROMPTS: QuickPromptChip[] = [
  { id: 'torch', label: 'Flashlight', icon: 'flashlight-outline', command: 'turn on flashlight' },
  { id: 'call', label: 'Call Mom', icon: 'call-outline', command: 'call mom' },
  { id: 'alarm', label: 'Set Alarm 7 AM', icon: 'alarm-outline', command: 'set alarm for 7:00 AM' },
  { id: 'timer', label: '5m Timer', icon: 'timer-outline', command: 'timer for 5 minutes' },
  { id: 'calc', label: '25 × 14', icon: 'calculator-outline', command: 'calculate 25 times 14' },
  { id: 'battery', label: 'Battery Level', icon: 'battery-charging-outline', command: 'battery level' },
  { id: 'whatsapp', label: 'Open WhatsApp', icon: 'chatbubbles-outline', command: 'open whatsapp' },
];

interface CapabilityCategory {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
  examples: { phrase: string; detail: string }[];
}

const CAPABILITY_GUIDE: CapabilityCategory[] = [
  {
    id: 'calls_sms',
    name: 'Direct Calling & Messaging',
    icon: 'call-outline',
    description: 'Bypasses dialer; dials contacts or raw digits directly',
    examples: [
      { phrase: 'Call Emmanuel', detail: 'Address book contact lookup' },
      { phrase: 'Call Mummy', detail: 'Family alias (Mom, Mum, Mama)' },
      { phrase: 'Call 0244123456', detail: 'Direct numerical dialing' },
      { phrase: "Text Emmanuel I'm on my way", detail: 'Zero-touch SMS dispatch' },
    ],
  },
  {
    id: 'apps',
    name: 'Universal App Launcher',
    icon: 'apps-outline',
    description: 'Launches any installed app via Android PackageManager',
    examples: [
      { phrase: 'Open WhatsApp Business', detail: 'com.whatsapp.w4b package' },
      { phrase: 'Open Snapchat', detail: 'com.snapchat.android package' },
      { phrase: 'Open Camera', detail: 'Hardware camera interface' },
      { phrase: 'Open Wi-Fi settings', detail: 'System connectivity panel' },
    ],
  },
  {
    id: 'clock_hardware',
    name: 'Alarms & Hardware Control',
    icon: 'alarm-outline',
    description: 'Native system clock intents & physical toggles',
    examples: [
      { phrase: 'Set alarm for 7:00 AM', detail: 'Native clock alarm intent' },
      { phrase: 'Timer for 5 minutes', detail: 'Countdown timer dispatch' },
      { phrase: 'Turn on flashlight', detail: 'Physical LED torch trigger' },
      { phrase: 'Lock phone', detail: 'Offline screen lock service' },
    ],
  },
  {
    id: 'system_navigation',
    name: 'OS & Accessibility Actions',
    icon: 'phone-portrait-outline',
    description: 'Zero-touch navigation, screenshots & system control',
    examples: [
      { phrase: 'Take a screenshot', detail: 'Native screen capture' },
      { phrase: 'Go to home screen', detail: 'Global home navigation' },
      { phrase: 'Recent apps', detail: 'App switcher multitasker' },
      { phrase: 'Open notifications', detail: 'System notification shade' },
      { phrase: 'Quick settings', detail: 'Control center quick toggles' },
    ],
  },
  {
    id: 'productivity',
    name: 'Productivity & Edge Calculations',
    icon: 'calculator-outline',
    description: 'Sub-15ms deterministic offline computation',
    examples: [
      { phrase: 'Calculate 25 times 14', detail: 'Edge arithmetic engine' },
      { phrase: 'What time is it?', detail: 'Real-time spoken clock' },
      { phrase: 'Battery level', detail: 'System power status readout' },
      { phrase: 'Volume up', detail: 'Audio gain step control' },
      { phrase: 'Take a note: Meeting at 3', detail: 'Offline audit memo store' },
    ],
  },
];

export default function App() {
  const [orbMode, setOrbMode] = useState<OrbMode>('idle');
  const [transcript, setTranscript] = useState<string>('');
  const [actionPill, setActionPill] = useState<string | null>(null);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [isTextInputOpen, setIsTextInputOpen] = useState<boolean>(false);
  const [typedInput, setTypedInput] = useState<string>('');
  const [isHandsFree, setIsHandsFree] = useState<boolean>(true);
  const [contactsCount, setContactsCount] = useState<number>(contactsService.getContactCount());
  const [disambiguation, setDisambiguation] = useState<DisambiguationContext | null>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const pillTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handsFreeRestartRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManualListeningRef = useRef<boolean>(false);
  const manualListeningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestTranscriptRef = useRef<string>('');
  const silenceDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failoverCountRef = useRef<number>(0);

  // Sync real-time contacts count and dialogue disambiguation context from cache
  useEffect(() => {
    const unsubCount = contactsService.addChangeListener((count) => {
      setContactsCount(count);
    });
    const unsubDisambiguation = contactsService.addDisambiguationListener((ctx) => {
      setDisambiguation(ctx);
    });
    return () => {
      unsubCount();
      unsubDisambiguation();
    };
  }, []);

  // Check and process any pending voice command from Power Button assistant session
  const checkPendingVoiceCommand = () => {
    if (Platform.OS === 'android' && OraHardware?.getPendingVoiceCommand) {
      try {
        const pendingCmd = OraHardware.getPendingVoiceCommand();
        if (pendingCmd && typeof pendingCmd === 'string' && pendingCmd.trim()) {
          processUtterance(pendingCmd.trim());
        }
      } catch (e) {}
    }
  };

  // Deep Link & Power Button Assistant session receiver
  useEffect(() => {
    checkPendingVoiceCommand();

    const handleDeepLink = (event: { url: string }) => {
      try {
        const parsed = Linking.parse(event.url);
        const cmd = (parsed.queryParams?.text || parsed.queryParams?.ora_command) as string;
        if (cmd && cmd.trim()) {
          processUtterance(cmd.trim());
        }
      } catch (e) {}
    };

    const linkSub = Linking.addEventListener('url', handleDeepLink);
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkPendingVoiceCommand();
        contactsService.loadContacts().catch(() => {});
      } else {
        if (handsFreeRestartRef.current) {
          clearTimeout(handsFreeRestartRef.current);
          handsFreeRestartRef.current = null;
        }
        if (isManualListeningRef.current) {
          isManualListeningRef.current = false;
          setOrbMode('idle');
        }
        speechEngine.abort();
      }
    });

    return () => {
      linkSub.remove();
      appStateSub.remove();
    };
  }, []);

  // Request core native permissions sequentially on mount so OS dialogs display cleanly
  useEffect(() => {
    const initAppPermissions = async () => {
      try {
        if (Platform.OS === 'android') {
          // 1. Audio permission via Expo Speech Recognition (ensures native dialog shows)
          try {
            await ExpoSpeechRecognitionModule.requestPermissionsAsync();
          } catch (_) {}

          // 2. Request core Android runtime permissions sequentially
          const perms: any[] = [
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
            PermissionsAndroid.PERMISSIONS.CALL_PHONE,
            PermissionsAndroid.PERMISSIONS.SEND_SMS,
          ];
          if (Platform.Version >= 33) {
            perms.push('android.permission.POST_NOTIFICATIONS' as any);
          }
          await PermissionsAndroid.requestMultiple(perms);
        }
        await contactsService.loadContacts();
      } catch (err) {
        console.warn('[App] Startup permission error:', err);
        contactsService.loadContacts().catch(() => {});
      }
    };

    initAppPermissions();
  }, []);

  // ACOUSTIC ECHO SUPPRESSION:
  // When Ora speaks via TTS, immediately stop speech recognition so Ora never hears its own voice.
  // When TTS finishes, wait for trailing speaker echo to dissipate, then resume hands-free listening.
  useEffect(() => {
    const unsubscribe = oraActions.addSpeechListener((speaking) => {
      if (speaking) {
        try {
          ExpoSpeechRecognitionModule.stop();
        } catch (e) {}
      } else {
        const pending = contactsService.getPendingDisambiguation();
        if (pending && pending.candidates.length > 0) {
          // Immediately activate microphone for user's disambiguation choice
          setOrbMode('listening');
          isManualListeningRef.current = true;
          setTranscript('');
          latestTranscriptRef.current = '';
          if (manualListeningTimerRef.current) clearTimeout(manualListeningTimerRef.current);
          manualListeningTimerRef.current = setTimeout(() => {
            if (isManualListeningRef.current) {
              isManualListeningRef.current = false;
              contactsService.clearPendingDisambiguation();
              setOrbMode('idle');
            }
          }, 10000);

          if (handsFreeRestartRef.current) clearTimeout(handsFreeRestartRef.current);
          handsFreeRestartRef.current = setTimeout(() => {
            startListeningSession(false);
          }, 250);
          return;
        }

        if (isHandsFree && orbMode === 'idle') {
          scheduleHandsFreeRestart(500);
        }
      }
    });
    return () => unsubscribe();
  }, [isHandsFree, orbMode]);

  const showActionPill = (text: string) => {
    if (pillTimeoutRef.current) clearTimeout(pillTimeoutRef.current);
    setActionPill(text);
    pillTimeoutRef.current = setTimeout(() => {
      setActionPill(null);
    }, 2200);
  };

  /**
   * Helper to start in-app speech recognition via the Offline Speech Engine Orchestrator
   */
  const startListeningSession = async (continuous: boolean = false, packageOverride?: string) => {
    try {
      // Don't start speech recognition if native VoiceInteractionSession is actively holding the mic
      if (Platform.OS === 'android' && OraHardware?.isVoiceSessionActive && OraHardware.isVoiceSessionActive()) {
        console.log('[Speech] VoiceInteractionSession is active — skipping app recognition');
        return;
      }

      await speechEngine.startListening({
        continuous,
        packageOverride,
        onNotice: (msg) => showActionPill(msg),
      });
    } catch (e: any) {
      console.warn('[Speech] Start session error:', e?.message || e);
    }
  };

  /**
   * Unified Hands-Free Auto-Listener Scheduler
   * Enforces single-timer scheduling with strict mutual exclusion against manual taps,
   * TTS playback, active sessions, and native voice interaction overlays.
   */
  const scheduleHandsFreeRestart = (delayMs: number = 800) => {
    if (handsFreeRestartRef.current) {
      clearTimeout(handsFreeRestartRef.current);
      handsFreeRestartRef.current = null;
    }

    if (!isHandsFree || isManualListeningRef.current || oraActions.isSpeaking()) return;

    handsFreeRestartRef.current = setTimeout(async () => {
      if (
        isHandsFree &&
        orbMode === 'idle' &&
        !isManualListeningRef.current &&
        !oraActions.isSpeaking() &&
        !speechEngine.isActive() &&
        !speechEngine.isTransitioning() &&
        AppState.currentState === 'active' &&
        (!OraHardware?.isVoiceSessionActive || !OraHardware.isVoiceSessionActive())
      ) {
        await startListeningSession(true);
      }
    }, delayMs);
  };

  /**
   * Continuous hands-free auto-listener trigger on state change.
   */
  useEffect(() => {
    if (isHandsFree && orbMode === 'idle' && !isManualListeningRef.current) {
      scheduleHandsFreeRestart(1000);
    } else {
      if (handsFreeRestartRef.current) {
        clearTimeout(handsFreeRestartRef.current);
        handsFreeRestartRef.current = null;
      }
    }
  }, [isHandsFree, orbMode]);

  // Sync Android Persistent Notification with Hands-Free mode
  useEffect(() => {
    if (isHandsFree) {
      foregroundVoiceManager.startForegroundNotification().catch(() => {});
    } else {
      foregroundVoiceManager.stopForegroundNotification().catch(() => {});
    }
  }, [isHandsFree]);

  /**
   * Main Intent & Hardware Execution Pipeline
   */
  const processUtterance = async (command: string) => {
    if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current);
    if (silenceDebounceRef.current) clearTimeout(silenceDebounceRef.current);
    latestTranscriptRef.current = '';

    setTranscript(command);
    setOrbMode('executing');

    // Needle Deterministic Intent Slotting
    const resolution = needle.parse(command);

    if (resolution.intent) {
      // Physical Hardware Execution
      const result = await oraActions.execute(
        resolution.intent,
        command,
        resolution.latencyMs,
        {
          isTorchOn,
          setTorch: (val: boolean) => setIsTorchOn(val),
          requestCameraPermission: async () => {
            if (permission?.granted) return true;
            const res = await requestPermission();
            return res.granted;
          },
        }
      );

      // If wake prompt or disambiguation, remain in listening mode for follow-up command
      if (resolution.intent.action === 'conversational' && resolution.intent.kind === 'wake_prompt') {
        setOrbMode('listening');
        showActionPill(result.pillText);
        setTimeout(() => {
          startListeningSession(false);
        }, 350);
        return;
      }

      if (contactsService.getPendingDisambiguation()) {
        setOrbMode('listening');
        showActionPill(result.pillText);
        return;
      }

      // Radiant bloom & feedback pill
      setOrbMode('confirmed');
      showActionPill(result.pillText);

      // Return to idle (or hands-free listener) after bloom
      voiceTimeoutRef.current = setTimeout(() => {
        setOrbMode('idle');
      }, 1600);
    } else {
      // Grammar Rejection
      setOrbMode('error');
      showActionPill('Command Unrecognized');
      oraActions.speak('I did not recognize that command.');
      voiceTimeoutRef.current = setTimeout(() => {
        setOrbMode('idle');
      }, 1600);
    }
  };

  // In-App Speech Recognition Event Handlers (Continuous Hands-Free + Mic Trigger)
  useSpeechRecognitionEvent('start', () => {
    console.log('[Speech] Recognition started');
    if (isManualListeningRef.current) {
      if (orbMode !== 'listening') setOrbMode('listening');
    }
  });

  useSpeechRecognitionEvent('speechstart', () => {
    console.log('[Speech] User speech detected');
    // If user is actively speaking, extend manual listening timeout
    if (isManualListeningRef.current && manualListeningTimerRef.current) {
      clearTimeout(manualListeningTimerRef.current);
      manualListeningTimerRef.current = setTimeout(() => {
        if (isManualListeningRef.current) {
          isManualListeningRef.current = false;
          latestTranscriptRef.current = '';
          setOrbMode('idle');
        }
      }, 7000);
    }
  });

  useSpeechRecognitionEvent('result', (event) => {
    // Acoustic Echo Guard: Drop any speech detected while Ora's loudspeaker is playing TTS response
    if (oraActions.isSpeaking()) return;

    const text = event.results[0]?.transcript;
    if (text && text.trim()) {
      setTranscript(text);
      latestTranscriptRef.current = text.trim();

      const isManual = isManualListeningRef.current;
      const hasWakeWord = /\b(hey|ok|okay|hi|hello)?\s*ora\b/i.test(text);

      if (isManual || orbMode === 'listening' || hasWakeWord) {
        if (orbMode === 'idle') {
          setOrbMode('listening');
        }

        // Reset silence timer on every new speech token
        if (silenceDebounceRef.current) clearTimeout(silenceDebounceRef.current);

        if (event.isFinal) {
          isManualListeningRef.current = false;
          if (manualListeningTimerRef.current) clearTimeout(manualListeningTimerRef.current);
          const toExecute = latestTranscriptRef.current;
          latestTranscriptRef.current = '';
          processUtterance(toExecute);
        } else {
          // If Android continuous recognition doesn't dispatch isFinal, auto-trigger after 1100ms of user silence
          silenceDebounceRef.current = setTimeout(() => {
            if (latestTranscriptRef.current) {
              isManualListeningRef.current = false;
              if (manualListeningTimerRef.current) clearTimeout(manualListeningTimerRef.current);
              const toExecute = latestTranscriptRef.current;
              latestTranscriptRef.current = '';
              processUtterance(toExecute);
            }
          }, 1100);
        }
      }
    }
  });

  useSpeechRecognitionEvent('volumechange', (event) => {
    // Reset manual listening timeout when speech audio volume is detected
    if (event.value > 1 && isManualListeningRef.current) {
      if (manualListeningTimerRef.current) {
        clearTimeout(manualListeningTimerRef.current);
        manualListeningTimerRef.current = setTimeout(() => {
          if (isManualListeningRef.current) {
            isManualListeningRef.current = false;
            setOrbMode('idle');
          }
        }, 7000);
      }
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    const parsed = parseSpeechError(event);
    console.warn(`[Speech] Recognition error: ${parsed.name} (${parsed.code}) — ${parsed.description}`, event);

    // If speech engine is currently executing a planned cooldown/abort, ignore the event completely
    if (
      speechEngine.isTransitioning() ||
      parsed.name === 'ERROR_ABORTED' ||
      (event.error as string) === 'abort' ||
      (event.error as string) === 'aborted'
    ) {
      console.log('[Speech] Intentional session transition/abort — ignoring error');
      return;
    }

    // Silence timeout / No speech detected:
    if (parsed.name === 'ERROR_SPEECH_TIMEOUT' || event.error === 'no-speech' || parsed.name === 'ERROR_NO_MATCH') {
      if (isManualListeningRef.current) {
        isManualListeningRef.current = false;
        if (manualListeningTimerRef.current) clearTimeout(manualListeningTimerRef.current);
        setOrbMode('idle');
        showActionPill("Didn't catch that. Tap orb to speak");
        return;
      }
      // If hands-free, natural silence in room — schedule next poll cleanly without error pill
      if (isHandsFree && orbMode === 'idle') {
        scheduleHandsFreeRestart(1500);
        return;
      }
    }

    // Recognizer busy / HAL lockout: wait with hardware cooldown, then retry or reschedule
    if (parsed.name === 'ERROR_RECOGNIZER_BUSY' || event.error === 'busy') {
      console.warn('[Speech] Recognizer busy — executing hardware cooldown');
      if (isManualListeningRef.current && failoverCountRef.current < 1) {
        failoverCountRef.current += 1;
        setTimeout(async () => {
          if (isManualListeningRef.current) {
            await speechEngine.stopAndCooldown(450);
            await startListeningSession(false);
          }
        }, 450);
        return;
      }
      if (isHandsFree && orbMode === 'idle') {
        scheduleHandsFreeRestart(2200);
        return;
      }
    }

    // Hard fatal errors: permissions or audio hardware failure
    const isHardFatal =
      parsed.name === 'ERROR_INSUFFICIENT_PERMISSIONS' ||
      parsed.name === 'ERROR_AUDIO';

    if (isHardFatal) {
      console.warn(`[Speech] Hard fatal error (${parsed.name}) — terminating session.`);
      isManualListeningRef.current = false;
      if (manualListeningTimerRef.current) clearTimeout(manualListeningTimerRef.current);
      if (orbMode === 'listening') setOrbMode('idle');
      showActionPill(parsed.name === 'ERROR_INSUFFICIENT_PERMISSIONS' ? 'Mic Permission Required' : 'Audio Hardware Busy');
      return;
    }

    // Recoverable errors (ERROR_CLIENT=5, etc.): attempt single package failover in manual session
    if (isManualListeningRef.current && failoverCountRef.current < 1) {
      failoverCountRef.current += 1;
      const nextPkg = speechEngine.cycleNextPackage();
      console.log(`[Speech] Recoverable "${parsed.name}" — trying package: ${nextPkg || 'system-default'}`);
      setTimeout(async () => {
        if (isManualListeningRef.current) {
          await speechEngine.stopAndCooldown(350);
          await startListeningSession(false, nextPkg);
        }
      }, 350);
      return;
    }

    // All failovers exhausted — clean up
    if (isManualListeningRef.current) {
      isManualListeningRef.current = false;
      if (manualListeningTimerRef.current) clearTimeout(manualListeningTimerRef.current);
    }
    if (orbMode === 'listening') setOrbMode('idle');

    if (event.error === 'network') {
      showActionPill('Offline Engine Active');
      if (isHandsFree && orbMode === 'idle') {
        scheduleHandsFreeRestart(2500);
      }
    } else if (parsed.name === 'ERROR_CLIENT') {
      console.log('[Speech] Transient ERROR_CLIENT on HyperOS');
      if (isHandsFree && orbMode === 'idle') {
        scheduleHandsFreeRestart(2500);
      }
    } else {
      // Do not display alarming internal error pills for transient recognizer issues
      if (isHandsFree && orbMode === 'idle') {
        scheduleHandsFreeRestart(2000);
      }
    }
  });

  useSpeechRecognitionEvent('end', () => {
    if (silenceDebounceRef.current) clearTimeout(silenceDebounceRef.current);

    // If speech engine is transitioning/cooldown, ignore the end event
    if (speechEngine.isTransitioning()) {
      return;
    }

    // If there is an unprocessed transcript when speech ends, execute it immediately
    if (latestTranscriptRef.current) {
      isManualListeningRef.current = false;
      if (manualListeningTimerRef.current) clearTimeout(manualListeningTimerRef.current);
      const toExecute = latestTranscriptRef.current;
      latestTranscriptRef.current = '';
      processUtterance(toExecute);
      return;
    }

    // If Ora is speaking, do not restart yet; the speech listener will restart once TTS completes
    if (oraActions.isSpeaking()) {
      return;
    }

    // Manual listening ended without speech: cleanly transition to idle
    if (isManualListeningRef.current) {
      isManualListeningRef.current = false;
      if (manualListeningTimerRef.current) clearTimeout(manualListeningTimerRef.current);
      setOrbMode('idle');
      return;
    }

    // If hands-free is enabled and system is idle, schedule restart via unified scheduler
    if (isHandsFree && orbMode === 'idle') {
      scheduleHandsFreeRestart(800);
    } else if (orbMode === 'listening') {
      setOrbMode('idle');
    }
  });

  const handleOrbPress = async () => {
    if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current);
    if (silenceDebounceRef.current) clearTimeout(silenceDebounceRef.current);
    if (handsFreeRestartRef.current) {
      clearTimeout(handsFreeRestartRef.current);
      handsFreeRestartRef.current = null;
    }

    if (orbMode === 'listening' || orbMode === 'executing') {
      // User tapped to cancel / interrupt — give HAL 250ms to release
      isManualListeningRef.current = false;
      latestTranscriptRef.current = '';
      if (manualListeningTimerRef.current) clearTimeout(manualListeningTimerRef.current);
      await speechEngine.stopAndCooldown(250);
      setOrbMode('idle');
      return;
    }

    // Strict Audio Session Handshake for Manual Tap
    isManualListeningRef.current = true;
    failoverCountRef.current = 0;
    latestTranscriptRef.current = '';
    setTranscript('');
    setOrbMode('listening');
    showActionPill('Listening... Speak now');

    // Reset provider index to system default (candidate 0) on each new manual tap
    speechEngine.resetPackageIndex();

    // Clean hardware cooldown before a new manual session
    await speechEngine.stopAndCooldown(250);

    // Safe auto-timeout if user taps orb but never speaks
    if (manualListeningTimerRef.current) clearTimeout(manualListeningTimerRef.current);
    manualListeningTimerRef.current = setTimeout(() => {
      if (isManualListeningRef.current) {
        isManualListeningRef.current = false;
        latestTranscriptRef.current = '';
        setOrbMode('idle');
        showActionPill('Listening timed out');
      }
    }, 8000);

    // Launch single-shot manual speech session cleanly
    await startListeningSession(false);
  };

  const handleSelectQuickCommand = (cmd: string) => {
    setIsDrawerOpen(false);
    processUtterance(cmd);
  };

  const handleTextSubmit = () => {
    if (typedInput.trim()) {
      const cmd = typedInput.trim();
      setTypedInput('');
      setIsTextInputOpen(false);
      processUtterance(cmd);
    }
  };

  return (
    <SafeAreaProvider>
      <LinearGradient
        colors={['#030509', '#080C1B', '#020306']}
        style={styles.gradientContainer}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <SafeAreaView style={styles.container}>
          <StatusBar barStyle="light-content" backgroundColor="#030509" />

          {/* Hidden physical camera for hardware flashlight fallback only on non-Android platforms */}
          {Platform.OS !== 'web' && Platform.OS !== 'android' && permission?.granted && (
            <CameraView
              style={styles.hiddenCamera}
              enableTorch={isTorchOn}
              facing="back"
            />
          )}

          {/* Ultra-Luxury Executive Top Bar */}
          <View style={styles.topBar}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setIsDrawerOpen(true);
              }}
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
              hitSlop={12}
            >
              <Ionicons name="grid-outline" size={18} color="#94A3B8" />
            </Pressable>

            {/* Glassmorphic Brand Status Pill */}
            <View style={styles.brandPill}>
              <View style={styles.livePulseDot} />
              <Text style={styles.brandText}>ORA</Text>
              <View style={styles.brandBadgeDivider} />
              <Text style={styles.brandBadgeText}>100% On-Device</Text>
            </View>

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setIsTextInputOpen(true);
              }}
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
              hitSlop={12}
            >
              <Ionicons name="terminal-outline" size={18} color="#94A3B8" />
            </Pressable>
          </View>

          {/* Hands-Free Wake Word Mode Toggle */}
          <View style={styles.handsFreeContainer}>
            <Pressable
              onPress={() => {
                const next = !isHandsFree;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                setIsHandsFree(next);
                showActionPill(next ? '🎙️ Hands-Free: "Hey Ora" Active' : 'Tap to Speak Mode');
                if (!next) {
                  try {
                    ExpoSpeechRecognitionModule.stop();
                  } catch (e) {}
                }
              }}
              style={({ pressed }) => [
                styles.handsFreeBadge,
                isHandsFree && styles.handsFreeBadgeActive,
                pressed && styles.iconButtonPressed,
              ]}
            >
              <View style={[styles.handsFreeDot, isHandsFree && styles.handsFreeDotActive]} />
              <Text style={[styles.handsFreeText, isHandsFree && styles.handsFreeTextActive]}>
                {isHandsFree ? 'Wake Word: "Hey Ora" Active' : 'Hands-Free Paused (Tap to Speak)'}
              </Text>
              <Ionicons
                name={isHandsFree ? 'checkmark-circle' : 'pause-circle-outline'}
                size={13}
                color={isHandsFree ? '#10B981' : '#64748B'}
                style={{ marginLeft: 6 }}
              />
            </Pressable>
          </View>

          {/* Vertical Centerpiece Canvas */}
          <View style={styles.centerCanvas}>
            {/* Living Acoustic Orb with Ambient Dynamic Glow Aura */}
            <View style={styles.orbAuraWrapper}>
              <View
                style={[
                  styles.ambientAuraGlow,
                  orbMode === 'listening' && styles.ambientAuraListening,
                  orbMode === 'executing' && styles.ambientAuraExecuting,
                  orbMode === 'confirmed' && styles.ambientAuraConfirmed,
                  orbMode === 'error' && styles.ambientAuraError,
                ]}
              />
              <OraOrb size={176} mode={orbMode} onPress={handleOrbPress} />
            </View>

            {/* Speech & Intent Typography */}
            <View style={styles.textContainer}>
              {transcript ? (
                <Animated.Text
                  entering={FadeIn.duration(180)}
                  style={styles.activeTranscript}
                  numberOfLines={2}
                >
                  "{transcript}"
                </Animated.Text>
              ) : orbMode === 'listening' ? (
                <Animated.Text entering={FadeIn} style={styles.listeningPrompt}>
                  Listening... speak now
                </Animated.Text>
              ) : (
                <View style={styles.idlePromptContainer}>
                  <Text style={styles.idlePromptHeader}>Hey Ora</Text>
                  <Text style={styles.idlePromptSub}>
                    {isHandsFree ? 'Say "Hey Ora" or tap orb to speak' : 'Tap orb or microphone to speak'}
                  </Text>
                </View>
              )}
            </View>

            {/* Interactive Spoken Prompt Chips Carousel */}
            {orbMode === 'idle' && !actionPill && (
              <Animated.View entering={FadeInUp.delay(80).duration(260)} style={styles.promptChipsWrapper}>
                <Text style={styles.promptChipsHeader}>QUICK COMMANDS</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.promptChipsScroll}
                >
                  {QUICK_PROMPTS.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        processUtterance(item.command);
                      }}
                      style={({ pressed }) => [
                        styles.promptChip,
                        pressed && styles.promptChipPressed,
                      ]}
                    >
                      <Ionicons name={item.icon} size={14} color="#F59E0B" style={{ marginRight: 6 }} />
                      <Text style={styles.promptChipText}>{item.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </Animated.View>
            )}

            {/* Dynamic Island Style Floating Action Feedback Pill */}
            {actionPill && (
              <Animated.View
                entering={FadeInUp.springify().damping(16)}
                exiting={FadeOutDown.duration(200)}
                style={styles.actionPill}
              >
                <View style={styles.actionPillIndicator} />
                <Text style={styles.actionPillText}>{actionPill}</Text>
              </Animated.View>
            )}

            {/* Interactive Disambiguation Dialogue Card */}
            {disambiguation && disambiguation.candidates.length > 0 && (
              <Animated.View
                entering={FadeInUp.springify().damping(18)}
                exiting={FadeOutDown.duration(200)}
                style={styles.disambiguationContainer}
              >
                <View style={styles.disambiguationHeader}>
                  <Text style={styles.disambiguationTitle}>
                    {disambiguation.action === 'call' ? 'Call which contact?' : 'Text which contact?'}
                  </Text>
                  <Pressable
                    onPress={() => {
                      contactsService.clearPendingDisambiguation();
                      setOrbMode('idle');
                    }}
                    hitSlop={10}
                  >
                    <Ionicons name="close-circle-outline" size={20} color="#94A3B8" />
                  </Pressable>
                </View>

                {disambiguation.candidates.map((candidate, idx) => (
                  <Pressable
                    key={candidate.id + '_' + idx}
                    onPress={() => {
                      processUtterance(`option ${idx + 1}`);
                    }}
                    style={({ pressed }) => [
                      styles.disambiguationCard,
                      pressed && styles.disambiguationCardPressed,
                    ]}
                  >
                    <View style={styles.disambiguationBadge}>
                      <Text style={styles.disambiguationBadgeText}>{idx + 1}</Text>
                    </View>
                    <View style={styles.disambiguationDetails}>
                      <Text style={styles.disambiguationName} numberOfLines={1}>
                        {candidate.name}
                      </Text>
                      <Text style={styles.disambiguationPhone} numberOfLines={1}>
                        {candidate.phone}
                      </Text>
                    </View>
                    <Ionicons
                      name={disambiguation.action === 'call' ? 'call' : 'chatbubble'}
                      size={18}
                      color="#06B6D4"
                    />
                  </Pressable>
                ))}
              </Animated.View>
            )}
          </View>

          {/* Elevated Floating Glassmorphic Dock */}
          <View style={styles.bottomDockContainer}>
            <View style={styles.bottomDock}>
              {/* Torch Quick Status Button */}
              <Pressable
                onPress={() => {
                  const target = !isTorchOn;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setIsTorchOn(target);
                  showActionPill(target ? '⚡ Flashlight On' : '⚡ Flashlight Off');
                }}
                style={({ pressed }) => [
                  styles.dockButton,
                  isTorchOn && styles.dockButtonTorchActive,
                  pressed && styles.iconButtonPressed,
                ]}
              >
                <Ionicons
                  name={isTorchOn ? 'flashlight' : 'flashlight-outline'}
                  size={20}
                  color={isTorchOn ? '#FBBF24' : '#94A3B8'}
                />
              </Pressable>

              {/* Master Microphone Button */}
              <Pressable
                onPress={handleOrbPress}
                style={({ pressed }) => [
                  styles.masterMicButton,
                  orbMode === 'listening' && styles.masterMicButtonActive,
                  pressed && styles.masterMicButtonPressed,
                ]}
              >
                <LinearGradient
                  colors={
                    orbMode === 'listening'
                      ? ['#FDE047', '#EAB308', '#CA8A04']
                      : ['rgba(255, 255, 255, 0.14)', 'rgba(255, 255, 255, 0.05)']
                  }
                  style={styles.masterMicGradient}
                >
                  <Ionicons
                    name={orbMode === 'listening' ? 'mic' : 'mic-outline'}
                    size={28}
                    color={orbMode === 'listening' ? '#000000' : '#F8FAFC'}
                  />
                </LinearGradient>
              </Pressable>

              {/* Quick Commands & Capabilities Trigger */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setIsDrawerOpen(true);
                }}
                style={({ pressed }) => [styles.dockButton, pressed && styles.iconButtonPressed]}
              >
                <Ionicons name="sparkles-outline" size={20} color="#94A3B8" />
              </Pressable>
            </View>
          </View>

          {/* Executive Voice Capabilities & Offline Dashboard Modal */}
          <Modal
            visible={isDrawerOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setIsDrawerOpen(false)}
          >
            <Pressable style={styles.modalBackdrop} onPress={() => setIsDrawerOpen(false)}>
              <Animated.View entering={FadeInUp.duration(220)} style={styles.modalSheet}>
                <View style={styles.sheetHandle} />

                <View style={styles.sheetHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetTitle}>ORA OFFLINE SYSTEM DASHBOARD</Text>
                    <Text style={styles.sheetSubtitle}>Zero-Cloud Edge Intelligence • 100% Private</Text>
                  </View>
                </View>

                {/* Hardware & OS Subsystem Status Card */}
                <View style={styles.statusCard}>
                  <View style={styles.statusRow}>
                    <Ionicons name="shield-checkmark" size={14} color="#10B981" />
                    <Text style={styles.statusLabel}>Acoustic Echo Guard:</Text>
                    <Text style={styles.statusValue}>Active (Feedback Suppressed)</Text>
                  </View>
                  <View style={styles.statusRow}>
                    <Ionicons name="hardware-chip-outline" size={14} color="#38BDF8" />
                    <Text style={styles.statusLabel}>Deterministic Engine:</Text>
                    <Text style={styles.statusValue}>Needle Parser (&lt;15ms Latency)</Text>
                  </View>
                  <View style={styles.statusRow}>
                    <Ionicons name="people-outline" size={14} color="#F59E0B" />
                    <Text style={styles.statusLabel}>Phonebook Engine:</Text>
                    <Text style={styles.statusValue}>
                      {contactsCount > 0 ? `${contactsCount} Contacts (Live Local Cache)` : 'Connecting Phonebook...'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.sectionHeader}>VOICE CAPABILITIES (SPOKEN TEMPLATES)</Text>

                <ScrollView
                  style={styles.capabilitiesScroll}
                  contentContainerStyle={styles.capabilitiesContainer}
                  showsVerticalScrollIndicator={false}
                >
                  {CAPABILITY_GUIDE.map((category) => (
                    <View key={category.id} style={styles.categoryCard}>
                      <View style={styles.categoryHeader}>
                        <Ionicons name={category.icon} size={16} color="#F59E0B" style={{ marginRight: 8 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.categoryTitle}>{category.name}</Text>
                          <Text style={styles.categoryDesc}>{category.description}</Text>
                        </View>
                      </View>

                      <View style={styles.commandList}>
                        {category.examples.map((cmd, idx) => (
                          <Pressable
                            key={idx}
                            style={({ pressed }) => [
                              styles.quickCommandItem,
                              pressed && styles.quickCommandItemPressed,
                            ]}
                            onPress={() => handleSelectQuickCommand(cmd.phrase)}
                          >
                            <Ionicons name="mic-outline" size={13} color="#F59E0B" style={{ marginRight: 8 }} />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.quickCommandText}>"{cmd.phrase}"</Text>
                              <Text style={styles.quickCommandSub}>{cmd.detail}</Text>
                            </View>
                            <Ionicons name="arrow-forward" size={13} color="#475569" />
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </Animated.View>
            </Pressable>
          </Modal>

          {/* Text Input Modal for Silent Trigger */}
          <Modal
            visible={isTextInputOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setIsTextInputOpen(false)}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.modalBackdrop}
            >
              <View style={styles.textInputCard}>
                <Text style={styles.textInputLabel}>TYPE ASSISTANT COMMAND</Text>
                <TextInput
                  style={styles.textInputField}
                  placeholder="e.g. Turn on flashlight, Call Mom..."
                  placeholderTextColor="#64748B"
                  value={typedInput}
                  onChangeText={setTypedInput}
                  onSubmitEditing={handleTextSubmit}
                  autoFocus
                  returnKeyType="send"
                />
                <View style={styles.textInputActions}>
                  <Pressable
                    style={styles.cancelButton}
                    onPress={() => setIsTextInputOpen(false)}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={styles.sendButton}
                    onPress={handleTextSubmit}
                  >
                    <Text style={styles.sendButtonText}>Send</Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        </SafeAreaView>
      </LinearGradient>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  gradientContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  hiddenCamera: {
    width: 1,
    height: 1,
    opacity: 0,
    position: 'absolute',
    top: -50,
    left: -50,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 8,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  iconButtonPressed: {
    opacity: 0.6,
    transform: [{ scale: 0.95 }],
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 9,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  brandText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 1.2,
  },
  brandBadgeDivider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginHorizontal: 8,
  },
  brandBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#06B6D4',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  handsFreeContainer: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  handsFreeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 9999,
  },
  handsFreeBadgeActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.28)',
  },
  handsFreeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#64748B',
    marginRight: 8,
  },
  handsFreeDotActive: {
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },
  handsFreeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  handsFreeTextActive: {
    color: '#E2E8F0',
  },
  centerCanvas: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  orbAuraWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ambientAuraGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(245, 158, 11, 0.06)',
  },
  ambientAuraListening: {
    backgroundColor: 'rgba(6, 182, 212, 0.18)',
    transform: [{ scale: 1.2 }],
  },
  ambientAuraExecuting: {
    backgroundColor: 'rgba(168, 85, 247, 0.22)',
    transform: [{ scale: 1.15 }],
  },
  ambientAuraConfirmed: {
    backgroundColor: 'rgba(16, 185, 129, 0.22)',
    transform: [{ scale: 1.25 }],
  },
  ambientAuraError: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  textContainer: {
    marginTop: 24,
    alignItems: 'center',
    minHeight: 64,
    justifyContent: 'center',
  },
  idlePromptContainer: {
    alignItems: 'center',
  },
  idlePromptHeader: {
    fontSize: 26,
    fontWeight: '600',
    color: 'rgba(248, 250, 252, 0.65)',
    letterSpacing: -0.5,
  },
  idlePromptSub: {
    fontSize: 12,
    fontWeight: '400',
    color: '#64748B',
    marginTop: 6,
    letterSpacing: 0.3,
  },
  listeningPrompt: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FDE047',
    letterSpacing: -0.3,
  },
  activeTranscript: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.4,
    lineHeight: 30,
  },
  promptChipsWrapper: {
    width: '100%',
    marginTop: 20,
    alignItems: 'center',
  },
  promptChipsHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1.2,
    marginBottom: 8,
    textAlign: 'center',
  },
  promptChipsScroll: {
    paddingHorizontal: 8,
    gap: 8,
    flexDirection: 'row',
  },
  promptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 9999,
  },
  promptChipPressed: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#F59E0B',
    transform: [{ scale: 0.96 }],
  },
  promptChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#E2E8F0',
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  actionPillIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F59E0B',
    marginRight: 9,
  },
  actionPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
    letterSpacing: 0.5,
  },
  bottomDockContainer: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    paddingTop: 8,
    alignItems: 'center',
  },
  bottomDock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 40,
    paddingHorizontal: 16,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  dockButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dockButtonTorchActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  masterMicButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    padding: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 10,
  },
  masterMicButtonActive: {
    borderColor: '#FACC15',
    shadowOpacity: 0.6,
    shadowRadius: 20,
  },
  masterMicButtonPressed: {
    transform: [{ scale: 0.94 }],
  },
  masterMicGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.76)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#0A0D16',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 36,
    maxHeight: '85%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1.2,
  },
  sheetSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  statusCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    padding: 14,
    gap: 9,
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginLeft: 7,
    marginRight: 4,
  },
  statusValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1,
    marginBottom: 10,
  },
  capabilitiesScroll: {
    maxHeight: 380,
  },
  capabilitiesContainer: {
    paddingBottom: 24,
    gap: 12,
  },
  categoryCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.025)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 12,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  categoryDesc: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  commandList: {
    gap: 6,
  },
  quickCommandItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  quickCommandItemPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  quickCommandText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F1F5F9',
  },
  quickCommandSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  textInputCard: {
    backgroundColor: '#0A0D16',
    margin: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 20,
  },
  textInputLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1,
    marginBottom: 12,
  },
  textInputField: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#F8FAFC',
    marginBottom: 16,
  },
  textInputActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  cancelButtonText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  sendButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#F59E0B',
  },
  sendButtonText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700',
  },
  disambiguationContainer: {
    backgroundColor: '#0F131D',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
    borderRadius: 18,
    padding: 14,
    marginTop: 18,
    width: '92%',
    maxWidth: 380,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  disambiguationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  disambiguationTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38BDF8',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  disambiguationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  disambiguationCardPressed: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: '#06B6D4',
  },
  disambiguationBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(6, 182, 212, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  disambiguationBadgeText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
  },
  disambiguationDetails: {
    flex: 1,
  },
  disambiguationName: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
  disambiguationPhone: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
});
