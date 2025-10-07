<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import { Store, load as loadStore } from '@tauri-apps/plugin-store';

	let { topPanel, bottomPanel, storeKey }: { topPanel: Snippet, bottomPanel: Snippet, storeKey: string } = $props();

	const resizerHeight = 3; // px
	const minPanelHeight = 50; // px
	const snapThreshold = 20; // px

	let topHeightPercent = $state(50); // Initial height as percentage (0-100)
	let isDragging = $state(false);
	let initialMouseY = $state(0);
	let initialTopHeightPercent = $state(0);
	let containerRef: HTMLDivElement;
	let store: Store | null = $state(null);
	let containerHeight = $state(0); // Track container height for reactivity
	let dragTopHeightPx = $state<number | null>(null); // Override during drag

	function handleResizerMouseDown(event: MouseEvent): void {
		event.preventDefault();

		// Ensure containerHeight is current before starting drag
		if (containerRef) {
			containerHeight = containerRef.offsetHeight;
		}

		isDragging = true;
		initialMouseY = event.clientY;
		initialTopHeightPercent = topHeightPercent;

		// Set initial drag value to current calculated height to prevent jump
		if (containerHeight > 0) {
			dragTopHeightPx = (topHeightPercent / 100) * containerHeight;
		}

		console.log('[VerticalResizer] MouseDown:', {
			containerHeight,
			topHeightPercent,
			dragTopHeightPx,
			calculatedFromDerived: (topHeightPercent / 100) * containerHeight
		});

		window.addEventListener('mousemove', handleWindowMouseMove);
		window.addEventListener('mouseup', handleWindowMouseUp);
	}

	function handleWindowMouseMove(event: MouseEvent): void {
		if (!isDragging || !containerRef) return;

		const totalHeight = containerHeight || containerRef.offsetHeight;
		const deltaY = event.clientY - initialMouseY;

		// Convert initial percent to pixels, add delta
		const initialTopHeightPx = (initialTopHeightPercent / 100) * totalHeight;
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

		// Store pixel value during drag
		dragTopHeightPx = newTopHeightPx;
	}

	function handleWindowMouseUp(): void {
		if (!isDragging) return;
		isDragging = false;

		// Convert final pixel value to percentage for storage
		if (dragTopHeightPx !== null && containerHeight > 0) {
			topHeightPercent = (dragTopHeightPx / containerHeight) * 100;
		}
		dragTopHeightPx = null;

		window.removeEventListener('mousemove', handleWindowMouseMove);
		window.removeEventListener('mouseup', handleWindowMouseUp);
		saveLayout();
	}

	async function saveLayout() {
		if (!store) return;
		await store.set(storeKey, topHeightPercent);
	}

	// Update containerHeight immediately when ref is bound
	$effect(() => {
		if (containerRef && containerHeight === 0) {
			containerHeight = containerRef.offsetHeight;
			console.log('[VerticalResizer] $effect set containerHeight:', containerHeight);
		}
	});

	onDestroy(() => {
		window.removeEventListener('mousemove', handleWindowMouseMove);
		window.removeEventListener('mouseup', handleWindowMouseUp);
	});

	onMount(async () => {
		// Set initial container height immediately
		if (containerRef) {
			containerHeight = containerRef.offsetHeight;
			console.log('[VerticalResizer] onMount containerHeight:', containerHeight);
		}

		try {
			store = await loadStore('store.json', { defaults: {}, autoSave: 200 });
			const loadedPercent = await store.get<number>(storeKey);
			console.log('[VerticalResizer] Loaded percent from store:', loadedPercent);
			if (loadedPercent !== null && typeof loadedPercent === 'number') {
				topHeightPercent = loadedPercent;
				console.log('[VerticalResizer] Set topHeightPercent to:', topHeightPercent);
			}
		} catch (error) {
			console.log('[VerticalResizer] Store load error:', error);
		}

		// Update container height on resize (but not while dragging)
		const resizeObserver = new ResizeObserver(() => {
			if (containerRef && !isDragging) {
				containerHeight = containerRef.offsetHeight;
			}
		});

		if (containerRef) {
			resizeObserver.observe(containerRef);
		}

		return () => {
			resizeObserver.disconnect();
		};
	});

	// Calculate pixel height from percentage when container is available
	const topHeightPx = $derived.by(() => {
		// Use drag value if dragging
		if (dragTopHeightPx !== null) {
			return dragTopHeightPx;
		}

		if (!containerRef || containerHeight === 0) {
			console.log('[VerticalResizer] Using fallback 200px, containerHeight:', containerHeight);
			return 200; // fallback
		}
		const calculated = (topHeightPercent / 100) * containerHeight;
		return calculated;
	});

	const gridTemplateRowsStyle = $derived(`${topHeightPx}px ${resizerHeight}px 1fr`);
</script>

<div
	class="grid gap-0 h-full w-full {isDragging ? 'dragging' : ''}"
	bind:this={containerRef}
	style:grid-template-rows={gridTemplateRowsStyle}
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
