<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import Item from './Item.svelte';
	import { ArrowDown } from '@lucide/svelte';
	import { fade } from 'svelte/transition';
	import TimelineFilters from './TimelineFilters.svelte';
	import { getCurrentWindow } from '@tauri-apps/api/window';

	let { fileContent, file }: { fileContent: any[]; file: string | null } = $props();

	let atTheBottom = $state(false);

	$inspect(atTheBottom);

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
	let displayedFileContent = $state<any[]>([]);

	let unlisten: () => void;
	onMount(async () => {
		displayedFileContent = [...fileContent];
		tick().then(() => {
			fileContentContainer?.scrollTo({
				top: fileContentContainer.scrollHeight,
				behavior: 'smooth'
			});
		});

		unlisten = await getCurrentWindow().onResized(() => {
			if (fileContentContainer) {
				hasScrollbar =
					fileContentContainer.scrollTop + fileContentContainer.clientHeight <
					fileContentContainer.scrollHeight;
				atTheBottom =
					fileContentContainer.scrollTop + fileContentContainer.clientHeight >=
					fileContentContainer.scrollHeight - 5;
			}
		});
	});

	onDestroy(() => {
		unlisten?.();
	});

	let wasAtTheBottom = $state(false);
	$effect(() => {
		wasAtTheBottom = atTheBottom;
		displayedFileContent = [...fileContent];
	});

	$inspect('displayedFileContent', displayedFileContent);

	$effect(() => {
		if (fileContentContainer && displayedFileContent.length > 0 && wasAtTheBottom) {
			console.log('scrolling to bottom');
			tick().then(() => {
				fileContentContainer?.scrollTo({
					top: fileContentContainer.scrollHeight,
					behavior: 'smooth'
				});
			});
		}
	});
</script>

<div class="timeline-container">
	<div class="timeline-filters">
		<TimelineFilters />
	</div>

	<div
		class="file-content"
		onscroll={handleScroll}
		onresize={handleScroll}
		bind:this={fileContentContainer}>
		{#if file}
			{#if displayedFileContent && displayedFileContent.length > 0}
				{#each displayedFileContent as item, index (item.id)}
					{#if index === 0 || displayedFileContent[index - 1]?.line !== item.line || displayedFileContent[index - 1]?.timestamp !== item.timestamp}
						<div>
							<Item {...item} bind:open={item.open} />
						</div>
					{/if}
				{/each}
			{:else}
				<div class="item">
					<div class="line-container">
						<div class="line">No new logs yet. Waiting for game activity...</div>
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
	.timeline-container {
		display: grid;
		grid-template-columns: 1fr;
		grid-template-rows: 50px 1fr;
		grid-column-gap: 0px;
		grid-row-gap: 0px;
	}

	.timeline-filters {
		height: 50px;
		background-color: rgba(255, 255, 255, 0.05);
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
		left: calc(290px + (100dvw - 290px) / 2); /* Center of the right panel */
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

	:global(.file-content div:nth-child(2n) .item) {
		background-color: rgba(255, 255, 255, 0.05);
	}
</style>
