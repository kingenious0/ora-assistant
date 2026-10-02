import * as SQLite from 'expo-sqlite';
import { ActionAuditLog } from '../types/intent';

class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;
  private memoryFallback: ActionAuditLog[] = [];

  constructor() {
    this.init();
  }

  private init() {
    try {
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
  }

  public getRecentLogs(limit: number = 20): ActionAuditLog[] {
    if (this.db) {
      try {
        const rows = this.db.getAllSync<ActionAuditLog>(
          `SELECT * FROM audit_log ORDER BY id DESC LIMIT ?;`,
          [limit]
        );
        return rows;
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
  }
}

export const dbService = new DatabaseService();
