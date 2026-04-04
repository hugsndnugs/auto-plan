import type { StateStorage } from "zustand/middleware";

export const STORAGE_QUOTA_EVENT = "auto-plan-storage-quota";

/**
 * localStorage wrapper that avoids throwing on quota errors (so the UI keeps running).
 * Dispatches {@link STORAGE_QUOTA_EVENT} when a quota error is detected.
 */
export function createSafeLocalStorage(): StateStorage {
  return {
    getItem: (name) => localStorage.getItem(name),
    setItem: (name, value) => {
      try {
        localStorage.setItem(name, value);
      } catch (e) {
        const isQuota =
          e instanceof DOMException && e.name === "QuotaExceededError";
        if (isQuota && typeof globalThis.dispatchEvent === "function") {
          globalThis.dispatchEvent(new CustomEvent(STORAGE_QUOTA_EVENT));
        }
        console.warn("[auto-plan] Could not save to localStorage", e);
      }
    },
    removeItem: (name) => localStorage.removeItem(name),
  };
}
