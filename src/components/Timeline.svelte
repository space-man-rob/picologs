<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import Item from './Item.svelte';
	import { ArrowDown } from '@lucide/svelte';
	import { fade } from 'svelte/transition';
	import TimelineFilters from './TimelineFilters.svelte';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import type { Log, RecentEvent } from '../types';

	let {
		fileContent,
		file,
		friendsList,
		playerName
	}: { fileContent: Log[]; file: string | null; friendsList: any[]; playerName: string | null } =
		$props();

	let atTheBottom = $state(false);
	let filters = $state({
		eventTypes: {
			vehicle_control_flow: true,
			actor_death: true,
			location_change: true,
			other: true,
			destruction: true
		},
		search: '',
		players: {
			all: true,
			self: false,
			online: [] as string[]
		}
	});

	function handleFilterChange(newFilters: typeof filters) {
		filters = newFilters;
	}

	function filterContent(content: Log[]) {
		return content.filter((item: Log) => {
			// Filter by event type
			if (item.eventType) {
				const eventType = item.eventType as keyof typeof filters.eventTypes;
				if (!filters.eventTypes[eventType]) {
					return false;
				}
			} else if (!filters.eventTypes.other) {
				return false;
			}

			// Filter by player
			if (!filters.players.all) {
				let playerMatch = false;
				if (filters.players.self && item.player === playerName) {
					playerMatch = true;
				}
				if (filters.players.online.includes(String(item.userId))) {
					playerMatch = true;
				}
				if (!playerMatch) {
					return false;
				}
			}

			// Filter by search term
			if (filters.search) {
				const searchTerm = filters.search.toLowerCase();
				const searchableText = [
					item.eventType,
					item.line,
					item.player,
					item.original,
					item.metadata?.location,
					item.metadata?.vehicleName,
					item.metadata?.victimName,
					item.metadata?.killerName,
					item.metadata?.damageType
				]
					.filter(Boolean)
					.join(' ')
					.toLowerCase();
				return searchableText.includes(searchTerm);
			}

			return true;
		});
	}

	let displayedFileContent = $derived(filterContent(fileContent));

	function handleScroll(event: Event) {
		if (!(event.target instanceof HTMLDivElement)) {
			return;
		}
		hasScrollbar = event.target.scrollTop + event.target.clientHeight < event.target.scrollHeight;
		atTheBottom =
			event.target.scrollTop + event.target.clientHeight >= event.target.scrollHeight - 5;
	}

	let fileContentContainer = $state<HTMLDivElement>();
	let hasScrollbar = $state(false);

	let unlisten: () => void;
	let scrollButtonLeft = $state('50%'); // Default to viewport center initially
	let resizeObserver: ResizeObserver | null = null;

	async function updateButtonPosition() {
		await tick(); // Ensure DOM measurements are up-to-date
		if (fileContentContainer) {
			const rect = fileContentContainer.getBoundingClientRect();
			const centerOfFileContent = rect.left + rect.width / 2;
			scrollButtonLeft = `${centerOfFileContent}px`;
		}
	}

	onMount(async () => {
		await tick(); // Ensure fileContentContainer is rendered

		// Initial scroll to bottom
		if (fileContentContainer) {
			fileContentContainer.scrollTo({
				top: fileContentContainer.scrollHeight,
				behavior: 'auto' // Use 'auto' for initial to avoid issues if content is small
			});
		}

		// Initial button position
		updateButtonPosition();

		// Listen to window resize via Tauri API
		unlisten = await getCurrentWindow().onResized(() => {
			if (fileContentContainer) {
				hasScrollbar =
					fileContentContainer.scrollTop + fileContentContainer.clientHeight <
					fileContentContainer.scrollHeight;
				atTheBottom =
					fileContentContainer.scrollTop + fileContentContainer.clientHeight >=
					fileContentContainer.scrollHeight - 5;
			}
			updateButtonPosition(); // Update button position on window resize
		});

		// Observe the fileContentContainer for size changes (e.g., due to Resizer)
		if (fileContentContainer) {
			resizeObserver = new ResizeObserver(() => {
				updateButtonPosition();
				// Also re-check scrollbar status as width changes can affect scrollHeight
				if (fileContentContainer) {
					hasScrollbar =
						fileContentContainer.scrollTop + fileContentContainer.clientHeight <
						fileContentContainer.scrollHeight;
					atTheBottom =
						fileContentContainer.scrollTop + fileContentContainer.clientHeight >=
						fileContentContainer.scrollHeight - 5;
				}
			});
			resizeObserver.observe(fileContentContainer);
		}
	});

	onDestroy(() => {
		unlisten?.();
		if (resizeObserver && fileContentContainer) {
			resizeObserver.unobserve(fileContentContainer);
		}
		resizeObserver?.disconnect();
	});

	$effect(() => {
		// By depending on displayedFileContent, this effect runs when new logs appear.
		const _ = displayedFileContent;

		// atTheBottom is only updated on scroll events, so it correctly reflects
		// the scroll position before the new content was added.
		if (atTheBottom && fileContentContainer) {
			tick().then(() => {
				if (fileContentContainer) {
					fileContentContainer.scrollTo({
						top: fileContentContainer.scrollHeight,
						behavior: 'smooth'
					});
				}
			});
		}
	});

	function checkLocationChange(recentEvents: Log[], item: Log) {
		const lastLocationChange = recentEvents[recentEvents.length - 1];

		if (lastLocationChange) {
			const timeDiff =
				new Date(item.timestamp).getTime() - new Date(lastLocationChange.timestamp).getTime();
			const oneHour = 60 * 60 * 1000;

			if (
				timeDiff < oneHour &&
				lastLocationChange.metadata?.location === item.metadata?.location &&
				lastLocationChange.metadata?.location !== 'Unknown'
			) {
				return false;
			}
		}
		recentEvents.push(item);
		return true;
	}

	//check for duplicate destruction events
	function checkDestruction(processedDestructions: Record<string, Log>, item: Log) {
		const vehicleId = item.metadata?.vehicleId;
		if (!vehicleId) return true; // Not a vehicle destruction event we can track

		const existingEvent = processedDestructions[vehicleId];
		if (existingEvent) {
			const timeDiff =
				new Date(item.timestamp).getTime() - new Date(existingEvent.timestamp).getTime();
			const fiveSeconds = 5 * 1000;

			if (timeDiff < fiveSeconds && item.player) {
				// It's a duplicate.
				if (!existingEvent.reportedBy) {
					existingEvent.reportedBy = [existingEvent.player as string];
				}
				if (!existingEvent.reportedBy.includes(item.player)) {
					existingEvent.reportedBy.push(item.player);
				}
				return false; // Don't include this item in the final list.
			}
		}

		// It's a new destruction event. Store it for checking subsequent events.
		processedDestructions[vehicleId] = item;
		return true;
	}

	function checkActorDeath(processedActorDeaths: Record<string, Log>, item: Log) {
		const victimId = item.metadata?.victimId;
		if (!victimId) return true;

		const existingEvent = processedActorDeaths[victimId];
		if (existingEvent) {
			const timeDiff =
				new Date(item.timestamp).getTime() - new Date(existingEvent.timestamp).getTime();
			const fiveSeconds = 5 * 1000;

			if (timeDiff < fiveSeconds && item.player) {
				if (!existingEvent.reportedBy) {
					existingEvent.reportedBy = [existingEvent.player as string];
				}
				if (!existingEvent.reportedBy.includes(item.player)) {
					existingEvent.reportedBy.push(item.player);
				}
				return false;
			}
		}
		processedActorDeaths[victimId] = item;
		return true;
	}

	function checkVehicleControlFlow(processedVehicleControls: Record<string, Log>, item: Log) {
		const vehicleId = item.metadata?.vehicleId;
		if (!vehicleId) return true;

		const existingEvent = processedVehicleControls[vehicleId];
		if (existingEvent) {
			const timeDiff =
				new Date(item.timestamp).getTime() - new Date(existingEvent.timestamp).getTime();
			const fiveSeconds = 5 * 1000;

			if (timeDiff < fiveSeconds && item.player) {
				if (!existingEvent.reportedBy) {
					existingEvent.reportedBy = [existingEvent.player as string];
				}
				if (!existingEvent.reportedBy.includes(item.player)) {
					existingEvent.reportedBy.push(item.player);
				}
				return false;
			}
		}
		processedVehicleControls[vehicleId] = item;
		return true;
	}

	let computedEvents = $derived.by(() => {
		const playerEvents: Record<
			string,
			{
				location_change: Log[];
			}
		> = {};
		const processedDestructions: Record<string, Log> = {};
		const processedActorDeaths: Record<string, Log> = {};
		const processedVehicleControls: Record<string, Log> = {};

		const consolidatedEvents = displayedFileContent
			.map((item) => ({ ...item })) // Create shallow copies to prevent mutation of original state
			.filter((item) => {
				if (item.player && !playerEvents[item.player]) {
					playerEvents[item.player] = {
						location_change: []
					};
				}

				switch (item.eventType) {
					case 'location_change':
						return item.player
							? checkLocationChange(playerEvents[item.player].location_change, item)
							: true;
					case 'destruction':
						return checkDestruction(processedDestructions, item);
					case 'actor_death':
						return checkActorDeath(processedActorDeaths, item);
					case 'vehicle_control_flow':
						return checkVehicleControlFlow(processedVehicleControls, item);
					default:
						return true;
				}
			});
		return consolidatedEvents;
	});

