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
		metadata = undefined,
		eventType = undefined,
		reportedBy = undefined,
		child = false
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
			const vehicleNameParts = metadata.vehicleName.split('_');
			// Only pop if the last part is numeric, to avoid removing parts of the name
			if (vehicleNameParts.length > 1 && !isNaN(parseInt(vehicleNameParts[vehicleNameParts.length - 1], 10))) {
				vehicleNameParts.pop();
			}

			// 1. Try direct match with progressive shortening
			let tempParts = [...vehicleNameParts];
			while (tempParts.length > 0) {
				const vehicleNameKey = tempParts.join('_').toLowerCase();
				const ship = fleet[vehicleNameKey as keyof Fleet];
				if (ship) {
					return ship;
				}
				tempParts.pop();
			}

			// 2. If no direct match, fallback to fuzzy search
			const options = [
				{ name: 'name', weight: 0.7 },
				{ name: 'slug', weight: 0.2 },
				{ name: 'erkulIdentifier', weight: 0.1 }
			];

			const fuse = new Fuse(Object.values(fleet), {
				includeScore: true,
				threshold: 0.2,
				keys: options
			});

			tempParts = [...vehicleNameParts];
			while (tempParts.length > 0) {
				const fuzzySearchTerm = tempParts.join(' ');
				const fuzzyShip = fuse.search(fuzzySearchTerm);

				if (fuzzyShip[0]?.item?.fleetData?.variants[0]?.iso_l?.hash) {
					return fuzzyShip[0]?.item;
				}
				tempParts.pop();
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

	function checkVictimName(victimName: string) {
		if (victimName.includes('_') && victimName.includes('kopion')) {
			return 'Kopion';
		}
		if (victimName.includes('_')) {
			return 'NPC';
		}
		return victimName;
	}
</script>

<button class="item" onclick={() => (open = !open)} class:child>
	{#if (eventType === 'vehicle_control_flow' || eventType === 'destruction') && shipImage}
		{@const isSoftDeath = eventType === 'destruction' && metadata?.destroyLevelTo === '1'}
		{@const isHardDeath = eventType === 'destruction' && metadata?.destroyLevelTo === '2'}
		<div class="ship-image">
			{#if isHardDeath}
				<img src={shipImage} alt={metadata.vehicleName} class="hard-left" />
				<img src={shipImage} alt={metadata.vehicleName} class="hard-right" />
			{:else}
				<img src={shipImage} alt={metadata.vehicleName} class:soft={isSoftDeath} />
			{/if}
			{#if eventType === 'destruction'}
				<div class="emoji">{emoji}</div>
			{/if}
		</div>
	{:else}
		<div class="emoji">{emoji}</div>
	{/if}
	<div class="line-container">
		{#if eventType === 'actor_death' && metadata.damageType === 'SelfDestruct'}
			{@const zone = metadata.zone.split('_').slice(0, -1).join(' ')}
			<div class="line">
				{checkVictimName(metadata.victimName)} ({metadata.victimId}) was killed when the {#if zone != 'Unknown'}{zone}{:else}ship{/if} was self
				destructed {#if metadata.killerName != 'unknown'}by {checkVictimName(metadata.killerName)} ({metadata.killerId}){/if}
			</div>
		{:else if eventType === 'actor_death' && metadata.damageType === 'Suicide'}
			<div class="line">{checkVictimName(metadata.victimName)} committed suicide</div>
		{:else if eventType === 'actor_death'}
			{@const weapon = metadata?.weaponClass?.replace('_', ' ')}
			{@const zone = metadata?.zone?.split('_')?.slice(0, -1)?.join(' ')}
			<div class="line">
				{checkVictimName(metadata.victimName)} ({metadata.victimId}) was killed {#if zone && zone != 'Unknown'}
					while in {zone}{/if} by {checkVictimName(metadata.killerName) || 'unknown'} ({metadata.killerId}) {#if weapon != 'unknown'}using
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
		{:else if eventType === 'system_quit'}
			<div class="line">{player} left the game</div>
		{:else}
			<div class="line">{line}</div>
		{/if}
		<div class="timestamp">{formattedTimestamp}, {reportedBy ? reportedBy.join(', ') : player}</div>
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
		align-items: center;
		justify-content: center;
	}

	.ship-image {
		position: relative;
		overflow: visible;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.ship-image img {
		position: absolute;
		width: 4rem;
		height: 4rem;
		object-fit: contain;
		object-position: center;
	}

	.ship-image .emoji {
		position: relative;
		z-index: 1;
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

	.item .ship-image img.soft {
		filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.4)) brightness(0.5) saturate(0.5);
	}

	.item .ship-image img.hard-left,
	.item .ship-image img.hard-right {
		filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.4)) brightness(0.5) saturate(0.5);
		opacity: 0.9;
	}

	.item .ship-image img.hard-left {
		clip-path: polygon(0 0, 50% 0, 50% 100%, 0% 100%);
		transform: scale(1) rotate(-25deg) translateX(-1rem);
	}

	.item .ship-image img.hard-right {
		clip-path: polygon(50% 0, 100% 0, 100% 100%, 50% 100%);
		transform: scale(1) rotate(25deg) translateX(1rem);
	}

	.item.child {
		padding-left: 1.4rem;
		grid-template-columns: 1rem 1fr;
		gap: 0.5rem;
	
	}

	.item.child .emoji {
		font-size: 0.8rem;
	}

	.item.child .ship-image img {
		display: none;
	}

	.item.child .line {
		gap: 0.2rem;
		font-size: 0.8rem;
	}

	.item.child .timestamp {
		display: none;
	}
</style>
