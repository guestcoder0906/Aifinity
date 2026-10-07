import { FileMap, FileMetadata } from '../types';

export class FileSystem {
  private files: FileMap = {};
  private metadata: FileMetadata = {};
  private readonly STORAGE_KEY_FILES = 'aimud_files';
  private readonly STORAGE_KEY_META = 'aimud_metadata';

  private savePending = false;
  private saveTimeout: any = null;

  constructor() {
    this.loadFromStorage();
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.flushStorage();
      });
    }
  }

  private loadFromStorage() {
    try {
      if (typeof localStorage === 'undefined') return;
      const stored = localStorage.getItem(this.STORAGE_KEY_FILES);
      if (stored) {
        this.files = JSON.parse(stored);
      }
      const storedMeta = localStorage.getItem(this.STORAGE_KEY_META);
      if (storedMeta) {
        this.metadata = JSON.parse(storedMeta);
      }
    } catch (e) {
      console.error('Failed to load files from storage:', e);
    }
  }

  public flushStorage() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    this.savePending = false;
    this.executeSaveToStorage();
  }

  private saveToStorage(immediate = false) {
    if (immediate) {
      this.flushStorage();
      return;
    }
    if (this.savePending) return;
    this.savePending = true;
    this.saveTimeout = setTimeout(() => {
      this.savePending = false;
      this.saveTimeout = null;
      this.executeSaveToStorage();
    }, 50);
  }

  private executeSaveToStorage() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(this.STORAGE_KEY_FILES, JSON.stringify(this.files));
      localStorage.setItem(this.STORAGE_KEY_META, JSON.stringify(this.metadata));
    } catch (e: any) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.warn('Storage quota exceeded. Evicting volatile cache entries...');
        this.pruneVolatileStorage();
      } else {
        console.error('Failed to save files:', e);
      }
    }
  }

  /**
   * If local storage fills up (due to multi-page maps or rich logs),
   * evicts transient snapshots while strictly protecting core world and player files.
   */
  private pruneVolatileStorage() {
    try {
      const protectedFiles = new Set(['WorldRules.txt', 'Guide.txt', 'WorldTime.txt', 'CurrentMap.json']);
      
      // Retain player files
      for (const key of Object.keys(this.files)) {
        if (key.endsWith('.txt') && key.includes('-')) {
          protectedFiles.add(key);
        }
      }

      // Evict old debug logs or temporary snapshots if any exist
      for (const key of Object.keys(this.files)) {
        if (!protectedFiles.has(key) && (key.startsWith('debug_') || key.startsWith('temp_'))) {
          delete this.files[key];
          delete this.metadata[key];
        }
      }

      localStorage.setItem(this.STORAGE_KEY_FILES, JSON.stringify(this.files));
      localStorage.setItem(this.STORAGE_KEY_META, JSON.stringify(this.metadata));
    } catch (e) {
      console.error('Critical: Storage quota could not be resolved.', e);
    }
  }

  write(filename: string, content: string | any, displayName: string | null = null) {
    const stringified = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    this.files[filename] = stringified;

    if (displayName) {
      this.metadata[filename] = { displayName };
    } else if (!this.metadata[filename]) {
      this.metadata[filename] = { displayName: this.generateDisplayName(filename) };
    }
    this.saveToStorage();
  }

  private generateDisplayName(filename: string): string {
    let name = filename.replace(/\.(txt|json)$/, '');
    name = name.replace(/_/g, ' ');
    name = name.replace(/\s+\d+$/, '');
    return name;
  }

  getDisplayName(filename: string): string {
    let base = filename.replace(/\.txt|\.json/g, '');
    base = base.replace(/target\(.*?\)(?:\[(.*?)\])?/g, (_, inner) => inner || '');
    base = base.replace(/hide\[(.*?)\]/g, '$1');
    return base.trim() || filename;
  }

  read(filename: string): string | null {
    return this.files[filename] || null;
  }

  exists(filename: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.files, filename);
  }

  delete(filename: string) {
    delete this.files[filename];
    delete this.metadata[filename];
    this.saveToStorage();
  }

  list(): string[] {
    return Object.keys(this.files).sort();
  }

  listFiles(): string[] {
    return this.list();
  }

  getAll(): FileMap {
    return { ...this.files };
  }

  exportState(): { files: FileMap; metadata: FileMetadata } {
    return { files: { ...this.files }, metadata: { ...this.metadata } };
  }

  importState(state: { files: FileMap; metadata: FileMetadata }) {
    if (!state) return;
    this.files = { ...(state.files || {}) };
    this.metadata = { ...(state.metadata || {}) };
    this.saveToStorage();
  }

  clear() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    this.savePending = false;
    this.files = {};
    this.metadata = {};
    localStorage.removeItem(this.STORAGE_KEY_FILES);
    localStorage.removeItem(this.STORAGE_KEY_META);
  }

  findFileByReference(ref: string): string | null {
    if (!ref) return null;
    if (this.exists(ref)) return ref;
    if (this.exists(ref + '.txt')) return ref + '.txt';

    const refLower = ref.toLowerCase().trim();
    const refSlug = refLower.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    // 1. Case-insensitive exact match on filename
    for (const filename of Object.keys(this.files)) {
      const fLower = filename.toLowerCase();
      if (fLower === refLower || fLower === `${refLower}.txt`) {
        return filename;
      }
    }

    // 2. Case-insensitive exact match on display name
    for (const [filename, meta] of Object.entries(this.metadata)) {
      if (meta.displayName && meta.displayName.toLowerCase() === refLower) {
        return filename;
      }
    }

    // 3. Slugified match on filename
    for (const filename of Object.keys(this.files)) {
      const fileSlug = filename.toLowerCase().replace(/\.txt$/, '').replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
      if (fileSlug === refSlug && refSlug.length > 2) {
        return filename;
      }
    }

    // 4. Safe partial match on display name
    for (const [filename, meta] of Object.entries(this.metadata)) {
      if (meta.displayName) {
        const displayLower = meta.displayName.toLowerCase();
        if (displayLower === refLower) return filename;
        if (refLower.length >= 4 && displayLower.includes(refLower)) {
          return filename;
        }
      }
    }

    // 5. Safe partial match on filename (both directions)
    for (const filename of Object.keys(this.files)) {
      const nameWithoutExt = filename.toLowerCase().replace(/\.(txt|json)$/, '');
      if (refLower.length >= 3 && nameWithoutExt.includes(refLower)) {
        return filename;
      }
      if (nameWithoutExt.length >= 3 && refLower.includes(nameWithoutExt)) {
        return filename;
      }
      // Check prefix stripped (e.g. character-John -> John)
      const cleanRef = refLower.replace(/^(character|npc|item|location)-/, '');
      const cleanName = nameWithoutExt.replace(/^(character|npc|item|location)-/, '');
      if (cleanRef.length >= 3 && (cleanName.includes(cleanRef) || cleanRef.includes(cleanName))) {
        return filename;
      }
    }

    // 6. Check file content for exact Full Name or Name match
    for (const [filename, content] of Object.entries(this.files)) {
      if (!content || typeof content !== 'string') continue;
      const contentLower = content.toLowerCase();
      if (contentLower.includes(`full name: ${refLower}`) || contentLower.includes(`name: ${refLower}`)) {
        return filename;
      }
    }

    return null;
  }
}
