import { SvelteMap } from 'svelte/reactivity';
import type { Friend } from '../types';
import type { ApiGroup, ApiGroupMember } from './api';

/**
 * Smart merge for friends list - preserves UI state and handles updates smoothly
 * Server is the source of truth - only keeps friends that exist in fresh data
 */
export function mergeFriends(existing: Friend[], fresh: Friend[]): Friend[] {
	const merged = new Map<string, Friend>();

	// Only process fresh data - server is source of truth
	fresh.forEach((freshFriend) => {
		const existingFriend = existing.find((f) => f.id === freshFriend.id);

		merged.set(freshFriend.id, {
			...freshFriend,
			// Preserve UI-specific state if it exists (e.g., isOnline, isConnected)
			isOnline: existingFriend?.isOnline ?? freshFriend.isOnline,
			isConnected: existingFriend?.isConnected ?? freshFriend.isConnected
		});
	});

	// Items in existing but not in fresh are removed (e.g., unfriended users)
	return Array.from(merged.values());
}

/**
 * Smart merge for groups list - preserves order and UI state
 * Server is the source of truth - only keeps groups that exist in fresh data
 */
export function mergeGroups(existing: ApiGroup[], fresh: ApiGroup[]): ApiGroup[] {
	const merged = new Map<string, ApiGroup>();

	// Only process fresh data - server is source of truth
	fresh.forEach((freshGroup) => {
		merged.set(freshGroup.id, {
			...freshGroup
			// Preserve any UI-only state if needed in the future
		});
	});

	// Items in existing but not in fresh are removed (e.g., groups you've left)
	return Array.from(merged.values());
}

/**
 * Smart merge for group members - merges Map structures
 * Server is the source of truth - only keeps group members that exist in fresh data
 */
export function mergeGroupMembers(
	existing: SvelteMap<string, ApiGroupMember[]>,
	fresh: SvelteMap<string, ApiGroupMember[]>
): SvelteMap<string, ApiGroupMember[]> {
	const merged = new SvelteMap<string, ApiGroupMember[]>();

	// Only copy fresh data - server is source of truth
	fresh.forEach((members, groupId) => {
		const existingMembers = existing.get(groupId) || [];

		// Preserve online/connected status for members if they exist
		const mergedMembers = members.map((freshMember) => {
			const existingMember = existingMembers.find((m) => m.discordId === freshMember.discordId);
			return {
				...freshMember,
				isOnline: existingMember?.isOnline ?? freshMember.isOnline,
				isConnected: existingMember?.isConnected ?? freshMember.isConnected
			};
		});

		merged.set(groupId, mergedMembers);
	});

	// Groups in existing but not in fresh are removed (e.g., groups you've left)
	return merged;
}

/**
 * Check if two friends arrays have meaningful differences
 * Used to avoid unnecessary re-renders
 */
export function friendsHaveChanged(existing: Friend[], fresh: Friend[]): boolean {
	if (existing.length !== fresh.length) return true;

	const existingIds = new Set(existing.map((f) => f.id));
	const freshIds = new Set(fresh.map((f) => f.id));

	// Check if IDs changed
	if (existingIds.size !== freshIds.size) return true;

	// Check if any ID is different
	for (const id of freshIds) {
		if (!existingIds.has(id)) return true;
	}

	// Check if any friend data changed (online status, name, etc.)
	for (const freshFriend of fresh) {
		const existingFriend = existing.find((f) => f.id === freshFriend.id);
		if (!existingFriend) return true;

		// Compare relevant fields that might change
		if (
			existingFriend.name !== freshFriend.name ||
			existingFriend.isOnline !== freshFriend.isOnline ||
			existingFriend.isConnected !== freshFriend.isConnected ||
			existingFriend.status !== freshFriend.status
		) {
			return true;
		}
	}

	return false;
}

/**
 * Check if two groups arrays have meaningful differences
 */
export function groupsHaveChanged(existing: ApiGroup[], fresh: ApiGroup[]): boolean {
	if (existing.length !== fresh.length) return true;

	const existingIds = new Set(existing.map((g) => g.id));
	const freshIds = new Set(fresh.map((g) => g.id));

	// Check if IDs changed
	if (existingIds.size !== freshIds.size) return true;

	// Check if any ID is different
	for (const id of freshIds) {
		if (!existingIds.has(id)) return true;
	}

	// Check if any group data changed
	for (const freshGroup of fresh) {
		const existingGroup = existing.find((g) => g.id === freshGroup.id);
		if (!existingGroup) return true;

		// Compare relevant fields
		if (
			existingGroup.name !== freshGroup.name ||
			existingGroup.memberCount !== freshGroup.memberCount ||
			existingGroup.avatar !== freshGroup.avatar
		) {
			return true;
		}
	}

	return false;
}
