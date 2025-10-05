import type { Friend, Group, GroupMember } from '../types';

/**
 * Smart merge for friends list - preserves UI state and handles updates smoothly
 */
export function mergeFriends(existing: Friend[], fresh: Friend[]): Friend[] {
	const merged = new Map<string, Friend>();

	// Keep existing items (they may have UI state we want to preserve)
	existing.forEach((friend) => {
		merged.set(friend.id, friend);
	});

	// Update with fresh data
	fresh.forEach((freshFriend) => {
		const existingFriend = merged.get(freshFriend.id);

		merged.set(freshFriend.id, {
			...freshFriend,
			// If there's any UI-specific state in existing, preserve it here
			// Currently Friend type doesn't have UI-only state, but this pattern allows for it
		});
	});

	return Array.from(merged.values());
}

/**
 * Smart merge for groups list - preserves order and UI state
 */
export function mergeGroups(existing: Group[], fresh: Group[]): Group[] {
	const merged = new Map<string, Group>();

	// Keep existing items
	existing.forEach((group) => {
		merged.set(group.id, group);
	});

	// Update with fresh data
	fresh.forEach((freshGroup) => {
		const existingGroup = merged.get(freshGroup.id);

		merged.set(freshGroup.id, {
			...freshGroup,
			// Preserve any UI-only state if needed in the future
		});
	});

	return Array.from(merged.values());
}

/**
 * Smart merge for group members - merges Map structures
 */
export function mergeGroupMembers(
	existing: Map<string, GroupMember[]>,
	fresh: Map<string, GroupMember[]>
): Map<string, GroupMember[]> {
	const merged = new Map<string, GroupMember[]>(existing);

	// Update with fresh data
	fresh.forEach((members, groupId) => {
		merged.set(groupId, members);
	});

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
export function groupsHaveChanged(existing: Group[], fresh: Group[]): boolean {
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
