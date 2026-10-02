import { Platform } from 'react-native';
import { ActionAuditLog } from '../types/intent';

class DatabaseService {
  private db: any = null;
  private memoryFallback: ActionAuditLog[] = [];

  constructor() {
    this.init();
  }

  private init() {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          const stored = window.localStorage.getItem('ora_audit_logs');
          if (stored) {
            this.memoryFallback = JSON.parse(stored);
          }
        } catch (e) {
          // Ignore
        }
      }
      return;
    }

    try {
      // Dynamic require ensures expo-sqlite web worker is not evaluated on web
      const SQLite = require('expo-sqlite');
      this.db = SQLite.openDatabaseSync('ora_audit.db');
      this.db.execSync(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          transcript TEXT NOT NULL,
          action TEXT NOT NULL,
          payload TEXT NOT NULL,
          latencyMs INTEGER NOT NULL,
          status TEXT NOT NULL
        );
      `);
    } catch (e) {
      console.warn('SQLite init fallback to in-memory store:', e);
      this.db = null;
    }
  }

  public recordAction(log: ActionAuditLog): void {
    if (this.db) {
      try {
        this.db.runSync(
          `INSERT INTO audit_log (timestamp, transcript, action, payload, latencyMs, status)
           VALUES (?, ?, ?, ?, ?, ?);`,
          [log.timestamp, log.transcript, log.action, log.payload, log.latencyMs, log.status]
        );
        return;
      } catch (e) {
        console.error('Failed to write audit log to SQLite:', e);
      }
    }

    this.memoryFallback.unshift(log);
    if (this.memoryFallback.length > 50) {
      this.memoryFallback.pop();
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem('ora_audit_logs', JSON.stringify(this.memoryFallback));
      } catch (e) {
        // Ignore
      }
    }
  }

  public getRecentLogs(limit: number = 20): ActionAuditLog[] {
    if (this.db) {
      try {
        const rows = this.db.getAllSync(
          `SELECT * FROM audit_log ORDER BY id DESC LIMIT ?;`,
          [limit]
        );
        return rows as ActionAuditLog[];
      } catch (e) {
        console.error('Failed to read audit logs from SQLite:', e);
      }
    }
    return this.memoryFallback.slice(0, limit);
  }

  public clearLogs(): void {
    if (this.db) {
      try {
        this.db.execSync('DELETE FROM audit_log;');
      } catch (e) {
        console.error('Failed to clear SQLite audit logs:', e);
      }
    }
    this.memoryFallback = [];
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem('ora_audit_logs');
      } catch (e) {
        // Ignore
      }
    }
  }
}

export const dbService = new DatabaseService();
