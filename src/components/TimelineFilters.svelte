<script lang="ts">
	import { onMount } from 'svelte';
	import { createEventDispatcher } from 'svelte';
	import { ChevronDown, Funnel } from '@lucide/svelte';

	type EventType =
		| 'vehicle_control_flow'
		| 'actor_death'
		| 'destruction'
		| 'location_change'
		| 'other';

	type Filters = {
		eventTypes: Record<EventType, boolean>;
		search: string;
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
		search: ''
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
</div>

<style>
	.filters {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0 1rem;
		height: 100%;
	}

	.search {
		flex: 1;
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
		min-width: 220px;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		z-index: 1000;
	}

	.event-types {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.event-types label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		color: rgba(255, 255, 255, 0.8);
		cursor: pointer;
	}

	input[type='checkbox'] {
		/* Add if not using autoprefixer */
		-webkit-appearance: none;
		/* Remove most all native input styles */
		appearance: none;
		/* For iOS < 15 */
		background-color: transparent;
		/* Not removed via appearance */
		margin: 0;

		font: inherit;
		color: currentColor;
		width: 1.15em;
		height: 1.15em;
		border: 0.15em solid currentColor;
		border-radius: 0.15em;
		transform: translateY(-0.075em);

		display: grid;
		place-content: center;
	}

	input[type='checkbox']::before {
		content: '';
		width: 0.65em;
		height: 0.65em;
		clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%);
		transform: scale(0);
		transform-origin: bottom left;
		transition: 120ms transform ease-in-out;
		box-shadow: inset 1em 1em white;
		/* Windows High Contrast Mode */
		background-color: CanvasText;
	}

	input[type='checkbox']:checked::before {
		transform: scale(1);
	}

	input[type='checkbox']:focus {
		outline: max(2px, 0.15em) solid currentColor;
		outline-offset: max(2px, 0.15em);
	}
</style>
