<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import Item from './Item.svelte';
	import { ArrowDown } from '@lucide/svelte';
	import { fade } from 'svelte/transition';
	import TimelineFilters from './TimelineFilters.svelte';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import type { Log } from '../types';

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
			destruction: true,
			killing_spree: true,
			connection: true,
			corpsify: true
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

	const allChildren = $derived(fileContent.flatMap((item) => item.children ?? []));
	let displayedFileContent = $derived(
		(() => {
			const _ = allChildren; // Establishes reactivity to child event updates
			return filterContent(fileContent);
		})()
	);

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
		// By depending on computedEvents and a derived value from its children,
		// this effect runs when new logs appear, are consolidated, or child events are updated.
		const _ = computedEvents;
		const __ = computedEvents.flatMap((e) => e.children ?? []);
		const ___ = allChildren;

		// atTheBottom is only updated on scroll events, so it correctly reflects
		// the scroll position before the new content was added.
		if (atTheBottom && fileContentContainer) {
			tick().then(() => {
				if (fileContentContainer) {
					setTimeout(() => {
						fileContentContainer?.scrollTo({
							top: fileContentContainer?.scrollHeight ?? 0,
							behavior: 'smooth'
						});
					}, 100);
				}
			});
		}
	});

	let computedEvents = $derived.by(() => {
		const events: Log[] = JSON.parse(JSON.stringify(displayedFileContent));
		const consolidatedEvents: Log[] = [];

		const playerLocationEvents: Record<string, Log> = {};
		const destructionEvents: Record<string, { index: number; event: Log }> = {};
		const actorDeathEvents: Record<string, { index: number; event: Log }> = {};
		const vehicleControlEvents: Record<string, { index: number; event: Log }> = {};

		for (const item of events) {
			let isDuplicate = false;

			switch (item.eventType) {
				case 'location_change':
					if (item.player) {
						const lastEvent = playerLocationEvents[item.player];
						if (
							lastEvent &&
							new Date(item.timestamp).getTime() - new Date(lastEvent.timestamp).getTime() <
								3600000 &&
							lastEvent.metadata?.location === item.metadata?.location &&
							lastEvent.metadata?.location !== 'Unknown'
						) {
							isDuplicate = true;
						} else {
							playerLocationEvents[item.player] = item;
						}
					}
					break;

				case 'destruction':
				case 'actor_death':
				case 'vehicle_control_flow':
					{
						let eventMap: Record<string, { index: number; event: Log }>;
						let key: string | undefined;

						if (item.eventType === 'destruction') {
							eventMap = destructionEvents;
							key = item.metadata?.vehicleId;
						} else if (item.eventType === 'actor_death') {
							eventMap = actorDeathEvents;
							key = item.metadata?.victimId;
						} else {
							eventMap = vehicleControlEvents;
							key = item.metadata?.vehicleId;
						}

						if (key) {
							const existing = eventMap[key];
							if (
								existing &&
								new Date(item.timestamp).getTime() - new Date(existing.event.timestamp).getTime() <
									60000 &&
								item.player
							) {
								isDuplicate = true;
								const existingEventInConsolidated = consolidatedEvents[existing.index];
								const reportedBy = [
									...(existingEventInConsolidated.reportedBy || [
										existingEventInConsolidated.player as string
									])
								];
								if (!reportedBy.includes(item.player)) {
									reportedBy.push(item.player);
								}
								let updatedEvent = { ...existingEventInConsolidated, reportedBy };

								if (item.eventType === 'destruction') {
									const oldLevel = existingEventInConsolidated.metadata?.destroyLevelTo;
									const newLevel = item.metadata?.destroyLevelTo;
									if (oldLevel === '1' && newLevel === '2') {
										updatedEvent = { ...item, reportedBy: reportedBy };
									} else if (oldLevel === '2' && newLevel === '1') {
										// Hard death already recorded, keep it and just add the reporter
										updatedEvent = { ...existingEventInConsolidated, reportedBy: reportedBy };
									}
								}
								consolidatedEvents[existing.index] = updatedEvent;
								existing.event = updatedEvent; // Keep map in sync
							} else {
								eventMap[key] = { index: consolidatedEvents.length, event: item };
							}
						}
					}
					break;
				case 'connection':
					if (item.player) {
						playerLocationEvents[item.player] = item;
					}
					break;
				case 'corpsify':
					if (item.player) {
						playerLocationEvents[item.player] = item;
					}
					break;
				default:
					break;
			}

			if (!isDuplicate) {
				consolidatedEvents.push(item);
			}
		}

		return consolidatedEvents;
	});

	$inspect(computedEvents);
