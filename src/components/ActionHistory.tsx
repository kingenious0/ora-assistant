import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { ActionAuditLog } from '../types/intent';
import { dbService } from '../services/database';

export function ActionHistory() {
  const [logs, setLogs] = useState<ActionAuditLog[]>([]);

  const loadLogs = () => {
    const records = dbService.getRecentLogs(15);
    setLogs(records);
  };

  useEffect(() => {
    loadLogs();
    const interval = setInterval(loadLogs, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleClear = () => {
    dbService.clearLogs();
    setLogs([]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>LOCAL AUDIT LEDGER (OFFLINE SQLITE)</Text>
        {logs.length > 0 && (
          <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {logs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No actions executed yet. Dictate a command or tap a preset above.</Text>
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(_, index) => index.toString()}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={styles.logCard}>
              <View style={styles.logRow}>
                <Text style={styles.logAction}>{item.action.toUpperCase()}</Text>
                <Text style={styles.logTime}>{item.timestamp}</Text>
              </View>
              <Text style={styles.logTranscript}>"{item.transcript}"</Text>
              <View style={styles.logMeta}>
                <Text style={styles.latencyTag}>⚡ {item.latencyMs}ms</Text>
                <Text
                  style={[
                    styles.statusTag,
                    item.status === 'success' || item.status === 'simulated'
                      ? styles.statusSuccess
                      : styles.statusFailed,
                  ]}
                >
                  {item.status.toUpperCase()}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1,
  },
  clearBtn: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#1E293B',
  },
  clearBtnText: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '700',
  },
  emptyContainer: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#0F131C',
    borderWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  logCard: {
    backgroundColor: '#0F131C',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 12,
    marginBottom: 8,
  },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  logAction: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FBBF24',
  },
  logTime: {
    fontSize: 11,
    color: '#64748B',
  },
  logTranscript: {
    fontSize: 13,
    color: '#E2E8F0',
    marginBottom: 8,
  },
  logMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  latencyTag: {
    fontSize: 10,
    color: '#34D399',
    fontWeight: '700',
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusTag: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusSuccess: {
    color: '#6EE7B7',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  statusFailed: {
    color: '#FCA5A5',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
});
