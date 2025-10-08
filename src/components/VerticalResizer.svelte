<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { Snippet } from 'svelte';
	import { Store, load as loadStore } from '@tauri-apps/plugin-store';

	let { topPanel, bottomPanel, storeKey }: { topPanel: Snippet, bottomPanel: Snippet, storeKey: string } = $props();

	const resizerHeight = 3; // px
	const minPanelHeight = 50; // px
	const snapThreshold = 20; // px

	let topHeightPx = $state(200); // Direct pixel value
	let isDragging = $state(false);
	let initialMouseY = $state(0);
	let initialTopHeightPx = $state(0);
	let containerRef: HTMLDivElement;
	let containerHeight = 0; // Track via callback, not reactive
	let store: Store | null = $state(null);

	// Callback when container height changes
	function handleContainerResize(node: HTMLDivElement) {
		const resizeObserver = new ResizeObserver(() => {
			if (!isDragging) {
				const oldHeight = containerHeight;
				const newHeight = node.offsetHeight;

				if (oldHeight > 0 && newHeight > 0) {
					// Maintain the same percentage when container resizes
					const currentPercent = (topHeightPx / oldHeight) * 100;
					topHeightPx = (currentPercent / 100) * newHeight;
				}

				containerHeight = newHeight;
			}
		});

		// Initial setup
		containerHeight = node.offsetHeight;
		resizeObserver.observe(node);

		// Load saved position once we know the height
		loadStore('store.json', { defaults: {}, autoSave: 200 })
			.then(async (s) => {
				store = s;
				const loadedPercent = await store.get<number>(storeKey);
				if (loadedPercent !== null && typeof loadedPercent === 'number' && containerHeight > 0) {
					topHeightPx = (loadedPercent / 100) * containerHeight;
				}
			})
			.catch(error => {
				console.error('[VerticalResizer] Store load error:', error);
			});

		return {
			destroy() {
				resizeObserver.disconnect();
			}
		};
	}

	function handleResizerMouseDown(event: MouseEvent): void {
		event.preventDefault();

		isDragging = true;
		initialMouseY = event.clientY;
		initialTopHeightPx = topHeightPx;

		window.addEventListener('mousemove', handleWindowMouseMove);
		window.addEventListener('mouseup', handleWindowMouseUp);
	}

	function handleWindowMouseMove(event: MouseEvent): void {
		if (!isDragging) return;

		const totalHeight = containerHeight;
		const deltaY = event.clientY - initialMouseY;
		let newTopHeightPx = initialTopHeightPx + deltaY;

		// Snap logic (in pixels)
		if (newTopHeightPx < snapThreshold && deltaY < 0) {
			newTopHeightPx = 0;
		} else if (totalHeight - newTopHeightPx - resizerHeight < snapThreshold && deltaY > 0) {
			newTopHeightPx = totalHeight - resizerHeight;
		} else {
			// Apply minimum height constraints
			if (newTopHeightPx < minPanelHeight) {
				newTopHeightPx = minPanelHeight;
			}
			if (totalHeight - newTopHeightPx - resizerHeight < minPanelHeight) {
				newTopHeightPx = totalHeight - minPanelHeight - resizerHeight;
			}
		}

		newTopHeightPx = Math.max(0, newTopHeightPx);
		newTopHeightPx = Math.min(newTopHeightPx, totalHeight - resizerHeight);

		topHeightPx = newTopHeightPx;
	}

	function handleWindowMouseUp(): void {
		if (!isDragging) return;
		isDragging = false;

		window.removeEventListener('mousemove', handleWindowMouseMove);
		window.removeEventListener('mouseup', handleWindowMouseUp);
		saveLayout();
	}

	async function saveLayout() {
		if (!store || containerHeight === 0) return;
		const percentToSave = (topHeightPx / containerHeight) * 100;
		await store.set(storeKey, percentToSave);
	}

	onDestroy(() => {
		window.removeEventListener('mousemove', handleWindowMouseMove);
		window.removeEventListener('mouseup', handleWindowMouseUp);
	});
</script>

<div
	class="grid gap-0 h-full w-full {isDragging ? 'dragging' : ''}"
	bind:this={containerRef}
	use:handleContainerResize
	style="grid-template-rows: {topHeightPx}px {resizerHeight}px 1fr"
>
	<div class="overflow-hidden">
		{@render topPanel()}
	</div>

	<button
		class="bg-transparent cursor-ns-resize select-none transition-colors duration-200 hover:bg-white/40 border-t border-black/20"
		onmousedown={handleResizerMouseDown}
		aria-label="Resize panels"
	>
	</button>

	<div class="overflow-hidden">
		{@render bottomPanel()}
	</div>
</div>

<style>
	.dragging,
	.dragging :global(*) {
		cursor: ns-resize !important;
		user-select: none !important;
	}
</style>
