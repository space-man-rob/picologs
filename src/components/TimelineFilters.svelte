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

<div class="filters">
	<div class="search">
		<input
			type="text"
			placeholder="Search logs..."
			bind:value={filters.search}
			oninput={handleFilterChange} />
	</div>
	<div class="filters-dropdown">
		<button class="filter-button" onclick={toggleDropdown}>
			<Funnel size={16} />
			<span>Filters</span>
			<div class="chevron-container" class:rotated={isOpen}>
				<ChevronDown />
			</div>
		</button>
		{#if isOpen}
			<div class="dropdown-content">
				<div class="event-types">
					<label>
						<input
							type="checkbox"
							bind:checked={filters.eventTypes.vehicle_control_flow}
							onchange={handleFilterChange} />
						🚀 Vehicle Control
					</label>
					<label>
						<input
							type="checkbox"
							bind:checked={filters.eventTypes.actor_death}
							onchange={handleFilterChange} />
						💀 Deaths
					</label>
					<label>
						<input
							type="checkbox"
							bind:checked={filters.eventTypes.destruction}
							onchange={handleFilterChange} />
						💥 Destruction
					</label>
					<label>
						<input
							type="checkbox"
							bind:checked={filters.eventTypes.location_change}
							onchange={handleFilterChange} />
						🔍 Location Changes
					</label>
					<label>
						<input
							type="checkbox"
							bind:checked={filters.eventTypes.corpsify}
							onchange={handleFilterChange} />
						🧟 Corpsify
					</label>
					<label>
						<input
							type="checkbox"
							bind:checked={filters.eventTypes.other}
							onchange={handleFilterChange} />
						📝 Other Events
					</label>
				</div>
			</div>
		{/if}
	</div>

    <!-- filter players -->
	<div class="filters-dropdown">
		<button class="filter-button" onclick={togglePlayersDropdown}>
			<Funnel size={16} />
			<span>Players</span>
			<div class="chevron-container" class:rotated={isPlayersOpen}>
				<ChevronDown />
			</div>
		</button>
		{#if isPlayersOpen}
			<div class="dropdown-content">
				<div class="event-types">
					<label>
                        <input type="checkbox" onchange={handleFilterChange} bind:checked={filters.players.self} />
                        {playerName} (Self)
                    </label>
					
                    {#each onlinePlayers as player (player.id)}
						<label>
							<input type="checkbox" onchange={handleFilterChange} bind:checked={player.checked} />
							{player.name}
						</label>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<button class="filter-button" onclick={resetFilters}>
		<RotateCcw size={16} />
		<span>Reset</span>
	</button>
</div>

<style>
	.filters {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0 1rem;
		height: 100%;
		justify-content: flex-start;
	}

	.search {
		flex: 1;
		max-width: 300px;
	}

	.search input {
		width: 100%;
		padding: 0.5rem;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.search input::placeholder {
		color: rgba(255, 255, 255, 0.5);
	}

	.filters-dropdown {
		position: relative;
	}

	.filter-button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.1);
		color: white;
		cursor: pointer;
		font-size: 0.9rem;
	}

	.filter-button:hover {
		background: rgba(255, 255, 255, 0.15);
	}

	.chevron-container {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
	}

	.rotated {
		transform: rotate(180deg);
		transition: transform 0.2s ease;
	}

	.dropdown-content {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 0.5rem;
		background: rgb(10, 30, 42);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 4px;
		padding: 1rem;
		
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		z-index: 1000;
	}

	.event-types {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		min-width: 220px;
	}

	.event-types label {
		display: flex;
		align-items: center;
		color: rgba(255, 255, 255, 0.8);
		cursor: pointer;
		gap: 0.5rem;
	}

 input[type="checkbox"] {
		flex-shrink: 0;
		border: 1px solid rgba(255, 255, 255, 1);
		width: 16px;
		height: 16px;
		color: white;
		background: rgba(255, 255, 255, 0.1);
		appearance: none;
		-webkit-appearance: none;
		position: relative;
		cursor: pointer;
	}

	 input[type="checkbox"]:checked {
		background: #2196f3;
		border-color: #2196f3;
	}

	 input[type="checkbox"]:checked::after {
		content: '';
		position: absolute;
		left: 4px;
		top: 1px;
		width: 6px;
		height: 10px;
		border: solid white;
		border-width: 0 2px 2px 0;
		transform: rotate(45deg);
	}

	
</style>
