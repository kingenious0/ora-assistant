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
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
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
import { contactsService } from './src/services/contactsService';
import { foregroundVoiceManager } from './src/services/foregroundService';

const QUICK_COMMANDS = [
  'Turn on flashlight',
  'Call Emmanuel',
  'Open WhatsApp Business',
  'Open Snapchat',
  'Lock phone',
  'What time is it?',
  'Calculate 25 times 14',
  'Open Wi-Fi settings',
  'Volume up',
  'Tell me a joke',
  'Take a note: Meeting at 3',
  'Battery level',
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

  const [permission, requestPermission] = useCameraPermissions();
  const pillTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handsFreeRestartRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Request camera & contacts permissions on mount
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission().catch(() => {});
    }
    contactsService.loadContacts().catch(() => {});
  }, [permission]);

  const showActionPill = (text: string) => {
    if (pillTimeoutRef.current) clearTimeout(pillTimeoutRef.current);
    setActionPill(text);
    pillTimeoutRef.current = setTimeout(() => {
      setActionPill(null);
    }, 2200);
  };

  /**
   * Helper to start in-app speech recognition
   */
  const startListeningSession = async (continuous: boolean = false) => {
    try {
      const permissionRes = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permissionRes.granted) {
        showActionPill('Microphone Permission Denied');
        return;
      }

      await ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous,
      });
    } catch (e) {
      // Audio engine busy or restarting
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

  // Sync Android Foreground Service Persistent Notification with Hands-Free mode
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
        setTimeout(() => {
          startListeningSession(false);
        }, 1200);
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
    if (orbMode === 'idle') {
      // Keep quiet/idle until speech or wake word
    }
  });

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript;
    if (text) {
      setTranscript(text);

      const hasWakeWord = /\b(hey|ok|okay|hi|hello)?\s*ora\b/i.test(text);
      if (hasWakeWord && orbMode === 'idle') {
        setOrbMode('listening');
      }

      if (event.isFinal) {
        processUtterance(text);
      }
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (event.error !== 'no-speech') {
      console.warn('[Speech] recognition error:', event.error);
    }
    if (orbMode === 'listening') {
      setOrbMode('idle');
    }
  });

  useSpeechRecognitionEvent('end', () => {
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

    if (orbMode === 'listening' || orbMode === 'executing') {
      try {
        await ExpoSpeechRecognitionModule.stop();
      } catch (e) {}
      setOrbMode('idle');
      return;
    }

    setTranscript('');
    setOrbMode('listening');
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
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />

        {/* Hidden physical camera for hardware flashlight control in Expo Go */}
        {Platform.OS !== 'web' && permission?.granted && (
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

        {/* Quick Voice Command Sheet Modal */}
        <Modal
          visible={isDrawerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsDrawerOpen(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setIsDrawerOpen(false)}>
            <Animated.View entering={FadeInUp.duration(220)} style={styles.modalSheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>VOICE COMMANDS (OFFLINE)</Text>
              <Text style={styles.sheetSubtitle}>Select any preset or dictate naturally</Text>

              <View style={styles.quickCommandsGrid}>
                {QUICK_COMMANDS.map((cmd, i) => (
                  <Pressable
                    key={i}
                    style={({ pressed }) => [
                      styles.quickCommandItem,
                      pressed && styles.quickCommandItemPressed,
                    ]}
                    onPress={() => handleSelectQuickCommand(cmd)}
                  >
                    <Ionicons name="radio-button-on" size={14} color="#D97706" style={{ marginRight: 8 }} />
                    <Text style={styles.quickCommandText}>{cmd}</Text>
                  </Pressable>
                ))}
              </View>
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
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'center',
    marginBottom: 18,
  },
  sheetTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1.2,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    marginBottom: 18,
  },
  quickCommandsGrid: {
    gap: 10,
  },
  quickCommandItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  quickCommandItemPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  quickCommandText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F1F5F9',
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
});
