<script lang="ts">
	let { count = 3 } = $props();
</script>

<div class="flex flex-col px-2 pb-2 gap-1">
	<!-- eslint-disable-next-line @typescript-eslint/no-unused-vars -->
	{#each Array(count) as _, i (i)}
		<div class="flex items-center gap-3 p-2 rounded-lg animate-pulse">
			<!-- Avatar skeleton -->
			<div class="w-10 h-10 rounded-full bg-overlay-light flex-shrink-0"></div>

			<!-- Text skeleton -->
			<div class="flex flex-col gap-2 flex-1">
				<div class="h-3 bg-overlay-light rounded w-3/4"></div>
				<div class="h-2 bg-overlay-subtle rounded w-1/2"></div>
			</div>
		</div>
	{/each}
</div>

<style>
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.animate-pulse {
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}
</style>
