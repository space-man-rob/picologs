<script lang="ts">
	import { onMount } from 'svelte';
	import { createEventDispatcher } from 'svelte';
	import { ChevronDown, Funnel, RotateCcw } from '@lucide/svelte';

	let {
		friendsList,
		playerName
	} = $props();

    $inspect(friendsList);

	type EventType =
		| 'vehicle_control_flow'
		| 'actor_death'
		| 'destruction'
		| 'location_change'
		| 'other';

	type Filters = {
		eventTypes: Record<EventType, boolean>;
		search: string;
		players: {
			all: boolean;
			self: boolean;
			online: string[];
		};
	};

	const dispatch = createEventDispatcher<{
		filterChange: Filters;
	}>();

	let filters = $state<Filters>({
		eventTypes: {
			vehicle_control_flow: true,
			actor_death: true,
			destruction: true,
			location_change: true,
			other: true
		},
		search: '',
		players: {
			all: true,
			self: false,
			online: []
		}
	});

	let isOpen = $state(false);

	function handleFilterChange() {
		dispatch('filterChange', filters);
	}

	function toggleDropdown(event: MouseEvent) {
		event.stopPropagation();
		isOpen = !isOpen;
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.filters-dropdown')) {
			isOpen = false;
		}
	}

	$effect(() => {
		handleFilterChange();
	});

	let isPlayersOpen = $state(false);
    let onlinePlayers = $derived(friendsList.filter((friend: any) => friend.isOnline));

	function togglePlayersDropdown() {
		isPlayersOpen = !isPlayersOpen;
	}

	onMount(() => {
		console.log('TimelineFilters mounted');
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
                        {playerName}
                    </label>
					
                    {#each onlinePlayers as player}
						<label>
							<input type="checkbox" onchange={handleFilterChange} bind:checked={player.checked} />
							{player.name}
						</label>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<button class="filter-button" onclick={handleFilterChange}>
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
