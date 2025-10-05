import { getContext, setContext } from 'svelte';
import type { Friend as FriendType, Group, GroupMember, GroupInvitation } from '../types';
import type { ApiFriend } from './api';

/**
 * Shared application context for authentication, WebSocket connection, friends, and groups data.
 * Uses Svelte 5 context API to share state between layout and pages.
 */
export class AppContext {
	// Authentication state
	isSignedIn = $state(false);
	discordUser = $state<{ id: string; username: string; avatar: string | null } | null>(null);
	discordUserId = $state<string | null>(null);

	// WebSocket state
	ws = $state<any>(null);
	connectionStatus = $state<'connected' | 'disconnected' | 'connecting'>('disconnected');
	connectionError = $state<string | null>(null);
	copiedStatusVisible = $state(false);

	// Friends and API data
	friendsList = $state<FriendType[]>([]);
	apiFriends = $state<ApiFriend[]>([]);
	apiFriendRequests = $state<any[]>([]);
	apiUserProfile = $state<{ friendCode: string | null } | null>(null);

	// Groups data
	groups = $state<Group[]>([]);
	groupInvitations = $state<GroupInvitation[]>([]);
	groupMembers = $state<Map<string, GroupMember[]>>(new Map()); // groupId -> members[]
	selectedGroupId = $state<string | null>(null);

	// Selected user for feed filtering
	selectedUserId = $state<string | null>(null);

	// Loading states for data fetching
	isLoadingFriends = $state(true);
	isLoadingGroups = $state(true);
	isSyncingFriends = $state(false);
	isSyncingGroups = $state(false);

	// Auth state
	authSessionId = $state<string | null>(null);
	authError = $state<string | null>(null);
	jwtToken = $state<string | null>(null);
	isAuthenticating = $state(false);

	// Reconnection state
	reconnectAttempts = $state(0);
	autoConnectionAttempted = $state(false);
	reconnectTimer = $state<ReturnType<typeof setTimeout> | null>(null);

	// Page-specific actions (set by pages, used by header)
	pageActions = $state<{
		selectFile?: () => void;
		clearLogs?: () => void;
		logLocation?: string | null;
	}>({});

	// Notifications
	notifications = $state<Array<{ id: string; message: string; type: 'info' | 'success' | 'error' }>>([]);

	// Processing states for friend requests and group invitations
	processingFriendRequests = $state<Set<string>>(new Set());
	processingGroupInvitations = $state<Set<string>>(new Set());

	/**
	 * Add a notification toast that auto-dismisses after 5 seconds
	 */
	addNotification(message: string, type: 'info' | 'success' | 'error' = 'info') {
		const id = crypto.randomUUID();
		this.notifications = [...this.notifications, { id, message, type }];

		// Auto-dismiss after 5 seconds
		setTimeout(() => {
			this.removeNotification(id);
		}, 5000);

		return id;
	}

	/**
	 * Remove a notification by ID
	 */
	removeNotification(id: string) {
		this.notifications = this.notifications.filter(n => n.id !== id);
	}
}

const APP_CONTEXT_KEY = Symbol('app-context');

/**
 * Set the app context (call this in the layout)
 */
export function setAppContext(): AppContext {
	const context = new AppContext();
	setContext(APP_CONTEXT_KEY, context);
	return context;
}

/**
 * Get the app context (call this in pages/components that need access)
 */
export function getAppContext(): AppContext {
	const context = getContext<AppContext>(APP_CONTEXT_KEY);
	if (!context) {
		throw new Error('App context not found. Make sure setAppContext() is called in the layout.');
	}
	return context;
}
