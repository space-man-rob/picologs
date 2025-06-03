<!-- ResizableGrid.svelte -->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte'; // Still used for window event listener cleanup
	import type { Snippet } from 'svelte'; // Import the Snippet type
	import { Store, load as loadStore } from '@tauri-apps/plugin-store'; // Renamed load to avoid conflict with any Svelte load

	// --- Props ---
	let { leftPanel, rightPanel, initialLeftWidth = 230, initialRightWidth = 500 }: { leftPanel: Snippet, rightPanel: Snippet, initialLeftWidth?: number, initialRightWidth?: number } = $props();

	// --- TypeScript Interfaces ---
	interface Column {
		id: string;
		width: number;
		content: Snippet; // Content is now a Svelte Snippet
		collapsed: boolean;
	}

	
	// --- Svelte 5 Runes for State ---
	let columns = $state<Column[]>([
		{ id: 'col1', width: initialLeftWidth, content: leftPanel, collapsed: false },
		{ id: 'col2', width: initialRightWidth, content: rightPanel, collapsed: false }
	]);

	const resizerWidth: number = 3; // px, thinner resizer
	const minColumnWidth: number = 50; // px
	const snapThreshold: number = 20; // px

	let currentResizerIndex = $state<number>(-1);
	let initialMouseX = $state<number>(0);
	let initialLeftColWidth = $state<number>(0);
	let initialRightColWidth = $state<number>(0); // Store initial right width for total width fallback
	let isDragging = $state<boolean>(false);

	let gridContainerRef: HTMLDivElement; // To get total width of the grid

	// --- Tauri Store ---
	let store: Store | null = $state(null); // Store will be loaded in onMount
	const STORE_FILE_NAME = 'store.json';
	const LEFT_WIDTH_KEY = 'resizerLeftPanelWidth';
	const RIGHT_WIDTH_KEY = 'resizerRightPanelWidth';

	// --- Svelte 5 Rune for Derived State ---
	const gridTemplateColumnsStyle = $derived(
		`${columns[0].width}px ${resizerWidth}px 1fr` // Right column is 1fr
	);

	// --- Event Handlers ---
	function handleResizerMouseDown(event: MouseEvent, resizerIndex: number): void {
		event.preventDefault();
		isDragging = true;
		currentResizerIndex = resizerIndex; // Should be 0 for the setup with one resizer
		initialMouseX = event.clientX;
		initialLeftColWidth = columns[0].width;
		initialRightColWidth = columns[1].width; // Store for fallback total width calculation

		window.addEventListener('mousemove', handleWindowMouseMove);
		window.addEventListener('mouseup', handleWindowMouseUp);
	}

	function handleWindowMouseMove(event: MouseEvent): void {
		if (!isDragging || currentResizerIndex !== 0) return; // Only operate on the first resizer

		const deltaX = event.clientX - initialMouseX;
		let newLeftWidth = initialLeftColWidth + deltaX;
		let newRightWidth = 0; // This will be calculated based on total width and newLeftWidth

		const totalWidth = gridContainerRef ? gridContainerRef.offsetWidth : (initialLeftColWidth + initialRightColWidth + resizerWidth);

		// Snap logic
		if (newLeftWidth < snapThreshold && deltaX < 0) { // Attempting to collapse left panel
			newLeftWidth = 0;
		} else if (totalWidth - newLeftWidth - resizerWidth < snapThreshold && deltaX > 0) { // Attempting to collapse right panel by dragging resizer to the right
			newLeftWidth = totalWidth - resizerWidth; // Left panel takes all available space minus resizer
		} else {
			// Apply minimum width constraints if not snapping to zero
			if (newLeftWidth < minColumnWidth) {
				newLeftWidth = minColumnWidth;
			}
			// Ensure left column doesn't expand so much that the right (1fr) column goes below its min width
			if (totalWidth - newLeftWidth - resizerWidth < minColumnWidth) {
				newLeftWidth = totalWidth - minColumnWidth - resizerWidth;
			}
		}

		// Clamp newLeftWidth to be within [0, totalWidth - resizerWidth]
		newLeftWidth = Math.max(0, newLeftWidth);
		newLeftWidth = Math.min(newLeftWidth, totalWidth - resizerWidth);

		newRightWidth = totalWidth - newLeftWidth - resizerWidth;
		// Ensure newRightWidth is not negative (can happen with rounding or if totalWidth is small)
		newRightWidth = Math.max(0, newRightWidth);

		columns[0].width = newLeftWidth;
		columns[1].width = newRightWidth; // Update state with the calculated effective width of the right panel

		columns[0].collapsed = newLeftWidth === 0;
		columns[1].collapsed = newRightWidth < minColumnWidth; // Right panel considered collapsed if its effective width is less than minColumnWidth
	}

	function handleWindowMouseUp(): void {
		if (!isDragging) return;
		isDragging = false;
		currentResizerIndex = -1;
		window.removeEventListener('mousemove', handleWindowMouseMove);
		window.removeEventListener('mouseup', handleWindowMouseUp);

		// Persist to store on mouse up
		saveLayout();
	}

	async function saveLayout() {
		if (!store) return;
		await store.set(LEFT_WIDTH_KEY, columns[0].width);
		await store.set(RIGHT_WIDTH_KEY, columns[1].width);
		await store.save(); // Explicitly save the store
	}

	onDestroy(() => {
		window.removeEventListener('mousemove', handleWindowMouseMove);
		window.removeEventListener('mouseup', handleWindowMouseUp);
	});

	onMount(async () => {
		try {
			store = await loadStore(STORE_FILE_NAME);
			const loadedLeftWidth = await store.get<number>(LEFT_WIDTH_KEY);
			const loadedRightWidth = await store.get<number>(RIGHT_WIDTH_KEY);

			// Use loaded values if they exist and are valid numbers, otherwise use initial props
			const newLeftWidth = (loadedLeftWidth !== null && typeof loadedLeftWidth === 'number') ? loadedLeftWidth : initialLeftWidth;
			const newRightWidth = (loadedRightWidth !== null && typeof loadedRightWidth === 'number') ? loadedRightWidth : initialRightWidth;

			columns[0].width = newLeftWidth;
			columns[1].width = newRightWidth;

			// Recalculate collapsed state based on loaded/defaulted widths
			columns[0].collapsed = newLeftWidth === 0;
			columns[1].collapsed = newRightWidth < minColumnWidth;

		} catch (error) {
			console.error("Failed to load layout from store:", error);
			// Fallback to initial props if store interaction fails or store is new
			columns[0].width = initialLeftWidth;
			columns[1].width = initialRightWidth;
			columns[0].collapsed = initialLeftWidth === 0;
			columns[1].collapsed = initialRightWidth < minColumnWidth;

			// If the store didn't exist, it might have been created now, try to assign it
			if (!store) {
				try {
					store = await loadStore(STORE_FILE_NAME);
				} catch (e) {
					console.error("Failed to initialize store after error:", e);
				}
			}
		}
	});
