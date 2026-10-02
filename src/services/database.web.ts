import { ActionAuditLog } from '../types/intent';

const STORAGE_KEY = 'ora_audit_logs';

class WebDatabaseService {
  private memoryFallback: ActionAuditLog[] = [];

  constructor() {
    this.init();
  }

  private init() {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          this.memoryFallback = JSON.parse(stored);
        }
      } catch (e) {
        console.warn('Failed to load logs from localStorage:', e);
      }
    }
  }

  private save() {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.memoryFallback));
      } catch (e) {
        console.warn('Failed to save logs to localStorage:', e);
      }
    }
  }

  public recordAction(log: ActionAuditLog): void {
    this.memoryFallback.unshift(log);
    if (this.memoryFallback.length > 50) {
      this.memoryFallback.pop();
    }
    this.save();
  }

  public getRecentLogs(limit: number = 20): ActionAuditLog[] {
    return this.memoryFallback.slice(0, limit);
  }

  public clearLogs(): void {
    this.memoryFallback = [];
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        console.warn('Failed to clear logs from localStorage:', e);
      }
    }
  }
}

export const dbService = new WebDatabaseService();
