import { Platform } from 'react-native';
import * as Contacts from 'expo-contacts';
import { requireNativeModule } from 'expo-modules-core';
import { fuzzyMatch } from '../engine/fuzzy';

let OraTelephony: any = null;
try {
  OraTelephony = requireNativeModule('OraTelephony');
} catch (e) {}

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

const FAMILY_SYNONYMS: Record<string, string[]> = {
  mummy: ['mom', 'mum', 'mummy', 'mama', 'mother'],
  mum: ['mom', 'mum', 'mummy', 'mama', 'mother'],
  mom: ['mom', 'mum', 'mummy', 'mama', 'mother'],
  mama: ['mom', 'mum', 'mummy', 'mama', 'mother'],
  mother: ['mom', 'mum', 'mummy', 'mama', 'mother'],
  dad: ['dad', 'daddy', 'papa', 'father', 'pops'],
  daddy: ['dad', 'daddy', 'papa', 'father', 'pops'],
  papa: ['dad', 'daddy', 'papa', 'father', 'pops'],
  father: ['dad', 'daddy', 'papa', 'father', 'pops'],
};

class ContactsService {
  private cache: CachedContact[] = [];
  private isLoaded: boolean = false;
  private permissionGranted: boolean = false;
  private pendingDisambiguation: DisambiguationContext | null = null;
  private changeListeners: Set<(count: number) => void> = new Set();

  public addChangeListener(listener: (count: number) => void): () => void {
    this.changeListeners.add(listener);
    listener(this.cache.length);
    return () => this.changeListeners.delete(listener);
  }

  private notifyChange() {
    for (const listener of this.changeListeners) {
      try {
        listener(this.cache.length);
      } catch (e) {}
    }
  }

  /**
   * Request permission and index contacts in memory for instant offline lookups (<5ms).
   */
  public async loadContacts(): Promise<boolean> {
    try {
      // 1. Try instant native ContentResolver query via OraTelephony
      if (Platform.OS === 'android' && OraTelephony?.getAllContacts) {
        try {
          const nativeList = await OraTelephony.getAllContacts();
          if (Array.isArray(nativeList) && nativeList.length > 0) {
            const loaded: CachedContact[] = [];
            const seen = new Set<string>();
            for (const item of nativeList) {
              const name = (item.name || '').trim();
              const phone = (item.phone || '').trim();
              const clean = phone.replace(/[^\d+]/g, '');
              const key = `${name.toLowerCase()}_${clean}`;
              if (name && clean && !seen.has(key)) {
                seen.add(key);
                loaded.push({
                  id: item.id || name,
                  name,
                  phone,
                  cleanPhone: clean,
                });
              }
            }
            if (loaded.length > 0) {
              this.cache = loaded;
              this.isLoaded = true;
              this.permissionGranted = true;
              this.notifyChange();
              return true;
            }
          }
        } catch (nativeErr) {
          console.warn('[ContactsService] Native contact loading fallback:', nativeErr);
        }
      }

      // 2. Fallback to expo-contacts
      const current = await Contacts.getPermissionsAsync();
      let granted = current.granted;
      if (!granted) {
        const req = await Contacts.requestPermissionsAsync();
        granted = req.granted;
      }
      this.permissionGranted = granted;

      if (!this.permissionGranted) {
        console.warn('[ContactsService] Contacts permission not granted.');
        return false;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.PhoneNumbers,
        ],
        pageSize: 10000,
      });

