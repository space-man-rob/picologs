<script lang="ts">
	import { onMount } from 'svelte';
	import { ChevronDown, Funnel, RotateCcw } from '@lucide/svelte';
	import type { Friend } from '../types';

	let {
		friendsList,
		playerName,
		onfilterchange
	} = $props();

	type EventType =
		| 'connection'
		| 'vehicle_control_flow'
		| 'actor_death'
		| 'destruction'
		| 'location_change'
		| 'other'
		| 'corpsify';

	type Filters = {
		eventTypes: Record<EventType, boolean>;
		search: string;
		players: {
			all: boolean;
			self: boolean;
			online: string[];
		};
	};

	const initialFilters = Object.freeze<Filters>({
		eventTypes: {
			vehicle_control_flow: true,
			actor_death: true,
			destruction: true,
			location_change: true,
			connection: true,
			corpsify: true,
			other: true
		},
		search: '',
		players: {
			all: true,
			self: false,
			online: []
		}
	});

	let filters = $state<Filters>(JSON.parse(JSON.stringify(initialFilters)));

	let isOpen = $state(false);

	function handleFilterChange() {
		filters.players.online = onlinePlayers.filter((p: Friend & { checked?: boolean }) => p.checked).map((p: Friend) => p.id);
		filters.players.all = !filters.players.self && filters.players.online.length === 0;
		onfilterchange(filters);
	}

	function toggleDropdown(event: MouseEvent) {
		event.stopPropagation();
		isOpen = !isOpen;
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.filters-dropdown')) {
			isOpen = false;
			isPlayersOpen = false;
		}
	}

	$effect(() => {
		// Ensure reactivity for playerName and friendsList if they are props that can change
		// and if their changes need to implicitly update filters or onlinePlayers status.
		// For now, direct calls to handleFilterChange from UI events should suffice.
		// If onlinePlayers derivation needs to trigger filter updates directly, that's handled by its own $derived nature.
	});

	let isPlayersOpen = $state(false);
    let onlinePlayers = $derived(friendsList.filter((friend: any) => friend));

	function togglePlayersDropdown() {
		isPlayersOpen = !isPlayersOpen;
	}

	function resetFilters() {
		filters = JSON.parse(JSON.stringify(initialFilters));
		onlinePlayers.forEach((p: Friend & { checked?: boolean }) => p.checked = false);
		handleFilterChange();
	}

	onMount(() => {
		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});
</script>

