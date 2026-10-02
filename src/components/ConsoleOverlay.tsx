import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { OrbMode, IntentResolution } from '../types/intent';
import { ExecutionResult } from '../native/bridge';

interface ConsoleOverlayProps {
  mode: OrbMode;
  resolution: IntentResolution | null;
  executionResult: ExecutionResult | null;
  onSimulateCommand: (command: string) => void;
}

const SAMPLE_COMMANDS = [
  'Call Mom',
  'Turn on flashlight',
  'Text Sarah I will be late',
  'Reply WhatsApp on my way',
  'Mute phone',
  'Wake me up at 6:30 AM',
  'Open Spotify',
  'Battery level',
];

export function ConsoleOverlay({
  mode,
  resolution,
  executionResult,
  onSimulateCommand,
}: ConsoleOverlayProps) {
  const getBadgeStyle = () => {
    switch (mode) {
      case 'listening':
        return { text: 'LISTENING', bg: '#854D0E', border: '#FACC15', color: '#FEF08A' };
      case 'thinking':
        return { text: 'RESOLVING (NEEDLE 2)', bg: '#3B2F04', border: '#EAB308', color: '#FEF9C3' };
      case 'error':
        return { text: 'GRAMMAR REJECTED', bg: '#7F1D1D', border: '#EF4444', color: '#FEE2E2' };
      default:
        return { text: 'STANDBY (0.00 KB OFFLINE)', bg: '#1E293B', border: '#334155', color: '#94A3B8' };
    }
  };

  const badge = getBadgeStyle();

  return (
    <View style={styles.container}>
      {/* Status Header Badge */}
      <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
        <View style={[styles.statusDot, { backgroundColor: badge.border }]} />
        <Text style={[styles.badgeText, { color: badge.color }]}>{badge.text}</Text>
      </View>

      {/* Transcript Card */}
      <View style={styles.transcriptCard}>
        <Text style={styles.cardHeaderLabel}>ACTIVE SPEECH TRANSCRIPT</Text>
        <Text style={styles.transcriptText}>
          {resolution?.rawTranscript ? `"${resolution.rawTranscript}"` : 'Tap Orb to dictate or select a test command...'}
        </Text>

        {resolution && (
          <View style={styles.metaRow}>
            <View style={styles.metricBadge}>
              <Text style={styles.metricText}>⚡ {resolution.latencyMs}ms Intent Latency</Text>
            </View>
            <View style={styles.metricBadge}>
              <Text style={styles.metricText}>Confidence: {Math.round((resolution.confidence || 0) * 100)}%</Text>
            </View>
          </View>
        )}
      </View>

      {/* Resolved Intent Output Card */}
      {resolution?.intent && (
        <View style={styles.intentCard}>
          <Text style={styles.cardHeaderLabel}>RESOLVED OS ACTION</Text>
          <Text style={styles.actionTitle}>{resolution.intent.action.toUpperCase()}</Text>
          <Text style={styles.actionDetails}>{JSON.stringify(resolution.intent, null, 2)}</Text>
          {executionResult && (
            <View style={[styles.executionBox, executionResult.success ? styles.successBox : styles.failedBox]}>
              <Text style={styles.executionText}>{executionResult.message}</Text>
            </View>
          )}
        </View>
      )}

      {/* Error Card */}
      {resolution?.error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>GRAMMAR REJECTION</Text>
          <Text style={styles.errorDescription}>{resolution.error}</Text>
        </View>
      )}

      {/* Voice Trigger Presets for Testing */}
      <View style={styles.presetsSection}>
        <Text style={styles.presetsHeader}>QUICK TEST COMMANDS (OFFLINE)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetsScroll}>
          {SAMPLE_COMMANDS.map((cmd, i) => (
            <TouchableOpacity
              key={i}
              style={styles.presetButton}
              activeOpacity={0.7}
              onPress={() => onSimulateCommand(cmd)}
            >
              <Text style={styles.presetButtonText}>{cmd}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 9999,
    borderWidth: 1,
    marginBottom: 16,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  transcriptCard: {
    width: '100%',
    backgroundColor: '#0F131C',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 16,
    marginBottom: 12,
  },
  cardHeaderLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1,
    marginBottom: 6,
  },
  transcriptText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#F8FAFC',
    minHeight: 24,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  metricBadge: {
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  metricText: {
    fontSize: 11,
    color: '#34D399',
    fontWeight: '600',
  },
  intentCard: {
    width: '100%',
    backgroundColor: '#0C1A14',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#065F46',
    padding: 16,
    marginBottom: 12,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#34D399',
    letterSpacing: 0.5,
  },
  actionDetails: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#A7F3D0',
    marginTop: 6,
  },
  executionBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
  },
  successBox: {
    backgroundColor: 'rgba(5, 150, 105, 0.2)',
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
  },
  failedBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderLeftWidth: 3,
    borderLeftColor: '#EF4444',
  },
  executionText: {
    fontSize: 13,
    color: '#ECFDF5',
    fontWeight: '600',
  },
  errorCard: {
    width: '100%',
    backgroundColor: '#1E1012',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#991B1B',
    padding: 16,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F87171',
    letterSpacing: 0.5,
  },
  errorDescription: {
    fontSize: 13,
    color: '#FCA5A5',
    marginTop: 4,
  },
  presetsSection: {
    width: '100%',
    marginTop: 6,
  },
  presetsHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1,
    marginBottom: 8,
  },
  presetsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  presetButton: {
    backgroundColor: '#161B26',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2D3748',
  },
  presetButtonText: {
    fontSize: 12,
    color: '#E2E8F0',
    fontWeight: '600',
  },
});