</script>

<!-- Component HTML Template -->
<div class="resizable-grid-component-container">
	<div
		class="grid-container"
		bind:this={gridContainerRef}
		style:grid-template-columns={gridTemplateColumnsStyle}
		class:dragging={isDragging}>
		{#each columns as col, i (col.id)}
			<div class="grid-item" class:collapsed={col.collapsed}>
				{#if !col.collapsed}
					<div class="grid-item-content-wrapper">
						{@render col.content()}
					</div>
				{/if}
			</div>

			{#if i < columns.length - 1}
				<button
					class="resizer"
					onmousedown={(event) => handleResizerMouseDown(event, i)}
					aria-label={`Resize columns ${col.id} and ${columns[i + 1].id}`}>
				</button>
			{/if}
		{/each}
	</div>
</div>

<!-- Component Styles (No Tailwind) -->
<style>
	/* General container for the whole component for centering and padding */
	.resizable-grid-component-container {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		height: 100%;
		width: 100%;
	}

	/* Grid container styling */
	.grid-container {
		display: grid;
		gap: 0; /* Resizers are their own tracks */
		grid-template-rows: 1fr;
		overflow: hidden;
	}

	/* When dragging, apply cursor styles to the container and its children */
	.grid-container.dragging,
	.grid-container.dragging :global(*) {
		cursor: ew-resize !important;
		user-select: none !important;
		-webkit-user-select: none !important;
		-moz-user-select: none !important;
		-ms-user-select: none !important;
	}

	/* Grid item styling */
	.grid-item {
		display: flex;
		overflow: hidden;
		transition:
			padding 0.1s ease-out,
			font-size 0.1s ease-out;
		height: 100%;
	}

	.grid-item-content-wrapper {
		overflow: auto;
		width: 100%;
		height: 100%;
		box-sizing: border-box;
	}

	.grid-item.collapsed {
		padding: 0 !important;
		font-size: 0 !important;
	}

	.grid-item.collapsed > * {
		display: none;
	}

	/* Resizer styling */
	.resizer {
		background-color: rgba(255, 255, 255, 0.2);
		cursor: ew-resize;
		user-select: none;
		-webkit-user-select: none;
		-moz-user-select: none;
		-ms-user-select: none;
		transition: background-color 0.2s ease;
		z-index: 10;
	}
    
	.resizer:hover {
		background-color: rgba(255, 255, 255, 0.4);
	}
</style>
