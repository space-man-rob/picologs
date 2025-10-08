<script lang="ts">
	import { getAppContext } from '$lib/appContext.svelte';
	import { updateUserProfile } from '$lib/api';
	import { Copy, Check } from '@lucide/svelte';
	import SubNav from '../../components/SubNav.svelte';

	const appCtx = getAppContext();

	// Auto-detect timezone if not set
	function getDefaultTimezone(): string {
		const savedTz = appCtx.apiUserProfile?.timeZone;
		if (savedTz && savedTz !== 'UTC') {
			return savedTz;
		}
		try {
			return Intl.DateTimeFormat().resolvedOptions().timeZone;
		} catch {
			return 'UTC';
		}
	}

	// Form state
	let player = $state(appCtx.apiUserProfile?.player || '');
	let timeZone = $state(getDefaultTimezone());
	let usePlayerAsDisplayName = $state(appCtx.apiUserProfile?.usePlayerAsDisplayName || false);
	let saving = $state(false);
	let copySuccess = $state(false);

	// Timezone options
	const timezones = [
		{ value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
		{ value: 'America/New_York', label: 'Eastern Time (ET)' },
		{ value: 'America/Chicago', label: 'Central Time (CT)' },
		{ value: 'America/Denver', label: 'Mountain Time (MT)' },
		{ value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
		{ value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
		{ value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
		{ value: 'Europe/London', label: 'London (GMT/BST)' },
		{ value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
		{ value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
		{ value: 'Europe/Rome', label: 'Rome (CET/CEST)' },
		{ value: 'Europe/Madrid', label: 'Madrid (CET/CEST)' },
		{ value: 'Europe/Moscow', label: 'Moscow (MSK)' },
		{ value: 'Asia/Dubai', label: 'Dubai (GST)' },
		{ value: 'Asia/Kolkata', label: 'India (IST)' },
		{ value: 'Asia/Shanghai', label: 'China (CST)' },
		{ value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
		{ value: 'Asia/Seoul', label: 'Seoul (KST)' },
		{ value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
		{ value: 'Australia/Melbourne', label: 'Melbourne (AEST/AEDT)' },
		{ value: 'Pacific/Auckland', label: 'Auckland (NZST/NZDT)' }
	];

	// Update local state when API data changes
	$effect(() => {
		if (appCtx.apiUserProfile) {
			player = appCtx.apiUserProfile.player || '';
			// Auto-detect timezone if not set
			const savedTz = appCtx.apiUserProfile.timeZone;
			if (savedTz && savedTz !== 'UTC') {
				timeZone = savedTz;
			} else {
				try {
					timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
				} catch {
					timeZone = 'UTC';
				}
			}
			usePlayerAsDisplayName = appCtx.apiUserProfile.usePlayerAsDisplayName || false;
		}
	});

	// Check if form has changes
	let hasChanges = $derived(
		player !== (appCtx.apiUserProfile?.player || '') ||
			timeZone !== (appCtx.apiUserProfile?.timeZone || 'UTC') ||
			usePlayerAsDisplayName !== (appCtx.apiUserProfile?.usePlayerAsDisplayName || false)
	);

	// Get Discord avatar URL
	function getAvatarUrl(): string | null {
		const user = appCtx.apiUserProfile;
		if (!user || !user.avatar || !user.discordId) return null;

		if (user.avatar.startsWith('http')) {
			return user.avatar;
		}
		return `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`;
	}

	// Copy friend code to clipboard
	async function copyFriendCode() {
		const friendCode = appCtx.apiUserProfile?.friendCode;
		if (!friendCode) return;

		try {
			await navigator.clipboard.writeText(friendCode);
			copySuccess = true;
			appCtx.addNotification('Friend code copied to clipboard', 'success');

			setTimeout(() => {
				copySuccess = false;
			}, 2000);
		} catch (error) {
			console.error('Failed to copy friend code:', error);
			appCtx.addNotification('Failed to copy friend code', 'error');
		}
	}

	// Form validation
	function validateForm(): boolean {
		if (player.trim().length === 0) {
			appCtx.addNotification('Star Citizen player name is required', 'error');
			return false;
		}

		if (player.length > 100) {
			appCtx.addNotification('Player name is too long (max 100 characters)', 'error');
			return false;
		}

		return true;
	}

	// Save profile changes
	async function handleSave() {
		if (!validateForm()) return;

		if (!appCtx.apiUserProfile) {
			appCtx.addNotification('Profile not loaded. Please refresh the page.', 'error');
			return;
		}

		// Store original values for rollback on error
		const originalPlayer = appCtx.apiUserProfile.player;
		const originalTimeZone = appCtx.apiUserProfile.timeZone;
		const originalUsePlayerAsDisplayName = appCtx.apiUserProfile.usePlayerAsDisplayName;

		saving = true;

		try {
			// Send update via WebSocket with request-response pattern
			const updatedProfile = await updateUserProfile({
				player: player.trim(),
				timeZone: timeZone,
				usePlayerAsDisplayName: usePlayerAsDisplayName
			});

			// Update local state with confirmed server data
			appCtx.apiUserProfile = {
				...appCtx.apiUserProfile,
				...updatedProfile
			};

			appCtx.addNotification('Profile updated successfully', 'success', '✓');
		} catch (error) {
			console.error('Failed to save profile:', error);

			// Rollback local state on error
			player = originalPlayer || '';
			timeZone = originalTimeZone || 'UTC';
			usePlayerAsDisplayName = originalUsePlayerAsDisplayName || false;

			// Show appropriate error message
			const errorMessage = error instanceof Error ? error.message : 'Failed to save profile. Please try again.';
			appCtx.addNotification(errorMessage, 'error');
		} finally {
			saving = false;
		}
	}

	// Get user's initial for avatar fallback
	function getUserInitial(): string {
		const username = appCtx.apiUserProfile?.username || appCtx.discordUser?.username;
		return (username || '?')[0].toUpperCase();
	}
</script>

<div class="flex h-full overflow-hidden">
	<SubNav />
	<div class="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
		<div class="max-w-3xl mx-auto">
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-white mb-2">Profile</h1>
		<p class="text-white/60">Manage your account settings and preferences</p>
	</div>

	{#if !appCtx.apiUserProfile}
		<div class="bg-overlay-light rounded-lg border border-white-20 p-8 text-center">
			<div class="text-white/40 text-lg">Loading profile...</div>
		</div>
	{:else}
		<div class="bg-overlay-card rounded-lg border border-white-20 p-4 sm:p-6">
			<!-- Discord Account Section (Read-only) -->
			<div class="mb-6 pb-6 border-b border-white/10">
				<h2 class="text-base sm:text-lg font-semibold text-white mb-4">Discord Account</h2>
				<div class="flex items-center gap-3 sm:gap-4">
					{#if getAvatarUrl()}
						<img
							src={getAvatarUrl()}
							alt={appCtx.apiUserProfile.username}
							class="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex-shrink-0"
						/>
					{:else}
						<div
							class="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-overlay-light flex items-center justify-center flex-shrink-0"
						>
							<span class="text-2xl sm:text-4xl text-white/60">{getUserInitial()}</span>
						</div>
					{/if}
					<div class="flex-1 min-w-0">
						<p class="text-sm sm:text-base text-white font-semibold truncate">
							{appCtx.apiUserProfile.username}
						</p>
						<p class="text-xs sm:text-sm text-white/40">Connected via Discord</p>
					</div>
				</div>
			</div>

			<!-- Friend Code Section (Read-only) -->
			{#if appCtx.apiUserProfile.friendCode}
				<div class="mb-6 pb-6 border-b border-white/10">
					<h2 class="text-base sm:text-lg font-semibold text-white mb-4">Friend Code</h2>
					<div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
						<code
							class="flex-1 px-3 sm:px-4 py-2 sm:py-3 bg-overlay-light border border-white-20 rounded-lg text-white font-mono text-base sm:text-lg tracking-wider text-center sm:text-left"
						>
							{appCtx.apiUserProfile.friendCode}
						</code>
						<button
							onclick={copyFriendCode}
							class="flex items-center justify-center gap-2 px-4 py-2 sm:py-3 bg-overlay-light text-white rounded-lg border border-white-20 hover:bg-white/20 transition-colors duration-200 whitespace-nowrap"
							title="Copy friend code"
						>
							{#if copySuccess}
								<Check class="w-4 h-4" />
								<span>Copied!</span>
							{:else}
								<Copy class="w-4 h-4" />
								<span>Copy</span>
							{/if}
						</button>
					</div>
					<p class="text-xs sm:text-sm text-white/40 mt-2">
						Share this code with friends to connect
					</p>
				</div>
			{/if}

			<!-- Editable Fields -->
			<form
				onsubmit={(e) => {
					e.preventDefault();
					handleSave();
				}}
			>
				<h2 class="text-base sm:text-lg font-semibold text-white mb-4">Game Information</h2>

				<!-- Player Name -->
				<div class="mb-6">
					<label for="player" class="block text-sm font-medium text-white/80 mb-2">
						Star Citizen Player Name <span class="text-red-400">*</span>
					</label>
					<input
						id="player"
						type="text"
						bind:value={player}
						placeholder="Your in-game name"
						required
						maxlength="100"
						class="w-full px-4 py-2 bg-secondary border border-white-20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-blue-500 transition-colors"
					/>
					<p class="text-sm text-white/40 mt-1">This will be visible to your friends</p>
				</div>

				<!-- Use Player Name as Display Name -->
				<div class="mb-6">
					<label class="flex items-start gap-3 cursor-pointer group">
						<input
							type="checkbox"
							bind:checked={usePlayerAsDisplayName}
							class="mt-0.5 w-5 h-5 rounded border-white-20 bg-secondary text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
						/>
						<div class="flex-1">
							<span
								class="text-sm font-medium text-white/80 group-hover:text-white transition-colors"
							>
								Use Star Citizen name as display name
							</span>
							<p class="text-sm text-white/40 mt-1">
								When enabled, only your Star Citizen player name will be shown throughout the
								app
							</p>
						</div>
					</label>
				</div>

				<!-- Timezone -->
				<div class="mb-6">
					<label for="timezone" class="block text-sm font-medium text-white/80 mb-2">
						Timezone
					</label>
					<select
						id="timezone"
						bind:value={timeZone}
						class="w-full px-4 py-2 bg-secondary border border-white-20 rounded-lg text-white focus:outline-none focus:border-blue-500 transition-colors"
					>
						{#each timezones as tz}
							<option value={tz.value}>{tz.label}</option>
						{/each}
					</select>
					<p class="text-sm text-white/40 mt-1">
						Your timezone helps friends know when you're likely to be online
					</p>
				</div>

				<!-- Save Button -->
				<div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
					<button
						type="submit"
						disabled={saving || !hasChanges}
						class="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2 bg-overlay-light text-white rounded-lg border border-white-20 hover:bg-white/20 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-overlay-light"
					>
						{#if saving}
							<span class="inline-block animate-spin text-lg">⏳</span>
							<span>Saving...</span>
						{:else}
							<span class="text-lg">💾</span>
							<span>Save Changes</span>
						{/if}
					</button>

					{#if !hasChanges && !saving}
						<p class="text-sm text-white/40 text-center sm:text-left">No changes to save</p>
					{/if}
				</div>
			</form>
		</div>
	{/if}
		</div>
	</div>
</div>
