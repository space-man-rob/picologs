<script lang="ts">
	import { formatDistance } from 'date-fns';
	import { onMount, onDestroy } from 'svelte';
	import Fuse from 'fuse.js';
	import fleet from '../libs/fleet.json';

	let {
		open = $bindable(),
		emoji,
		line,
		timestamp,
		original,
		player,
		metadata,
		eventType
	} = $props();

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

	function convertCamelCaseToWords(str: string) {
		return str
			?.replace(/([A-Z])/g, ' $1')
			?.replace(/^./, function (str) {
				return str.toUpperCase();
			})
			?.toLowerCase();
	}

	onDestroy(() => {
		if (intervalId) clearInterval(intervalId);
	});

	type Fleet = typeof fleet;

	function getShipData(metadata: any) {
		if (metadata?.vehicleName) {
			const vehicleName = metadata.vehicleName.split('_').slice(0, -1).join('_').toLowerCase();
			const ship = fleet[vehicleName as keyof Fleet];

			if (ship) {
				return ship;
			}

			const options = [
				{ name: 'name', weight: 0.5 },
				{ name: 'slug', weight: 0.3 },
				{ name: 'erkulIdentifier', weight: 0.1 },
				{ name: 'scIdentifier', weight: 0.1 },
				{ name: 'manufacturer.code', weight: 0.1 }
			];

			const fuse = new Fuse(Object.values(fleet), {
				includeScore: true,
				threshold: 0.4,
				keys: options
			});

			const fuzzyShip = fuse.search(vehicleName.replace(/_/g, ' '));

			if (fuzzyShip[0]?.item?.fleetData?.variants[0]?.iso_l?.hash) {
				return fuzzyShip[0]?.item;
			}
		}
		return null;
	}

	let shipData = $state(getShipData(metadata));
	let shipImage = $derived(
		shipData?.slug && shipData?.fleetData?.variants[0]?.iso_l?.hash
			? `https://fleetviewer.link/fleetpics%2F${shipData.slug}__iso_l_${shipData.fleetData.variants[0]?.iso_l?.hash}.png?alt=media`
			: null
	);
	let shipName = $derived(shipData ? shipData.name : null);
</script>

<button class="item" onclick={() => (open = !open)}>
	{#if eventType === 'vehicle_control_flow' && shipImage}
		<div class="ship-image"><img src={shipImage} alt={metadata.vehicleName} /></div>
	{:else}
		<div class="emoji">{emoji}</div>
	{/if}
	<div class="line-container">
		{#if eventType === 'actor_death' && metadata.damageType === 'SelfDestruct'}
			{@const zone = metadata.zone.split('_').slice(0, -1).join(' ')}
			<div class="line">
				{metadata.victimName} ({metadata.victimId}) was killed when the {#if zone != 'Unknown'}{zone}{:else}ship{/if} was self
				destructed {#if metadata.killerName != 'unknown'}by {metadata.killerName} ({metadata.killerId}){/if}
			</div>
		{:else if eventType === 'actor_death' && metadata.damageType === 'Suicide'}
			<div class="line">{metadata.victimName} committed suicide</div>
		{:else if eventType === 'actor_death'}
			{@const weapon = metadata?.weaponClass?.replace('_', ' ')}
			{@const zone = metadata?.zone?.split('_')?.slice(0, -1)?.join(' ')}
			<div class="line">
				{metadata.victimName} ({metadata.victimId}) was killed {#if zone && zone != 'Unknown'}
					while in {zone}{/if} by {metadata.killerName || 'unknown'} ({metadata.killerId}) {#if weapon != 'unknown'}using
					{weapon}{/if}
				{#if metadata.damageType != 'unknown'}
					caused by {convertCamelCaseToWords(metadata.damageType)}{/if}
			</div>
		{:else if eventType === 'vehicle_control_flow'}
			<div class="line">
				{player} controls a {shipName || metadata.vehicleName.split('_').slice(0, -1).join(' ')} ({metadata.vehicleId})
			</div>
		{:else if eventType === 'location_change'}
			<div class="line">
				{player} requested inventory in {metadata.location.split('_').join(' ')}
			</div>
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
		display: grid;
		grid-template-columns: 4rem 1fr;
		grid-template-rows: auto;
		gap: 1rem;
		padding: 1rem;
	}

	.emoji {
		font-size: 1.5rem;
		display: flex;
		align-items: top;
		justify-content: center;
	}

	.ship-image {
		position: relative;
		overflow: visible;
		display: flex;
		align-items: center;
		justify-content: center;

		/* background glow */
	}

	.ship-image img {
		position: absolute;
		width: 4rem;
		height: 4rem;
		object-fit: contain;
		object-position: center;
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
		color: rgba(255, 255, 255, 0.7);
		background-color: rgba(255, 255, 255, 0.1);
		padding: 0.5rem;
		border-radius: 0.5rem;
		margin-top: 0.5rem;
		display: inline-block;
	}

	.item .ship-image img {
		filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.4));
		transform: scale(1.2);
	}
</style>
