<script lang="ts">
    import { formatDistance } from 'date-fns';
    import { onMount, onDestroy } from 'svelte';

    let { open = $bindable(), emoji, line, timestamp, original, player, metadata, eventType } = $props();

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
        {#if eventType === 'actor_death' && metadata.damageType === 'SelfDestruct'}
            {@const zone = metadata.zone.split('_').slice(0, -1).join(' ')}
            <div class="line">{metadata.victimName} was killed when the {#if zone != 'Unknown'}{zone}{:else}ship{/if} was self destructed {#if metadata.killerName != 'unknown'}by {metadata.killerName} ({metadata.killerId}){/if}</div>
        {:else if eventType === 'actor_death' && metadata.damageType === 'Suicide'}
            <div class="line">{metadata.victimName} committed suicide</div>
        {:else if eventType === 'actor_death'}
            {@const weapon = metadata.weaponClass.replace('_', ' ')}
            {@const zone = metadata.zone.split('_').slice(0, -1).join(' ')}
            <div class="line">{metadata.victimName} was killed by {metadata.killerName || "unknown"} {#if weapon != 'unknown'}using {weapon}{/if}  {#if zone != 'Unknown'} in {zone}{/if}</div>
        {:else if eventType === 'vehicle_control_flow'}
            <div class="line">{player} took control of {metadata.vehicleName.split('_').slice(0, -1).join(' ')} ({metadata.vehicleId})</div>
        {:else}
            <div class="line">{line}</div>
        {/if}
        <div class="timestamp">{formattedTimestamp}, {player}</div>
        {#if open}
            <div class="original">{original}</div>
        {/if}
    </div>
</button>


<style>
    
	.item {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		padding: 1rem;
	}
    
    .emoji {
		font-size: 1.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
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

    .original {
        font-size: 0.7rem;
        color: rgba(255, 255, 255, .7);
        background-color: rgba(255, 255, 255, 0.1);
        padding: 0.5rem;
        border-radius: 0.5rem;
        margin-top: 0.5rem;
    }
</style>