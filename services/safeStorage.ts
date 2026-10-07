/**
 * Bulletproof Safe Storage Wrapper for Safari & Restricted Environments
 * Prevents DOMException / SecurityError: The operation is insecure when:
 * - Safari is in Private Browsing mode
 * - Third-party storage is restricted / partitioned in iframes
 * - Storage quota is exceeded (QuotaExceededError)
 * - LocalStorage is disabled or unavailable
 */

class SafeStorageEngine {
  private mem: Record<string, string> = {};
  private works: boolean | null = null;

  private isStorageAvailable(): boolean {
    if (this.works !== null) return this.works;
    if (typeof window === 'undefined') {
      this.works = false;
      return false;
    }
    try {
      const testKey = '__safari_safe_storage_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      this.works = true;
      return true;
    } catch {
      this.works = false;
      return false;
    }
  }

  getItem(key: string): string | null {
    if (this.isStorageAvailable()) {
      try {
        const val = window.localStorage.getItem(key);
        if (val !== null) return val;
      } catch {
        // Fall back to memory
      }
    }
    return Object.prototype.hasOwnProperty.call(this.mem, key) ? this.mem[key] : null;
  }

  setItem(key: string, value: any): void {
    const stringVal = typeof value === 'string' ? value : String(value);
    this.mem[key] = stringVal;

    if (this.isStorageAvailable()) {
      try {
        window.localStorage.setItem(key, stringVal);
      } catch {
        // In Safari private mode or if quota reached, stays safely in memory
      }
    }
  }

  removeItem(key: string): void {
    delete this.mem[key];
    if (this.isStorageAvailable()) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Ignore
      }
    }
  }

  clear(): void {
    this.mem = {};
    if (this.isStorageAvailable()) {
      try {
        window.localStorage.clear();
      } catch {
        // Ignore
      }
    }
  }

  key(index: number): string | null {
    if (this.isStorageAvailable()) {
      try {
        return window.localStorage.key(index);
      } catch {
        // Fall back to memory
      }
    }
    const keys = Object.keys(this.mem);
    return keys[index] || null;
  }

  get length(): number {
    if (this.isStorageAvailable()) {
      try {
        return window.localStorage.length;
      } catch {
        // Fall back to memory
      }
    }
    return Object.keys(this.mem).length;
  }
}

export const safeStorage = new SafeStorageEngine();

class SafeSessionStorageEngine {
  private mem: Record<string, string> = {};
  private works: boolean | null = null;

  private isStorageAvailable(): boolean {
    if (this.works !== null) return this.works;
    if (typeof window === 'undefined') {
      this.works = false;
      return false;
    }
    try {
      const testKey = '__safari_safe_session_test__';
      window.sessionStorage.setItem(testKey, '1');
      window.sessionStorage.removeItem(testKey);
      this.works = true;
      return true;
    } catch {
      this.works = false;
      return false;
    }
  }

  getItem(key: string): string | null {
    if (this.isStorageAvailable()) {
      try {
        const val = window.sessionStorage.getItem(key);
        if (val !== null) return val;
      } catch {}
    }
    return Object.prototype.hasOwnProperty.call(this.mem, key) ? this.mem[key] : null;
  }

  setItem(key: string, value: any): void {
    const stringVal = typeof value === 'string' ? value : String(value);
    this.mem[key] = stringVal;

    if (this.isStorageAvailable()) {
      try {
        window.sessionStorage.setItem(key, stringVal);
      } catch {}
    }
  }

  removeItem(key: string): void {
    delete this.mem[key];
    if (this.isStorageAvailable()) {
      try {
        window.sessionStorage.removeItem(key);
      } catch {}
    }
  }

  clear(): void {
    this.mem = {};
    if (this.isStorageAvailable()) {
      try {
        window.sessionStorage.clear();
      } catch {}
    }
  }
}

export const safeSessionStorage = new SafeSessionStorageEngine();
export default safeStorage;
