import * as Contacts from 'expo-contacts';
import { fuzzyMatch } from '../engine/fuzzy';

export interface CachedContact {
  id: string;
  name: string;
  phone: string;
  cleanPhone: string;
}

export interface DisambiguationContext {
  action: 'call' | 'sms';
  query: string;
  simSlot?: number;
  message?: string;
  candidates: CachedContact[];
  timestamp: number;
}

class ContactsService {
  private cache: CachedContact[] = [];
  private isLoaded: boolean = false;
  private permissionGranted: boolean = false;
  private pendingDisambiguation: DisambiguationContext | null = null;

  /**
   * Request permission and index contacts in memory for instant offline lookups (<5ms).
   */
  public async loadContacts(): Promise<boolean> {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      this.permissionGranted = status === 'granted';

      if (!this.permissionGranted) {
        console.warn('[ContactsService] Contacts permission not granted.');
        return false;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
      });

      if (data && data.length > 0) {
        const loaded: CachedContact[] = [];
        for (const item of data) {
          const name = item.name || `${item.firstName || ''} ${item.lastName || ''}`.trim();
          if (!name) continue;

          const phoneNumbers = item.phoneNumbers || [];
          if (phoneNumbers.length === 0) continue;

          // Pick primary or first available number
          const primary = phoneNumbers.find((p) => p.isPrimary) || phoneNumbers[0];
          const rawNumber = primary?.number || '';
          const clean = rawNumber.replace(/[^\d+]/g, '');

          if (clean) {
            loaded.push({
              id: item.id || name,
              name,
              phone: rawNumber,
              cleanPhone: clean,
            });
          }
        }

        this.cache = loaded;
        this.isLoaded = true;
      }
      return true;
    } catch (err) {
      console.warn('[ContactsService] Failed to load contacts:', err);
      return false;
    }
  }

  /**
   * Look up all contacts matching a spoken name.
   * Enables disambiguation when the user has multiple contacts with the same or similar name.
   */
  public async resolveAllContacts(query: string): Promise<CachedContact[]> {
    if (!this.isLoaded) {
      await this.loadContacts();
    }

    const cleanQuery = query.toLowerCase().trim();
    if (!cleanQuery) return [];

    const matches: CachedContact[] = [];
    const seenIds = new Set<string>();

    const addMatch = (c: CachedContact) => {
      if (!seenIds.has(c.id)) {
        seenIds.add(c.id);
        matches.push(c);
      }
    };

    // 1. Direct equality (e.g. "Emmanuel" === "emmanuel")
    for (const c of this.cache) {
      if (c.name.toLowerCase() === cleanQuery) {
        addMatch(c);
      }
    }

    // 2. Starts with / Substring / Word boundary (e.g. "Emmanuel" in "Emmanuel Work", "Emmanuel Asante")
    for (const c of this.cache) {
      const parts = c.name.toLowerCase().split(/\s+/);
      if (parts.some((p) => p === cleanQuery || p.startsWith(cleanQuery))) {
        addMatch(c);
      }
    }

    // 3. Contains match
    for (const c of this.cache) {
      if (c.name.toLowerCase().includes(cleanQuery)) {
        addMatch(c);
      }
    }

    // 4. Fuzzy distance match (Levenshtein distance <= 2)
    if (matches.length === 0) {
      const allNames = this.cache.map((c) => c.name);
      const fuzzy = fuzzyMatch(query, allNames, 2);
      if (fuzzy) {
        const found = this.cache.find((c) => c.name === fuzzy.match);
        if (found) addMatch(found);
      }
    }

    return matches;
  }

  /**
   * Look up single primary contact by spoken name.
   */
  public async resolveContact(query: string): Promise<CachedContact | null> {
    const all = await this.resolveAllContacts(query);
    return all.length > 0 ? all[0] : null;
  }

  /**
   * Returns list of contact names to train or feed into the NLU grammar.
   */
  public getContactNames(): string[] {
    return this.cache.map((c) => c.name);
  }

  public hasPermission(): boolean {
    return this.permissionGranted;
  }

  public setPendingDisambiguation(ctx: DisambiguationContext | null): void {
    this.pendingDisambiguation = ctx;
  }

  public getPendingDisambiguation(): DisambiguationContext | null {
    if (!this.pendingDisambiguation) return null;
    // Expire after 35 seconds of inactivity
    if (Date.now() - this.pendingDisambiguation.timestamp > 35000) {
      this.pendingDisambiguation = null;
      return null;
    }
    return this.pendingDisambiguation;
  }

  public clearPendingDisambiguation(): void {
    this.pendingDisambiguation = null;
  }
}

export const contactsService = new ContactsService();