</script>

<div class="timeline-container">
	<div class="timeline-filters">
		<TimelineFilters onfilterchange={handleFilterChange} {friendsList} {playerName} />
	</div>

	<div
		class="file-content"
		onscroll={handleScroll}
		onresize={handleScroll}
		bind:this={fileContentContainer}>
		{#if file}
			{#if displayedFileContent && displayedFileContent.length > 0}
				{#each computedEvents as item (item.id)}
					<div>
						<Item {...item} open={item.open} />
						{#if item.children && item.children.length > 0}
							<div class="children">
								{#each item.children as childItem (childItem.id)}
									<Item {...childItem} child />
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			{:else}
				<div class="item">
					<div class="line-container">
						<div class="line">No logs match the current filters.</div>
					</div>
				</div>
			{/if}
		{:else}
			<div class="welcome">
				<h2>🚀 Getting started</h2>
				<ol class="welcome-list">
					<li>
						Select your <code>Game.log</code>
						file (sometimes just listed as Game). Usually found at the default path:
						<code>C:\Program Files\Roberts Space Industries\StarCitizen\LIVE\Game.log</code>
						<br />
						(Or the equivalent path on your system if installed elsewhere.)
					</li>
					<li>
						Once a log file is selected and you go <strong>Online</strong>
						(using the top-right button), Picologs automatically connects you with other friends for
						real-time log sharing.
					</li>
					<li>
						To add friends use your <strong>Friend Code</strong>
						displayed at the top. Share this with friends to connect with them.
					</li>
				</ol>
			</div>
		{/if}

		{#if hasScrollbar && !atTheBottom}
			<button
				in:fade={{ duration: 200, delay: 400 }}
				out:fade={{ duration: 200 }}
				class="scroll-to-bottom"
				style="left: {scrollButtonLeft};"
				onclick={() =>
					fileContentContainer?.scrollTo({
						top: fileContentContainer.scrollHeight,
						behavior: 'smooth'
					})}>
				<ArrowDown size={24} />
			</button>
		{/if}
	</div>
</div>

<style>
	.timeline-filters {
		height: 50px;
		background-color: transparent;
		border-bottom: 1px solid rgba(255, 255, 255, 0.2);
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
	}

	.timeline-container {
		display: grid;
		grid-template-columns: 1fr;
		grid-template-rows: 50px 1fr;
		grid-column-gap: 0px;
		grid-row-gap: 0px;
	}

	.file-content {
		height: calc(100dvh - 50px - 70px - 40px);
		position: relative;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.3) rgba(0, 0, 0, 0.2);
		background: rgba(0, 0, 0, 0.1);
	}

	.welcome {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1rem;
		margin: 2rem auto;
		padding: 2rem;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		max-width: 600px;
	}

	.welcome h2 {
		margin: 0 0 0.5rem 0;
		font-size: 1.6rem;
		font-weight: 500;
	}

	.welcome ol,
	.welcome li {
		margin: 0;
		font-size: 1rem;
		font-weight: 300;
		line-height: 1.6;
	}

	.welcome .welcome-list {
		list-style: none;
		padding-left: 0;
		counter-reset: welcome-counter;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.welcome .welcome-list li {
		display: inline-block;

		position: relative;
		padding-left: 34px;
	}

	.welcome .welcome-list li::before {
		counter-increment: welcome-counter;
		content: counter(welcome-counter);
		position: absolute;
		left: 0;
		top: 0;

		width: 24px;
		height: 24px;
		background-color: #4caf50;
		color: white;
		border-radius: 50%;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 0.85em;
		font-weight: bold;
		line-height: 24px;
	}

	.welcome code {
		background: rgba(255, 255, 255, 0.1);
		padding: 0.1rem 0.3rem;
		border-radius: 3px;
		font-family: monospace;
	}
	.welcome .welcome-list {
		list-style: none;
		padding-left: 0;
		counter-reset: welcome-counter;
		margin-top: 1em;
	}

	.welcome .welcome-list li::before {
		counter-increment: welcome-counter;
		content: counter(welcome-counter);
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		background-color: #4caf50;
		color: white;
		border-radius: 50%;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 0.85em;
		font-weight: bold;
		margin-right: 0.8em;
		line-height: 24px;
	}

	.welcome code {
		background: rgba(255, 255, 255, 0.1);
		padding: 0.1rem 0.3rem;
		border-radius: 3px;
		font-family: monospace;
		display: inline;
		font-size: 1em;
	}

	.scroll-to-bottom {
		position: fixed;
		bottom: 50px;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background-color: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		backdrop-filter: blur(10px);
		box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
		align-items: center;
		justify-content: center;
		display: flex;
		color: white;
		cursor: pointer;
		/* left: calc(290px + (100vw - 290px) / 2); Removed, will be dynamic */
		transform: translateX(-50%);
	}

	.item {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.item:last-child {
		border-bottom: none;
	}

	.line-container {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.line {
		font-size: 0.95rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		line-height: 1.4;
	}

	.file-content div {
		display: flex;
		flex-direction: column;
	}

	:global(.file-content > div:nth-child(2n)) {
		background-color: rgba(255, 255, 255, 0.05);
	}

	.children {
		margin-left: 3rem;
		border-left: 1px solid #205d84;
		border-image: linear-gradient(to bottom, #205d84, transparent) 1;
	}
</style>
