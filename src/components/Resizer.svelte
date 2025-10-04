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
		// Store strategy: Panel width changes happen during drag, so autoSave is already enabled
		// The 200ms debounce ensures we don't write on every mousemove, only after drag completes
		await store.set(LEFT_WIDTH_KEY, columns[0].width);
		await store.set(RIGHT_WIDTH_KEY, columns[1].width);
		// No explicit save needed - autoSave handles persistence with debounce
	}

	onDestroy(() => {
		window.removeEventListener('mousemove', handleWindowMouseMove);
		window.removeEventListener('mouseup', handleWindowMouseUp);
	});

	onMount(async () => {
		try {
			// Store strategy: Use autoSave with 200ms debounce for resizer panel widths
			// This batches multiple panel width updates during drag operations
			store = await loadStore(STORE_FILE_NAME, { defaults: {}, autoSave: 200 });
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
					store = await loadStore(STORE_FILE_NAME, { defaults: {}, autoSave: 200 });
				} catch (e) {
					console.error("Failed to initialize store after error:", e);
				}
			}
		}
	});
</script>

<!-- Component HTML Template -->
<div class="flex flex-col items-stretch h-full w-full">
	<div
		class="grid gap-0 grid-rows-[1fr] overflow-hidden h-full {isDragging ? 'dragging' : ''}"
		bind:this={gridContainerRef}
		style:grid-template-columns={gridTemplateColumnsStyle}>
		{#each columns as col, i (col.id)}
			<div class="flex overflow-hidden transition-[padding,font-size] duration-100 ease-out h-full {col.collapsed ? '!p-0 !text-[0px]' : ''}">
				{#if !col.collapsed}
					<div class="overflow-auto w-full h-full box-border">
						{@render col.content()}
					</div>
				{:else}
					<div class="hidden"></div>
				{/if}
			</div>

			{#if i < columns.length - 1}
				<button
					class="bg-white/20 cursor-ew-resize select-none transition-colors duration-200 z-10 hover:bg-white/40"
					onmousedown={(event) => handleResizerMouseDown(event, i)}
					aria-label={`Resize columns ${col.id} and ${columns[i + 1].id}`}>
				</button>
			{/if}
		{/each}
	</div>
</div>

<!-- Minimal custom CSS for dragging cursor on all descendants -->
<style>
	.dragging,
	.dragging :global(*) {
		cursor: ew-resize !important;
		user-select: none !important;
	}
</style>
