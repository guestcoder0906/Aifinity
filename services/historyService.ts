import { TurnSnapshot } from '../types';

export class HistoryService {
  private static readonly STORAGE_KEY = 'aimud_turn_history';
  private static readonly MAX_SNAPSHOTS = 10;
  private static readonly MAX_PERSISTED_SNAPSHOTS = 4;
  private static history: TurnSnapshot[] = [];
  private static isLoaded = false;
  private static saveTimeoutId: any = null;

  private static loadHistory() {
    if (this.isLoaded) return;
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.history = parsed.slice(-this.MAX_SNAPSHOTS);
        }
      }
    } catch (e) {
      console.error('Failed to load turn history from storage:', e);
      this.history = [];
    } finally {
      this.isLoaded = true;
    }
  }

  private static saveHistory(immediate = false) {
    if (this.saveTimeoutId) {
      clearTimeout(this.saveTimeoutId);
      this.saveTimeoutId = null;
    }

    const doSave = () => {
      try {
        if (typeof localStorage === 'undefined') return;
        // Keep up to MAX_PERSISTED_SNAPSHOTS in localStorage to keep synchronous JSON serialize small (<100KB)
        const toPersist = this.history.slice(-this.MAX_PERSISTED_SNAPSHOTS);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(toPersist));
      } catch (e: any) {
        console.warn('Storage warning while saving history stack:', e);
        try {
          const minimal = this.history.slice(-2);
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(minimal));
        } catch {}
      }
    };

    if (immediate) {
      doSave();
    } else {
      // Async deferred write to prevent freezing UI after an action
      this.saveTimeoutId = setTimeout(doSave, 250);
    }
  }

  /**
   * Pushes a new turn snapshot to the history stack.
   */
  static pushSnapshot(snapshot: TurnSnapshot) {
    this.loadHistory();
    this.history.push(snapshot);
    while (this.history.length > this.MAX_SNAPSHOTS) {
      this.history.shift();
    }
    this.saveHistory(false);
  }

  /**
   * Returns true if there is at least one previous turn snapshot to revert to.
   */
  static canUndo(): boolean {
    this.loadHistory();
    return this.history.length > 0;
  }

  /**
   * Returns the count of available turn snapshots in history.
   */
  static getCount(): number {
    this.loadHistory();
    return this.history.length;
  }

  /**
   * Inspects the latest turn snapshot without removing it.
   */
  static peekSnapshot(): TurnSnapshot | null {
    this.loadHistory();
    if (this.history.length === 0) return null;
    return this.history[this.history.length - 1];
  }

  /**
   * Pops and returns the latest turn snapshot from the history stack.
   */
  static popSnapshot(): TurnSnapshot | null {
    this.loadHistory();
    if (this.history.length === 0) return null;
    const popped = this.history.pop() || null;
    this.saveHistory(true);
    return popped;
  }

  /**
   * Returns all stored snapshots (read-only copy).
   */
  static getSnapshots(): TurnSnapshot[] {
    this.loadHistory();
    return [...this.history];
  }

  /**
   * Clears the entire history stack.
   */
  static clearHistory() {
    this.history = [];
    this.isLoaded = true;
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch {}
  }

  /**
   * Finds the turn snapshot closest to a specific target time string, turn count, or description.
   */
  static findClosestSnapshot(query: { targetTime?: string; turnsBack?: number }): TurnSnapshot | null {
    this.loadHistory();
    if (this.history.length === 0) return null;

    if (query.turnsBack && query.turnsBack > 0) {
      const idx = Math.max(0, this.history.length - query.turnsBack);
      return this.history[idx] || null;
    }

    if (query.targetTime) {
      const cleanTarget = query.targetTime.toLowerCase().trim();

      // Try matching exact or partial worldTime string
      for (let i = this.history.length - 1; i >= 0; i--) {
        const snap = this.history[i];
        if (snap.worldTime && snap.worldTime.toLowerCase().includes(cleanTarget)) {
          return snap;
        }
      }

      // Try date parsing
      try {
        const targetDate = new Date(query.targetTime);
        if (!isNaN(targetDate.getTime())) {
          let closestSnap: TurnSnapshot | null = null;
          let minDiff = Infinity;

          for (const snap of this.history) {
            if (snap.worldTime) {
              const snapDate = new Date(snap.worldTime);
              if (!isNaN(snapDate.getTime())) {
                const diff = Math.abs(snapDate.getTime() - targetDate.getTime());
                if (diff < minDiff) {
                  minDiff = diff;
                  closestSnap = snap;
                }
              }
            }
          }

          if (closestSnap) return closestSnap;
        }
      } catch {}
    }

    // Default to the previous turn snapshot if query cannot find a closer match
    return this.peekSnapshot();
  }

  /**
   * Merges a reverted snapshot's file system state with excluded files from the current state.
   * Based on story context, the time traveler or specific items (e.g. memories, equipped time device)
   * can be preserved so they do NOT revert along with the rest of the world.
   */
  static applyStateWithExclusions(
    targetState: { files: Record<string, string>; metadata: Record<string, { displayName: string }> },
    currentState: { files: Record<string, string>; metadata: Record<string, { displayName: string }> },
    preserveFiles: string[] = []
  ): { files: Record<string, string>; metadata: Record<string, { displayName: string }> } {
    const mergedFiles = { ...targetState.files };
    const mergedMeta = { ...targetState.metadata };

    if (!preserveFiles || preserveFiles.length === 0) {
      return { files: mergedFiles, metadata: mergedMeta };
    }

    const currentFileKeys = Object.keys(currentState.files);

    for (const preserveTarget of preserveFiles) {
      const lowerTarget = preserveTarget.toLowerCase().trim();

      for (const key of currentFileKeys) {
        const lowerKey = key.toLowerCase();
        const baseName = lowerKey.replace(/\.(txt|json)$/, '');

        // Check if key matches preserve target directly, by slug, or by character name
        if (
          lowerKey === lowerTarget ||
          lowerKey === `${lowerTarget}.txt` ||
          baseName === lowerTarget ||
          baseName.includes(lowerTarget) ||
          lowerTarget.includes(baseName)
        ) {
          // Preserve this file from the current state (time traveler keeps their state!)
          mergedFiles[key] = currentState.files[key];
          if (currentState.metadata[key]) {
            mergedMeta[key] = currentState.metadata[key];
          }
        }
      }
    }

    return { files: mergedFiles, metadata: mergedMeta };
  }
}
