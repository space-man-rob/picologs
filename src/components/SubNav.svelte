<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	type NavItem = {
		path: string;
		label: string;
		emoji: string;
	};

	const navItems: NavItem[] = [
		{ path: '/', label: 'Logs', emoji: '📜' },
		{ path: '/profile', label: 'Profile Settings', emoji: '⚙️' },
		{ path: '/friends', label: 'Friends', emoji: '👨‍🚀' },
		{ path: '/groups', label: 'Groups', emoji: '🗂️' }
	];

	// Derive active path from page store
	let activePath = $derived($page.url.pathname);

	function navigate(path: string) {
		goto(path);
	}

	function isActive(path: string): boolean {
		return activePath === path;
	}
</script>

<nav class="w-48 bg-overlay-card border-r border-white/10 flex flex-col py-4 flex-shrink-0">
	{#each navItems as item, index (item.path)}
		<button
			onclick={() => navigate(item.path)}
			class="relative flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors duration-200 {isActive(
				item.path
			)
				? 'text-white bg-white/10'
				: 'text-white/60 hover:text-white/80 hover:bg-white/5'} {index === 0
				? 'mb-2 border-b border-white/10 pb-3'
				: ''}"
		>
			<span class="text-lg">{item.emoji}</span>
			<span>{item.label}</span>

			{#if isActive(item.path)}
				<div class="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500"></div>
			{/if}
		</button>
	{/each}
</nav>
