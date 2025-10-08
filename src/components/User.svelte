<script lang="ts">
	import type { Friend as UserDisplayType } from '../types';
	import { getAppContext } from '$lib/appContext.svelte';
	import { getDiscordColor } from '$lib/discord-colors';

	const appCtx = getAppContext();

	let { user } = $props<{ user: UserDisplayType }>();

	function selectUser() {
		// Toggle selection: if already selected, deselect
		if (appCtx.selectedUserId === user.id) {
			appCtx.selectedUserId = null;
		} else {
			appCtx.selectedUserId = user.id;
			// Deselect group when selecting a user
			appCtx.selectedGroupId = null;
		}
	}

	let isSelected = $derived(appCtx.selectedUserId === user.id);

	// Reactive state to force re-render every minute
	let currentMinute = $state(new Date().getMinutes());

	// Update the time every minute
	$effect(() => {
		const interval = setInterval(() => {
			currentMinute = new Date().getMinutes();
		}, 60000); // Update every 60 seconds

		// Also calculate the initial delay to sync with the next minute
		const now = new Date();
		const secondsUntilNextMinute = 60 - now.getSeconds();
		const initialTimeout = setTimeout(() => {
			currentMinute = new Date().getMinutes();
			// After the initial sync, the interval will take over
		}, secondsUntilNextMinute * 1000);

		return () => {
			clearInterval(interval);
			clearTimeout(initialTimeout);
		};
	});

	function getLocalTime(timezone: string | undefined): string {
		if (!timezone) return '';
		try {
			// Force reactivity on currentMinute
			void currentMinute;
			return new Date().toLocaleTimeString('en-US', {
				timeZone: timezone,
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return '(TZ Error)';
		}
	}

	function getCityFromTimezone(timezone: string | undefined): string {
		if (!timezone) return '';
		// Extract city name from timezone string (e.g., "America/New_York" -> "New York")
		const parts = timezone.split('/');
		let location = parts[parts.length - 1];

		// Handle special cases
		if (parts.length > 1 && parts[0] === 'Australia') {
			// For Australian cities, include the country
			location = parts.join(', ');
		} else if (parts.length > 2) {
			// For other multi-part timezones, use the last two parts
			location = parts.slice(-2).join(', ');
		}

		// Replace underscores with spaces
		return location.replace(/_/g, ' ');
	}

	// Check if avatar is a valid Discord avatar hash (not just a default avatar index)
	function isValidAvatarHash(avatar: string | null | undefined): boolean {
		if (!avatar) return false;
		// Discord avatar hashes are alphanumeric strings (usually 32 chars)
		// Default avatars are just single digits (0-5), which are not valid custom avatars
		const cleanAvatar = avatar.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '');
		return cleanAvatar.length > 2 && /^[a-zA-Z0-9_]+$/.test(cleanAvatar);
	}
</script>

{#if user}
	<button
		class="w-full p-2 rounded-lg flex items-center gap-2 transition-colors min-w-0 hover:bg-white/[0.08] {isSelected
			? 'bg-overlay-light ring-2 ring-blue-500'
			: ''} {!user.isOnline ? 'opacity-50' : ''}"
		onclick={selectUser}
	>
		<div class="relative flex-shrink-0">
			{#if user.avatar && user.discordId && isValidAvatarHash(user.avatar)}
				<img
					src={user.avatar.startsWith('http')
						? user.avatar
						: `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '')}.png?size=64`}
					alt={user.name || 'User avatar'}
					class="w-8 h-8 rounded-full object-cover"
				/>
			{:else}
				<div
					class="w-8 h-8 rounded-full flex items-center justify-center ring-2 ring-white/10"
					style="background-color: {getDiscordColor(user.id)}33;"
				>
					<svg width="18" height="18" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path
							d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z"
							fill="white"
						/>
					</svg>
				</div>
			{/if}
			{#if user.isOnline}
				<span
					class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 bg-green-500"
					style="border-color: var(--color-bg-primary);"
					title="Online"
				>
				</span>
			{/if}
		</div>
		<div class="flex flex-col items-start min-w-0 flex-1 overflow-hidden">
			<span class="text-sm font-medium text-white truncate text-left max-w-full">
				{user.name || 'Unknown player'}
			</span>
			{#if user.timezone}
				<span class="text-xs text-white/40 truncate text-left max-w-full" title={user.timezone}>
					{getLocalTime(user.timezone)} · {getCityFromTimezone(user.timezone)}
				</span>
			{/if}
		</div>
	</button>
{/if}