</script>

<div class="grid grid-cols-1 grid-rows-[50px_1fr]">
	<div class="h-[50px] bg-transparent border-b border-white/20 shadow-[0_4px_10px_rgba(0,0,0,0.4)]">
		<TimelineFilters onfilterchange={handleFilterChange} {friendsList} {playerName} />
	</div>

	<div
		class="h-[calc(100dvh-50px-70px-40px)] relative overflow-y-auto flex flex-col [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.3)_rgba(0,0,0,0.2)] bg-black/10 file-content"
		onscroll={handleScroll}
		onresize={handleScroll}
		bind:this={fileContentContainer}>
		{#if file}
			{#if displayedFileContent && displayedFileContent.length > 0}
				{#each computedEvents as item (item.id)}
					<div class="flex flex-col">
						<Item {...item} open={item.open} />
						{#if item.children && item.children.length > 0}
							<div class="ml-[2.8rem] border-l border-[#205d84] [border-image:linear-gradient(to_bottom,#205d84,transparent)_1] pb-4 flex flex-col gap-2 children">
								{#each item.children as childItem (childItem.id)}
									<Item {...childItem} child />
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			{:else}
				<div class="flex items-start gap-4 px-4 py-3 border-b border-white/5">
					<div class="flex flex-col gap-1.5">
						<div class="text-[0.95rem] flex items-center gap-2 leading-[1.4]">No logs match the current filters.</div>
					</div>
				</div>
			{/if}
		{:else}
			<div class="flex flex-col items-start gap-4 my-8 mx-auto p-8 rounded-lg bg-white/[0.03] border border-white/10 max-w-[600px]">
				<h2 class="m-0 mb-2 text-[1.6rem] font-medium">🚀 Getting started</h2>
				<ol class="welcome-list list-none pl-0 [counter-reset:welcome-counter] flex flex-col gap-2 mt-4 m-0 text-base font-light leading-[1.6]">
					<li class="inline-block relative pl-[34px] m-0">
						Select your <code class="bg-white/10 px-1.5 py-0.5 rounded font-mono inline text-[1em]">Game.log</code>
						file (sometimes just listed as Game). Usually found at the default path:
						<code class="bg-white/10 px-1.5 py-0.5 rounded font-mono inline text-[1em]">C:\Program Files\Roberts Space Industries\StarCitizen\LIVE\Game.log</code>
						<br />
						(Or the equivalent path on your system if installed elsewhere.)
					</li>
					<li class="inline-block relative pl-[34px] m-0">
						Once a log file is selected and you go <strong>Online</strong>
						(using the top-right button), Picologs automatically connects you with other friends for
						real-time log sharing.
					</li>
					<li class="inline-block relative pl-[34px] m-0">
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
				class="fixed bottom-[50px] w-10 h-10 rounded-full bg-white/10 border border-white/20 backdrop-blur-[10px] shadow-[0_0_10px_rgba(0,0,0,0.1)] flex items-center justify-center text-white cursor-pointer -translate-x-1/2"
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
	/* Custom counter for welcome list */
	.welcome-list li::before {
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

	/* Alternating row background colors */
	:global(.file-content > div:nth-child(2n)) {
		background-color: rgba(255, 255, 255, 0.05);
	}

	/* Children item nested styling */
	:global(.children > .item) {
		padding: 0;
	}
	:global(.children > .item .emoji) {
		font-size: 1.5rem;
	}
	:global(.children > .item .line) {
		font-size: 1rem;
	}
	:global(.children > .item .timestamp) {
		font-size: 0.8rem;
	}
</style>
