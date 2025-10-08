/**
 * Storage abstraction layer that works in both Tauri and browser environments
 * - Uses Tauri store when available (in production Tauri app)
 * - Falls back to localStorage when in browser (for development with `npm run dev`)
 */

import { load as loadTauriStore } from '@tauri-apps/plugin-store';

// Check if we're running in Tauri environment
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

// Storage interface for type safety
interface StorageAdapter {
	get<T>(key: string): Promise<T | null>;
	set(key: string, value: unknown): Promise<void>;
	delete(key: string): Promise<void>;
	has(key: string): Promise<boolean>;
}

// Tauri store adapter
class TauriStorageAdapter implements StorageAdapter {
	private storePath: string;
	private autoSave: number;

	constructor(storePath: string, autoSave: number = 300) {
		this.storePath = storePath;
		this.autoSave = autoSave;
	}

	async get<T>(key: string): Promise<T | null> {
		const store = await loadTauriStore(this.storePath, { defaults: {}, autoSave: this.autoSave });
		const value = await store.get<T>(key);
		return value ?? null;
	}

	async set(key: string, value: unknown): Promise<void> {
		const store = await loadTauriStore(this.storePath, { defaults: {}, autoSave: this.autoSave });
		await store.set(key, value);
		// Force immediate save for important data
		await store.save();
	}

	async delete(key: string): Promise<void> {
		const store = await loadTauriStore(this.storePath, { defaults: {}, autoSave: this.autoSave });
		await store.delete(key);
		await store.save();
	}

	async has(key: string): Promise<boolean> {
		const store = await loadTauriStore(this.storePath, { defaults: {}, autoSave: this.autoSave });
		return await store.has(key);
	}
}

// Browser localStorage adapter
class LocalStorageAdapter implements StorageAdapter {
	private prefix: string;

	constructor(storePath: string) {
		// Use store path as prefix to namespace localStorage keys
		this.prefix = `tauri_store_${storePath.replace('.json', '')}_`;
	}

	async get<T>(key: string): Promise<T | null> {
		if (typeof window === 'undefined') return null;

		const value = localStorage.getItem(this.prefix + key);
		if (value === null) return null;

		try {
			return JSON.parse(value) as T;
		} catch {
			return value as T;
		}
	}

	async set(key: string, value: unknown): Promise<void> {
		if (typeof window === 'undefined') return;

		const serialized = JSON.stringify(value);
		localStorage.setItem(this.prefix + key, serialized);
	}

	async delete(key: string): Promise<void> {
		if (typeof window === 'undefined') return;

		localStorage.removeItem(this.prefix + key);
	}

	async has(key: string): Promise<boolean> {
		if (typeof window === 'undefined') return false;

		return localStorage.getItem(this.prefix + key) !== null;
	}
}

// Factory function to create the appropriate storage adapter
export function createStorage(storePath: string, autoSave: number = 300): StorageAdapter {
	if (isTauri) {
		return new TauriStorageAdapter(storePath, autoSave);
	} else {
		return new LocalStorageAdapter(storePath);
	}
}

// Convenience function for quick access
export async function getStorageValue<T>(storePath: string, key: string): Promise<T | null> {
	const storage = createStorage(storePath);
	return await storage.get<T>(key);
}

export async function setStorageValue(
	storePath: string,
	key: string,
	value: unknown
): Promise<void> {
	const storage = createStorage(storePath);
	await storage.set(key, value);
}

export async function deleteStorageValue(storePath: string, key: string): Promise<void> {
	const storage = createStorage(storePath);
	await storage.delete(key);
}
