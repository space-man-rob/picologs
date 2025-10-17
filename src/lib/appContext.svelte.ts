import { getContext, setContext } from 'svelte';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { Friend as FriendType, Group, GroupMember, GroupInvitation } from '../types';
import type {
	ApiFriend,
	ApiFriendRequest,
	ApiUserProfile,
	ApiGroup,
	ApiGroupMember,
	ApiGroupInvitation
} from './api';
import type WebSocket from '@tauri-apps/plugin-websocket';

/**
 * WebSocket connection type from our API module
 */
export interface WebSocketSocket {
	send: (data: string) => Promise<void>;
	disconnect: () => Promise<void>;
}

/**
 * Shared application context for authentication, WebSocket connection, friends, and groups data.
 * Uses Svelte 5 context API to share state between layout and pages.
 */
export class AppContext {
	// Authentication state - default to true to prevent flash of signed-out state
	// Will be set to false in layout if no auth data found
	isSignedIn = $state(true);
	// Placeholder to prevent flash - will be replaced with real data from cache in layout
	discordUser = $state<{ id: string; username: string; avatar: string | null } | null>({
		id: '',
		username: '',
		avatar: null
	});
	discordUserId = $state<string | null>(null);

	// WebSocket state
	ws = $state<WebSocketSocket | null>(null);
	connectionStatus = $state<'connected' | 'disconnected' | 'connecting'>('disconnected');
	connectionError = $state<string | null>(null);

	// Friends and API data
	friendsList = $state<FriendType[]>([]);
	apiFriends = $state<ApiFriend[]>([]);
	apiFriendRequests = $state<ApiFriendRequest[]>([]);
	apiUserProfile = $state<ApiUserProfile | null>(null);

	// Cached friend code (loaded from store immediately on app start)
	cachedFriendCode = $state<string | null>(null);

	// Cached log location (loaded from store immediately on app start)
	cachedLogLocation = $state<string | null>(null);

	// Groups data
	groups = $state<ApiGroup[]>([]);
	groupInvitations = $state<ApiGroupInvitation[]>([]);
	groupMembers = $state<SvelteMap<string, ApiGroupMember[]>>(new SvelteMap()); // groupId -> members[]
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
	authNotificationId = $state<string | null>(null);

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
	notifications = $state<
		Array<{ id: string; message: string; type: 'info' | 'success' | 'error'; customIcon?: string }>
	>([]);

	// Processing states for friend requests and group invitations
	processingFriendRequests = $state<SvelteSet<string>>(new SvelteSet());
	processingGroupInvitations = $state<SvelteSet<string>>(new SvelteSet());

	/**
	 * Add a notification toast that auto-dismisses after 5 seconds (unless autoDismiss is false)
	 */
	addNotification(
		message: string,
		type: 'info' | 'success' | 'error' = 'info',
		customIcon?: string,
		autoDismiss: boolean = true
	) {
		const id = crypto.randomUUID();
		this.notifications = [...this.notifications, { id, message, type, customIcon }];

		// Auto-dismiss after 5 seconds if enabled
		if (autoDismiss) {
			setTimeout(() => {
				this.removeNotification(id);
			}, 5000);
		}

		return id;
	}

	/**
	 * Remove a notification by ID
	 */
	removeNotification(id: string) {
		this.notifications = this.notifications.filter((n) => n.id !== id);
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
