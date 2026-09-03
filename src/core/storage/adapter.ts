export interface StorageAdapter {
  get(key: string): string | null;
  /** true on success, false if the underlying write failed (e.g. localStorage quota exceeded). */
  set(key: string, value: string): boolean;
  /** true on success, false if the underlying delete failed. */
  remove(key: string): boolean;
}
