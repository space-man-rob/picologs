<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import { Store, load as loadStore } from '@tauri-apps/plugin-store';

	let { topPanel, bottomPanel, storeKey }: { topPanel: Snippet, bottomPanel: Snippet, storeKey: string } = $props();

	const resizerHeight = 3; // px
	const minPanelHeight = 50; // px
	const snapThreshold = 20; // px

	let topHeight = $state(200); // Initial height in pixels
	let isDragging = $state(false);
	let initialMouseY = $state(0);
	let initialTopHeight = $state(0);
	let containerRef: HTMLDivElement;
	let store: Store | null = $state(null);

	function handleResizerMouseDown(event: MouseEvent): void {
		event.preventDefault();
		isDragging = true;
		initialMouseY = event.clientY;
		initialTopHeight = topHeight;

		window.addEventListener('mousemove', handleWindowMouseMove);
		window.addEventListener('mouseup', handleWindowMouseUp);
	}

	function handleWindowMouseMove(event: MouseEvent): void {
		if (!isDragging) return;

		const deltaY = event.clientY - initialMouseY;
		let newTopHeight = initialTopHeight + deltaY;

		const totalHeight = containerRef ? containerRef.offsetHeight : 400;

		// Snap logic
		if (newTopHeight < snapThreshold && deltaY < 0) {
			newTopHeight = 0;
		} else if (totalHeight - newTopHeight - resizerHeight < snapThreshold && deltaY > 0) {
			newTopHeight = totalHeight - resizerHeight;
		} else {
			// Apply minimum height constraints
			if (newTopHeight < minPanelHeight) {
				newTopHeight = minPanelHeight;
			}
			if (totalHeight - newTopHeight - resizerHeight < minPanelHeight) {
				newTopHeight = totalHeight - minPanelHeight - resizerHeight;
			}
		}

		newTopHeight = Math.max(0, newTopHeight);
		newTopHeight = Math.min(newTopHeight, totalHeight - resizerHeight);

		topHeight = newTopHeight;
	}

	function handleWindowMouseUp(): void {
		if (!isDragging) return;
		isDragging = false;
		window.removeEventListener('mousemove', handleWindowMouseMove);
		window.removeEventListener('mouseup', handleWindowMouseUp);
		saveLayout();
	}

	async function saveLayout() {
		if (!store) return;
		await store.set(storeKey, topHeight);
	}

	onDestroy(() => {
		window.removeEventListener('mousemove', handleWindowMouseMove);
		window.removeEventListener('mouseup', handleWindowMouseUp);
	});

	onMount(async () => {
		try {
			store = await loadStore('store.json', { defaults: {}, autoSave: 200 });
			const loadedHeight = await store.get<number>(storeKey);
			if (loadedHeight !== null && typeof loadedHeight === 'number') {
				topHeight = loadedHeight;
			}
		} catch (error) {
			// Silent failure - will use defaults
		}
	});

	const gridTemplateRowsStyle = $derived(`${topHeight}px ${resizerHeight}px 1fr`);
</script>

<div
	class="grid gap-0 h-full w-full {isDragging ? 'dragging' : ''}"
	bind:this={containerRef}
	style:grid-template-rows={gridTemplateRowsStyle}
>
	<div class="overflow-auto">
		{@render topPanel()}
	</div>

	<button
		class="bg-transparent cursor-ns-resize select-none transition-colors duration-200 hover:bg-white/40 border-t border-black/20"
		onmousedown={handleResizerMouseDown}
		aria-label="Resize panels"
	>
	</button>

	<div class="overflow-auto">
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
