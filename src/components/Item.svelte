<script lang="ts">
    import { formatDistance } from 'date-fns';
    import { onMount, onDestroy } from 'svelte';

    let { open = $bindable(), emoji, line, timestamp, original, player } = $props();

    const formatDate = (date: string) => {
        return formatDistance(new Date(date), new Date(), { addSuffix: true });
    };

    let formattedTimestamp = $state(formatDate(timestamp));
    let intervalId: ReturnType<typeof setInterval> | null = null;

    onMount(() => {
        // Update every minute
        intervalId = setInterval(() => {
            formattedTimestamp = formatDate(timestamp);
        }, 60000);
        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    });

    onDestroy(() => {
        if (intervalId) clearInterval(intervalId);
    });
</script>

<button class="item" onclick={() => open = !open}>
    <div class="emoji">{emoji}</div>
    <div class="line-container">
        <div class="line">{line}</div>
        <div class="timestamp">{formattedTimestamp}, {player}</div>
        {#if open}
            <div class="original">{original}</div>
        {/if}
    </div>
</button>


<style>
    
	.item {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
	}
    
    .emoji {
		font-size: 1.5rem;
	}

	.line {
		font-size: 1rem;
		display: flex;
		align-items: center;
		gap: 2rem;
	}

	.timestamp {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.5);
	}
</style>