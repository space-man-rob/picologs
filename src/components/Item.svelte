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
		if (victimName.includes('kopion')) {
			return 'Kopion';
		}
		if (['PU_Human', '_NPC_'].includes(victimName)) {
			return 'NPC';
		}
		return victimName;
	}
</script>

<button
	class="item grid items-start gap-4 p-4 {child ? 'grid-cols-[1rem_1fr] gap-2 pl-6' : 'grid-cols-[4rem_1fr]'}"
	onclick={() => (open = !open)}
>
	{#if (eventType === 'vehicle_control_flow' || eventType === 'destruction') && shipImage}
		{@const isSoftDeath = eventType === 'destruction' && metadata?.destroyLevelTo === '1'}
		{@const isHardDeath = eventType === 'destruction' && metadata?.destroyLevelTo === '2'}
		<div class="relative flex justify-center overflow-hidden pt-1 self-start h-10 min-h-10">
			{#if isHardDeath}
				<img
					src={shipImage}
					alt={metadata.vehicleName}
					class="absolute top-0 left-1/2 -translate-x-1/2 h-10 w-10 max-w-full -rotate-[15deg] -translate-x-[calc(50%+0.25rem)] object-contain object-center opacity-90 [clip-path:polygon(0_0,50%_0,50%_100%,0%_100%)] [filter:drop-shadow(2px_2px_0_rgba(0,0,0,0.4))_brightness(2)_saturate(1)]"
				/>
				<img
					src={shipImage}
					alt={metadata.vehicleName}
					class="absolute top-0 left-1/2 -translate-x-1/2 h-10 w-10 max-w-full rotate-[15deg] translate-x-[calc(-50%+0.25rem)] object-contain object-center opacity-90 [clip-path:polygon(50%_0,100%_0,100%_100%,50%_100%)] [filter:drop-shadow(2px_2px_0_rgba(0,0,0,0.4))_brightness(2)_saturate(1)]"
				/>
			{:else}
				<img
					src={shipImage}
					alt={metadata.vehicleName}
					class="absolute top-0 left-1/2 -translate-x-1/2 h-10 w-10 max-w-full object-contain object-center [filter:drop-shadow(2px_2px_0_rgba(0,0,0,0.4))_brightness(2)_saturate(1)] {child
						? 'hidden'
						: ''}"
				/>
			{/if}
			{#if eventType === 'destruction'}
				<div
					class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center justify-center {child
						? 'text-xs'
						: 'text-2xl'}"
				>
					{emoji}
				</div>
			{/if}
		</div>
	{:else}
		<div class="flex justify-center pt-1 self-start {child ? 'text-xs' : 'text-2xl'}">{emoji}</div>
	{/if}
	<div>
		{#if eventType === 'actor_death' && metadata.damageType === 'SelfDestruct'}
			{@const zone = metadata.zone.split('_').slice(0, -1).join(' ')}
			<div class="flex items-center {child ? 'gap-1 text-xs' : 'gap-8 text-base'}">
				{checkVictimName(metadata.victimName)} was killed when the {#if zone != 'Unknown'}{zone}{:else}ship{/if} was self
				destructed {#if metadata.killerName != 'unknown'}by {checkVictimName(metadata.killerName)}{/if}
			</div>
		{:else if eventType === 'actor_death' && metadata.damageType === 'Suicide'}
			<div class="flex items-center {child ? 'gap-1 text-xs' : 'gap-8 text-base'}">
				{checkVictimName(metadata.victimName)} committed suicide
			</div>
		{:else if eventType === 'actor_death'}
			{@const weapon = metadata?.weaponClass?.replace('_', ' ')}
			{@const zone = metadata?.zone?.split('_')?.slice(0, -1)?.join(' ')}
			<div class="flex items-center {child ? 'gap-1 text-xs' : 'gap-8 text-base'}">
				{checkVictimName(metadata.victimName)} was killed {#if zone && zone != 'Unknown'}
					while in {zone}{/if} by {checkVictimName(metadata.killerName) || 'unknown'} {#if weapon != 'unknown'}using
					{weapon}{/if}
				{#if metadata.damageType != 'unknown'}
					caused by {convertCamelCaseToWords(metadata.damageType)}{/if}
			</div>
		{:else if eventType === 'vehicle_control_flow'}
			<div class="flex items-center {child ? 'gap-1 text-xs' : 'gap-8 text-base'}">
				{player} controls a {shipName || metadata.vehicleName.split('_').slice(0, -1).join(' ')}
			</div>
		{:else if eventType === 'killing_spree'}
			<div class="flex items-center {child ? 'gap-1 text-xs' : 'gap-8 text-base'}">{line}</div>
		{:else if eventType === 'location_change'}
			<div class="flex items-center {child ? 'gap-1 text-xs' : 'gap-8 text-base'}">
				{player} requested inventory in {metadata.location.split('_').join(' ')}
			</div>
		{:else if eventType === 'system_quit'}
			<div class="flex items-center {child ? 'gap-1 text-xs' : 'gap-8 text-base'}">
				{player} left the game
			</div>
		{:else if eventType === 'corpsify'}
			<div class="flex items-center {child ? 'gap-1 text-xs' : 'gap-8 text-base'}">{line}</div>
		{:else}
			<div class="flex items-center {child ? 'gap-1 text-xs' : 'gap-8 text-base'}">{line}</div>
		{/if}
		<div class="text-white/50 text-left {child ? 'text-[0.5rem]' : 'text-xs'}">
			{formattedTimestamp}, {reportedBy ? reportedBy.join(', ') : player}
		</div>
		{#if open}
			<div class="mt-2 rounded-lg bg-white/10 p-2 text-left text-xs text-white/70">
				{original}
			</div>
		{/if}
	</div>
</button>