<div class="flex items-center gap-4 px-4 h-full justify-start">
	<div class="flex-1 max-w-[300px]">
		<input
			type="text"
			placeholder="Search logs..."
			bind:value={filters.search}
			oninput={handleFilterChange}
			class="w-full px-2 py-2 rounded border border-white/20 bg-white/10 text-white placeholder:text-white/50" />
	</div>
	<div class="relative filters-dropdown">
		<button
			onclick={toggleDropdown}
			class="flex items-center gap-2 px-4 py-2 rounded border border-white/20 bg-white/10 text-white text-sm hover:bg-white/15 transition-colors duration-200">
			<Funnel size={16} />
			<span>Filters</span>
			<div class="flex items-center justify-center w-4 h-4 transition-transform duration-200 {isOpen ? 'rotate-180' : ''}">
				<ChevronDown />
			</div>
		</button>
		{#if isOpen}
			<div class="absolute top-full right-0 mt-2 bg-[rgb(10,30,42)] border border-white/20 rounded p-4 shadow-md z-[1000]">
				<div class="flex flex-col gap-3 min-w-[220px]">
					<label class="flex items-center text-white/80 cursor-pointer gap-2">
						<input
							type="checkbox"
							bind:checked={filters.eventTypes.vehicle_control_flow}
							onchange={handleFilterChange}
							class="flex-shrink-0 w-4 h-4 border border-white appearance-none bg-white/10 cursor-pointer checked:bg-[#2196f3] checked:border-[#2196f3] relative checked:after:content-[''] checked:after:absolute checked:after:left-1 checked:after:top-0.5 checked:after:w-1.5 checked:after:h-2.5 checked:after:border-white checked:after:border-r-2 checked:after:border-b-2 checked:after:rotate-45" />
						🚀 Vehicle Control
					</label>
					<label class="flex items-center text-white/80 cursor-pointer gap-2">
						<input
							type="checkbox"
							bind:checked={filters.eventTypes.actor_death}
							onchange={handleFilterChange}
							class="flex-shrink-0 w-4 h-4 border border-white appearance-none bg-white/10 cursor-pointer checked:bg-[#2196f3] checked:border-[#2196f3] relative checked:after:content-[''] checked:after:absolute checked:after:left-1 checked:after:top-0.5 checked:after:w-1.5 checked:after:h-2.5 checked:after:border-white checked:after:border-r-2 checked:after:border-b-2 checked:after:rotate-45" />
						💀 Deaths
					</label>
					<label class="flex items-center text-white/80 cursor-pointer gap-2">
						<input
							type="checkbox"
							bind:checked={filters.eventTypes.destruction}
							onchange={handleFilterChange}
							class="flex-shrink-0 w-4 h-4 border border-white appearance-none bg-white/10 cursor-pointer checked:bg-[#2196f3] checked:border-[#2196f3] relative checked:after:content-[''] checked:after:absolute checked:after:left-1 checked:after:top-0.5 checked:after:w-1.5 checked:after:h-2.5 checked:after:border-white checked:after:border-r-2 checked:after:border-b-2 checked:after:rotate-45" />
						💥 Destruction
					</label>
					<label class="flex items-center text-white/80 cursor-pointer gap-2">
						<input
							type="checkbox"
							bind:checked={filters.eventTypes.location_change}
							onchange={handleFilterChange}
							class="flex-shrink-0 w-4 h-4 border border-white appearance-none bg-white/10 cursor-pointer checked:bg-[#2196f3] checked:border-[#2196f3] relative checked:after:content-[''] checked:after:absolute checked:after:left-1 checked:after:top-0.5 checked:after:w-1.5 checked:after:h-2.5 checked:after:border-white checked:after:border-r-2 checked:after:border-b-2 checked:after:rotate-45" />
						🔍 Location Changes
					</label>
					<label class="flex items-center text-white/80 cursor-pointer gap-2">
						<input
							type="checkbox"
							bind:checked={filters.eventTypes.corpsify}
							onchange={handleFilterChange}
							class="flex-shrink-0 w-4 h-4 border border-white appearance-none bg-white/10 cursor-pointer checked:bg-[#2196f3] checked:border-[#2196f3] relative checked:after:content-[''] checked:after:absolute checked:after:left-1 checked:after:top-0.5 checked:after:w-1.5 checked:after:h-2.5 checked:after:border-white checked:after:border-r-2 checked:after:border-b-2 checked:after:rotate-45" />
						🧟 Corpsify
					</label>
					<label class="flex items-center text-white/80 cursor-pointer gap-2">
						<input
							type="checkbox"
							bind:checked={filters.eventTypes.other}
							onchange={handleFilterChange}
							class="flex-shrink-0 w-4 h-4 border border-white appearance-none bg-white/10 cursor-pointer checked:bg-[#2196f3] checked:border-[#2196f3] relative checked:after:content-[''] checked:after:absolute checked:after:left-1 checked:after:top-0.5 checked:after:w-1.5 checked:after:h-2.5 checked:after:border-white checked:after:border-r-2 checked:after:border-b-2 checked:after:rotate-45" />
						📝 Other Events
					</label>
				</div>
			</div>
		{/if}
	</div>

	<!-- filter players -->
	<div class="relative filters-dropdown">
		<button
			onclick={togglePlayersDropdown}
			class="flex items-center gap-2 px-4 py-2 rounded border border-white/20 bg-white/10 text-white text-sm hover:bg-white/15 transition-colors duration-200">
			<Funnel size={16} />
			<span>Players</span>
			<div class="flex items-center justify-center w-4 h-4 transition-transform duration-200 {isPlayersOpen ? 'rotate-180' : ''}">
				<ChevronDown />
			</div>
		</button>
		{#if isPlayersOpen}
			<div class="absolute top-full right-0 mt-2 bg-[rgb(10,30,42)] border border-white/20 rounded p-4 shadow-md z-[1000]">
				<div class="flex flex-col gap-3 min-w-[220px]">
					<label class="flex items-center text-white/80 cursor-pointer gap-2">
						<input
							type="checkbox"
							onchange={handleFilterChange}
							bind:checked={filters.players.self}
							class="flex-shrink-0 w-4 h-4 border border-white appearance-none bg-white/10 cursor-pointer checked:bg-[#2196f3] checked:border-[#2196f3] relative checked:after:content-[''] checked:after:absolute checked:after:left-1 checked:after:top-0.5 checked:after:w-1.5 checked:after:h-2.5 checked:after:border-white checked:after:border-r-2 checked:after:border-b-2 checked:after:rotate-45" />
						{playerName} (Self)
					</label>

					{#each onlinePlayers as player (player.id)}
						<label class="flex items-center text-white/80 cursor-pointer gap-2">
							<input
								type="checkbox"
								onchange={handleFilterChange}
								bind:checked={player.checked}
								class="flex-shrink-0 w-4 h-4 border border-white appearance-none bg-white/10 cursor-pointer checked:bg-[#2196f3] checked:border-[#2196f3] relative checked:after:content-[''] checked:after:absolute checked:after:left-1 checked:after:top-0.5 checked:after:w-1.5 checked:after:h-2.5 checked:after:border-white checked:after:border-r-2 checked:after:border-b-2 checked:after:rotate-45" />
							{player.name}
						</label>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<button
		onclick={resetFilters}
		class="flex items-center gap-2 px-4 py-2 rounded border border-white/20 bg-white/10 text-white text-sm hover:bg-white/15 transition-colors duration-200">
		<RotateCcw size={16} />
		<span>Reset</span>
	</button>
</div>
