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
import { speechEngine } from './src/services/speechEngine';
import { requireNativeModule } from 'expo-modules-core';

let OraHardware: any = null;
try {
  OraHardware = requireNativeModule('OraHardware');
} catch (e) {}

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
      }
    });

    return () => {
      linkSub.remove();
      appStateSub.remove();
    };
  }, []);

  // Request core native permissions on mount (excluding high-risk SMS to prevent MIUI security block)
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission().catch(() => {});
    }

    if (Platform.OS === 'android') {
      PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
        PermissionsAndroid.PERMISSIONS.CALL_PHONE,
        PermissionsAndroid.PERMISSIONS.SEND_SMS,
      ]).then(() => {
        contactsService.loadContacts().catch(() => {});
      }).catch(() => {
        contactsService.loadContacts().catch(() => {});
      });
    } else {
      contactsService.loadContacts().catch(() => {});
    }
  }, [permission]);

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
          if (handsFreeRestartRef.current) clearTimeout(handsFreeRestartRef.current);
          handsFreeRestartRef.current = setTimeout(() => {
            startListeningSession(true);
          }, 350);
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
   * Continuous hands-free auto-listener loop when idle
   */
  useEffect(() => {
    if (isHandsFree) {
      const timer = setTimeout(() => {
        startListeningSession(true);
      }, 700);
      return () => clearTimeout(timer);
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
    const err = event.error;
    const msg = event.message || '';
    console.warn('[Speech] recognition error event:', err, msg);

    // If transient silence timeout, don't abort manual listening window early
    if (err === 'no-speech') {
      if (isManualListeningRef.current) {
        return;
      }
    }

    // If engine is busy from previous uncleaned session, cleanly abort and retry
    if (err === 'busy') {
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch (_) {}
      if (isManualListeningRef.current) {
        setTimeout(() => {
          if (isManualListeningRef.current) {
            startListeningSession(false);
          }
        }, 150);
      }
      return;
    }

    // Engine Failover: If current speech recognition engine throws an error
    // (e.g. language-not-supported on missing 62MB pack, or client/audio-capture/network),
    // automatically cycle to the next installed speech engine on the device!
    if (isManualListeningRef.current || orbMode === 'listening') {
      const candidates = speechEngine.getCandidatePackages();
      if (candidates.length > 1) {
        const nextPkg = speechEngine.cycleNextPackage();
        console.log(`[Speech] Engine failed with "${err}". Trying next provider: ${nextPkg || 'default'}`);
        try {
          ExpoSpeechRecognitionModule.abort();
        } catch (_) {}
        setTimeout(() => {
          if (isManualListeningRef.current || orbMode === 'listening') {
            startListeningSession(false, nextPkg);
          }
        }, 200);
        return;
      }
    }

    // If all failovers exhausted or non-recoverable error
    if (isManualListeningRef.current) {
      isManualListeningRef.current = false;
      if (manualListeningTimerRef.current) clearTimeout(manualListeningTimerRef.current);
    }

    if (orbMode === 'listening') {
      setOrbMode('idle');
    }

    if (err === 'network') {
      showActionPill('Offline Recognition Active');
    } else if (err !== 'no-speech') {
      showActionPill(`Mic: ${err}`);
    }
  });

  useSpeechRecognitionEvent('end', () => {
    if (silenceDebounceRef.current) clearTimeout(silenceDebounceRef.current);

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

    // If the user tapped the mic and is still in their manual listening window, keep the recognizer alive
    if (isManualListeningRef.current) {
      startListeningSession(false);
      return;
    }

    if (isHandsFree && orbMode === 'idle') {
      if (handsFreeRestartRef.current) clearTimeout(handsFreeRestartRef.current);
      handsFreeRestartRef.current = setTimeout(() => {
        startListeningSession(true);
      }, 600);
    } else if (orbMode === 'listening') {
      setOrbMode('idle');
    }
  });

  const handleOrbPress = async () => {
    if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current);
    if (silenceDebounceRef.current) clearTimeout(silenceDebounceRef.current);

    if (orbMode === 'listening' || orbMode === 'executing') {
      // User tapped to cancel / interrupt
      isManualListeningRef.current = false;
      latestTranscriptRef.current = '';
      if (manualListeningTimerRef.current) clearTimeout(manualListeningTimerRef.current);
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch (e) {}
      setOrbMode('idle');
      return;
    }

    // User tapped to speak a direct command (Google Assistant mic style)
    isManualListeningRef.current = true;
    latestTranscriptRef.current = '';
    setTranscript('');
    setOrbMode('listening');
    showActionPill('Listening... Speak now');

    // Reset provider index to top candidate on new manual tap
    speechEngine.resetPackageIndex();

    // Safe auto-timeout if user taps orb but never speaks
    if (manualListeningTimerRef.current) clearTimeout(manualListeningTimerRef.current);
    manualListeningTimerRef.current = setTimeout(() => {
      if (isManualListeningRef.current) {
        isManualListeningRef.current = false;
        latestTranscriptRef.current = '';
        setOrbMode('idle');
      }
    }, 8000);

    // Launch speech session cleanly through speechEngine
    startListeningSession(false);
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
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#050508" />

        {/* Hidden physical camera for hardware flashlight fallback only on non-Android platforms */}
        {Platform.OS !== 'web' && Platform.OS !== 'android' && permission?.granted && (
          <CameraView
            style={styles.hiddenCamera}
            enableTorch={isTorchOn}
            facing="back"
          />
        )}

        {/* Minimalist Executive Top Bar */}
        <View style={styles.topBar}>
          <Pressable
            onPress={() => setIsDrawerOpen(true)}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            hitSlop={12}
          >
            <Ionicons name="apps-outline" size={20} color="#94A3B8" />
          </Pressable>

          {/* Discreet Ora Brand Pill */}
          <View style={styles.brandPill}>
            <View style={styles.sparkleDot} />
            <Text style={styles.brandText}>Ora</Text>
            <Text style={styles.brandSubtitle}>Offline Edge</Text>
          </View>

          <Pressable
            onPress={() => setIsTextInputOpen(true)}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            hitSlop={12}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={20} color="#94A3B8" />
          </Pressable>
        </View>

        {/* Hands-Free Wake Word Mode Toggle */}
        <View style={styles.handsFreeContainer}>
          <Pressable
            onPress={() => {
              const next = !isHandsFree;
              setIsHandsFree(next);
              showActionPill(next ? '🎙️ Hands-Free Active ("Hey Ora")' : 'Tap to Speak Mode');
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
              {isHandsFree ? 'Wake Word: "Hey Ora" (Active)' : 'Hands-Free Paused (Tap to Speak)'}
            </Text>
          </Pressable>
        </View>

        {/* Vertical Centerpiece Canvas */}
        <View style={styles.centerCanvas}>
          {/* Living Acoustic Orb */}
          <OraOrb size={170} mode={orbMode} onPress={handleOrbPress} />

          {/* Minimalist Speech & Intent Typography */}
          <View style={styles.textContainer}>
            {transcript ? (
              <Animated.Text
                entering={FadeIn.duration(200)}
                style={styles.activeTranscript}
                numberOfLines={2}
              >
                "{transcript}"
              </Animated.Text>
            ) : orbMode === 'listening' ? (
              <Animated.Text entering={FadeIn} style={styles.listeningPrompt}>
                Listening...
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

          {/* Floating Action Feedback Pill */}
          {actionPill && (
            <Animated.View
              entering={FadeInUp.springify().damping(16)}
              exiting={FadeOutDown.duration(220)}
              style={styles.actionPill}
            >
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

        {/* Sleek Bottom Bar with Frosted Glass Mic Trigger */}
        <View style={styles.bottomBar}>
          {/* Torch Quick Status Button */}
          <Pressable
            onPress={() => {
              const target = !isTorchOn;
              setIsTorchOn(target);
              showActionPill(target ? '⚡ Flashlight On' : '⚡ Flashlight Off');
            }}
            style={({ pressed }) => [
              styles.secondaryButton,
              isTorchOn && styles.secondaryButtonActive,
              pressed && styles.iconButtonPressed,
            ]}
          >
            <Ionicons
              name={isTorchOn ? 'flashlight' : 'flashlight-outline'}
              size={20}
              color={isTorchOn ? '#FBBF24' : '#64748B'}
            />
          </Pressable>

          {/* Central Master Microphone Trigger */}
          <Pressable
            onPress={handleOrbPress}
            style={({ pressed }) => [
              styles.micTrigger,
              orbMode === 'listening' && styles.micTriggerActive,
              pressed && styles.micTriggerPressed,
            ]}
          >
            <View style={styles.micInnerGlow}>
              <Ionicons
                name={orbMode === 'listening' ? 'mic' : 'mic-outline'}
                size={30}
                color={orbMode === 'listening' ? '#FDE047' : '#F8FAFC'}
              />
            </View>
          </Pressable>

          {/* Quick Commands Sheet Trigger */}
          <Pressable
            onPress={() => setIsDrawerOpen(true)}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.iconButtonPressed]}
          >
            <Ionicons name="sparkles-outline" size={20} color="#64748B" />
          </Pressable>
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
                  <Ionicons name="shield-checkmark" size={13} color="#10B981" />
                  <Text style={styles.statusLabel}>Acoustic Echo Guard:</Text>
                  <Text style={styles.statusValue}>Active (Feedback Suppressed)</Text>
                </View>
                <View style={styles.statusRow}>
                  <Ionicons name="hardware-chip-outline" size={13} color="#38BDF8" />
                  <Text style={styles.statusLabel}>Universal App Launcher:</Text>
                  <Text style={styles.statusValue}>Android PackageManager Active</Text>
                </View>
                <View style={styles.statusRow}>
                  <Ionicons name="people-outline" size={13} color="#F59E0B" />
                  <Text style={styles.statusLabel}>Phonebook Engine:</Text>
                  <Text style={styles.statusValue}>
                    {contactsCount > 0 ? `${contactsCount} Contacts (Live Auto-Sync)` : 'Connecting Phonebook...'}
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
                      <Ionicons name={category.icon} size={15} color="#F59E0B" style={{ marginRight: 8 }} />
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
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050508', // Deep luxury obsidian black
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonPressed: {
    opacity: 0.6,
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 9999,
  },
  sparkleDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#F59E0B',
    marginRight: 8,
  },
  brandText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginLeft: 6,
    letterSpacing: 0.2,
  },
  handsFreeContainer: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  handsFreeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.025)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 9999,
  },
  handsFreeBadgeActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  handsFreeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#64748B',
    marginRight: 7,
  },
  handsFreeDotActive: {
    backgroundColor: '#10B981',
  },
  handsFreeText: {
    fontSize: 10,
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
    paddingHorizontal: 28,
  },
  textContainer: {
    marginTop: 26,
    alignItems: 'center',
    minHeight: 64,
    justifyContent: 'center',
  },
  idlePromptContainer: {
    alignItems: 'center',
  },
  idlePromptHeader: {
    fontSize: 24,
    fontWeight: '500',
    color: 'rgba(248, 250, 252, 0.55)',
    letterSpacing: -0.4,
  },
  idlePromptSub: {
    fontSize: 12,
    fontWeight: '400',
    color: '#475569',
    marginTop: 6,
    letterSpacing: 0.2,
  },
  listeningPrompt: {
    fontSize: 24,
    fontWeight: '600',
    color: '#FDE047',
    letterSpacing: -0.4,
  },
  activeTranscript: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.4,
    lineHeight: 30,
  },
  actionPill: {
    marginTop: 22,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  actionPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
    letterSpacing: 0.6,
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 28,
    paddingTop: 12,
  },
  secondaryButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  micTrigger: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 10,
  },
  micTriggerActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderColor: '#FACC15',
    shadowOpacity: 0.5,
  },
  micTriggerPressed: {
    transform: [{ scale: 0.94 }],
  },
  micInnerGlow: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#0B0D14',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.09)',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
    maxHeight: '85%',
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1.2,
  },
  sheetSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 9999,
  },
  syncButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F59E0B',
  },
  statusCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 12,
    gap: 8,
    marginBottom: 14,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginLeft: 6,
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
    backgroundColor: '#0B0D14',
    margin: 20,
    borderRadius: 20,
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