      if (data && data.length > 0) {
        const loaded: CachedContact[] = [];
        for (const item of data) {
          const name = (
            item.name ||
            `${item.firstName || ''} ${item.lastName || ''}`.trim() ||
            item.company ||
            ''
          ).trim();
          if (!name) continue;

          const phoneNumbers = item.phoneNumbers || [];
          if (phoneNumbers.length === 0) continue;

          // Pick primary or first available valid phone number
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
        this.notifyChange();
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
    if (!this.isLoaded || this.cache.length === 0) {
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

    // Check if query is a family alias (e.g. Mummy -> Mom / Mama / Mother)
    const searchTerms = FAMILY_SYNONYMS[cleanQuery] || [cleanQuery];

    for (const term of searchTerms) {
      // 1. Exact match
      for (const c of this.cache) {
        if (c.name.toLowerCase() === term) {
          addMatch(c);
        }
      }

      // 2. Starts with / Word boundary match (e.g. "Emmanuel" in "Emmanuel Asante")
      for (const c of this.cache) {
        const parts = c.name.toLowerCase().split(/[\s,.-]+/);
        if (parts.some((p) => p === term || p.startsWith(term))) {
          addMatch(c);
        }
      }

      // 3. Substring includes
      for (const c of this.cache) {
        if (c.name.toLowerCase().includes(term)) {
          addMatch(c);
        }
      }
    }

    // 4. Fuzzy distance fallback (Levenshtein distance <= 2 on full names & first/last name tokens)
    if (matches.length === 0) {
      for (const term of searchTerms) {
        // A. Match against full names
        const allNames = this.cache.map((c) => c.name);
        const fuzzyFull = fuzzyMatch(term, allNames, 2);
        if (fuzzyFull) {
          const found = this.cache.find((c) => c.name === fuzzyFull.match);
          if (found) addMatch(found);
        }

        // B. Match against individual name tokens (e.g. "Emmanuel" in "Emmanuel Asante")
        if (matches.length === 0) {
          for (const c of this.cache) {
            const tokens = c.name.toLowerCase().split(/[\s,.-]+/);
            for (const token of tokens) {
              if (token.length >= 3) {
                const fz = fuzzyMatch(term, [token], 2);
                if (fz) {
                  addMatch(c);
                  break;
                }
              }
            }
          }
        }
      }
    }

    // 5. Native ContentResolver fallback via OraTelephony if cache yielded no matches
    if (matches.length === 0 && Platform.OS === 'android' && OraTelephony?.lookupContactNumber) {
      try {
        for (const term of searchTerms) {
          const directPhone = await OraTelephony.lookupContactNumber(term);
          if (directPhone) {
            const clean = directPhone.replace(/[^\d+]/g, '');
            if (clean) {
              addMatch({
                id: term,
                name: query,
                phone: directPhone,
                cleanPhone: clean,
              });
              break;
            }
          }
        }
      } catch (e) {
        console.warn('[ContactsService] Native lookup fallback error:', e);
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

  public getContactCount(): number {
    return this.cache.length;
  }

  public isCacheLoaded(): boolean {
    return this.isLoaded;
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

  private disambiguationListeners: Set<(ctx: DisambiguationContext | null) => void> = new Set();

  public addDisambiguationListener(listener: (ctx: DisambiguationContext | null) => void): () => void {
    this.disambiguationListeners.add(listener);
    listener(this.getPendingDisambiguation());
    return () => this.disambiguationListeners.delete(listener);
  }

  private notifyDisambiguation(): void {
    const current = this.getPendingDisambiguation();
    for (const listener of this.disambiguationListeners) {
      try {
        listener(current);
      } catch (e) {}
    }
  }

  public setPendingDisambiguation(ctx: DisambiguationContext | null): void {
    this.pendingDisambiguation = ctx;
    this.notifyDisambiguation();
  }

  public getPendingDisambiguation(): DisambiguationContext | null {
    if (!this.pendingDisambiguation) return null;
    // Expire after 35 seconds of inactivity
    if (Date.now() - this.pendingDisambiguation.timestamp > 35000) {
      this.pendingDisambiguation = null;
      this.notifyDisambiguation();
      return null;
    }
    return this.pendingDisambiguation;
  }

  public clearPendingDisambiguation(): void {
    this.pendingDisambiguation = null;
    this.notifyDisambiguation();
  }
}

export const contactsService = new ContactsService();
