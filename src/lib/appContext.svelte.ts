import { getContext, setContext } from 'svelte';
import type { Friend as FriendType } from '../types';
import type { ApiFriend } from './api';

/**
 * Shared application context for authentication, WebSocket connection, and friends data.
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
