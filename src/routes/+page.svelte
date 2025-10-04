<script lang="ts">
	import { readTextFile, watchImmediate, writeFile } from '@tauri-apps/plugin-fs';
	import { load } from '@tauri-apps/plugin-store';
	import { open } from '@tauri-apps/plugin-dialog';
	import Item from '../components/Item.svelte';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import Friends from '../components/Friends.svelte';
	import User from '../components/User.svelte';
	import AddFriend from '../components/AddFriend.svelte';
	import type { Log, Friend as FriendType } from '../types';
	import { appDataDir } from '@tauri-apps/api/path';
	import Resizer from '../components/Resizer.svelte';
	import {
		sendFriendRequest as apiSendFriendRequest,
		removeFriend as apiRemoveFriend,
		type ApiFriend
	} from '$lib/api';
	import { getAppContext } from '$lib/appContext.svelte';

	// Get shared app context from layout
	const appCtx = getAppContext();

	// Page-specific state (not in shared context)
	let file = $state<string | null>(null);
	let fileContent = $state<Log[]>([]);
	let playerName = $state<string | null>(null);
	let playerId = $state<string | null>(null); // Star Citizen player ID from Game.log
	let isLoadingFile = $state(true); // Prevent flash of welcome screen
	let tick = $state(0);
	let logLocation = $state<string | null>(null);
	let selectedEnvironment = $state<'LIVE' | 'PTU' | 'HOTFIX'>('LIVE');
	let prevLineCount = $state<number>(0);
	let lineCount = $state<number>(0);
	let currentUserDisplayData = $state<FriendType | null>(null);



	async function getLogFilePath(): Promise<string> {
		const dir = await appDataDir();
		return dir.endsWith('/') ? `${dir}logs.json` : `${dir}/logs.json`;
	}

	// Utility to deduplicate and sort logs by id and timestamp
	function dedupeAndSortLogs(logs: Log[]): Log[] {
		const seen = new Set<string>();
		const deduped = [];
		for (const log of logs) {
			if (!seen.has(log.id)) {
				seen.add(log.id);
				deduped.push(log);
			}
		}
		return deduped.sort(
			(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
		);
	}

	async function loadLogsFromDisk(): Promise<Log[]> {
		try {
			const filePath = await getLogFilePath();
			const text = await readTextFile(filePath);
			return dedupeAndSortLogs(JSON.parse(text) as Log[]);
		} catch (e) {
			return [];
		}
	}

	async function saveLogsToDisk(logs: Log[]): Promise<void> {
		const encoder = new TextEncoder();
		const data = encoder.encode(JSON.stringify(dedupeAndSortLogs(logs), null, 2));
		const filePath = await getLogFilePath();
		await writeFile(filePath, data);
	}

	async function appendLogToDisk(newLog: Log): Promise<void> {
		const logs = await loadLogsFromDisk();
		logs.push(newLog);
		const logsToSave = logs.map((log) => (log.userId ? log : { ...log, userId: playerId! }));
		await saveLogsToDisk(logsToSave);
	}

	let onlyProcessLogsAfterThisDateTimeStamp = $state<number | null>(null);
	async function clearLogs() {
		await saveLogsToDisk([]);
		fileContent = [];

		// Read current file to get line count for tracking position
		if (file) {
			try {
				const linesText = await readTextFile(file);
				const currentLineCount = linesText.split('\n').length;
				prevLineCount = currentLineCount;
			} catch (error) {
				prevLineCount = 0;
			}
		}

		// Reset displayed line count to 0
		lineCount = 0;
		onlyProcessLogsAfterThisDateTimeStamp = new Date().getTime();
	}

	setInterval(() => {
		tick += 1;
		if (tick > 5 && file) {
			handleFile(file);
		}
	}, 1000);

	function generateId(timestamp: string, line: string): string {
		// Generate deterministic ID based on timestamp and original log line
		// Use a better hash to avoid collisions
		const content = timestamp + '|' + line;
		let hash = 0;
		for (let i = 0; i < content.length; i++) {
			const char = content.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32-bit integer
		}
		// Use a longer hash to reduce collisions
		const hash2 = content.split('').reduce((acc, char, i) => {
			return acc + char.charCodeAt(0) * (i + 1);
		}, 0);
		return Math.abs(hash).toString(36) + Math.abs(hash2).toString(36);
	}

	function groupKillingSprees(logs: Log[]): Log[] {
		const spreeTimeWindow = 2 * 60 * 1000; // 2 minutes
		const minKillsForSpree = 2;
		const childLogIds = new Set<string>();

		const standaloneActorDeaths = logs.filter(
			(log) =>
				!log.children?.length &&
				log.eventType === 'actor_death' &&
				log.metadata?.killerId &&
				log.metadata.killerId !== '0' &&
				log.metadata.killerId !== log.metadata.victimId &&
				log.metadata.damageType !== 'VehicleDestruction'
		);

		const killsByPlayer = new Map<string, Log[]>();
		for (const death of standaloneActorDeaths) {
			const killerId = death.metadata!.killerId!;
			if (!killsByPlayer.has(killerId)) {
				killsByPlayer.set(killerId, []);
			}
			killsByPlayer.get(killerId)!.push(death);
		}

		const spreeParents = new Map<string, Log>();

		for (const kills of killsByPlayer.values()) {
			if (kills.length < minKillsForSpree) continue;

			let currentSpree: Log[] = [];
			const processSpree = () => {
				if (currentSpree.length >= minKillsForSpree) {
					const firstKill = currentSpree[0];
					const parentLog = {
						...firstKill,
						id: firstKill.id + '-spree',
						eventType: 'killing_spree' as const,
						line: `${firstKill.metadata!.killerName} is on a killing spree (${currentSpree.length} kills)`,
						emoji: '🎯',
						children: currentSpree.map((l) => ({ ...l, children: [] }))
					};
					spreeParents.set(firstKill.id, parentLog);
					for (const kill of currentSpree) {
						childLogIds.add(kill.id);
					}
				}
			};

			for (let i = 0; i < kills.length; i++) {
				if (currentSpree.length === 0) {
					currentSpree.push(kills[i]);
				} else {
					const lastKillTime = new Date(
						currentSpree[currentSpree.length - 1].timestamp
					).getTime();
					const currentKillTime = new Date(kills[i].timestamp).getTime();

					if (currentKillTime - lastKillTime < spreeTimeWindow) {
						currentSpree.push(kills[i]);
					} else {
						processSpree();
						currentSpree = [kills[i]];
					}
				}
			}
			processSpree();
		}

		const finalLogs: Log[] = [];
		let childrenFiltered = 0;
		for (const log of logs) {
			if (spreeParents.has(log.id)) {
				finalLogs.push(spreeParents.get(log.id)!);
			} else if (!childLogIds.has(log.id)) {
				finalLogs.push(log);
			} else {
				childrenFiltered++;
			}
		}

		return finalLogs;
	}

	async function sendLogViaWebSocket(log: Log) {
		if (appCtx.ws) {
			try {
				await appCtx.ws.send(JSON.stringify({ type: 'log', log }));
				console.log('Sent log via WebSocket:', log);
			} catch (error) {
				console.error('[WebSocket] Error sending log:', error);
			}
		}
	}

	onMount(() => {
		// Async initialization
		(async () => {
			const store = await load('store.json', {
				defaults: {},
				autoSave: false
			});
			const savedFile = await store.get<string>('lastFile');
			const savedPlayerName = await store.get<string>('playerName');
			const savedEnvironment = await store.get<'LIVE' | 'PTU' | 'HOTFIX'>(
				'selectedEnvironment'
			);

			// Set file path immediately to prevent welcome screen flash
			if (savedFile) {
				file = savedFile;
				logLocation = savedFile.split('/').slice(-2, -1)[0] || null;
			}

			if (savedEnvironment) {
				selectedEnvironment = savedEnvironment;
			}

			if (savedPlayerName) {
				playerName = savedPlayerName;
			}

			await store.save();

			// Load the Game.log file if previously selected
			if (savedFile && file) {
				try {
					// Load existing logs from disk and deduplicate any existing duplicates
					const savedLogs = await loadLogsFromDisk();
					// Run deduplication on load to clean up any pre-existing duplicates
					const dedupedSavedLogs = dedupeAndSortLogs(savedLogs);
					if (dedupedSavedLogs.length !== savedLogs.length) {
						console.log(`[Dedup] Removed ${savedLogs.length - dedupedSavedLogs.length} duplicate logs on load`);
						// Save the cleaned logs back to disk
						await saveLogsToDisk(dedupedSavedLogs);
					}
					fileContent = dedupedSavedLogs;

					// Set prevLineCount to current file length to avoid re-processing old logs on startup
					const linesText = await readTextFile(file);
					const currentLineCount = linesText.split('\n').length;
					prevLineCount = currentLineCount;
					lineCount = currentLineCount;

					handleInitialiseWatch(file);
					// playerId will be extracted from Game.log when parsing
				} catch (error) {}
			}

			// Mark loading complete
			isLoadingFile = false;
		})();
	});

	// Re-attach scroll listener when fileContentContainer changes (e.g., after navigating back from profile)
	$effect(() => {
		if (fileContentContainer) {
			fileContentContainer.addEventListener('scroll', handleScroll, { passive: true });

			return () => {
				if (fileContentContainer) {
					fileContentContainer.removeEventListener('scroll', handleScroll);
				}
			};
		}
	});

	let endWatch: () => void;

	async function handleInitialiseWatch(filePath: string) {
		if (endWatch) {
			endWatch();
		}
		endWatch = await watchImmediate(
			filePath,
			(event) => {
				handleFile(filePath);
			},
			{ recursive: false }
		);
	}

	function parseLogTimestamp(raw: string): string {
		// Example: 2024.06.07-12:34:56:789
		const match = raw.match(/(\d{4})\.(\d{2})\.(\d{2})-(\d{2}):(\d{2}):(\d{2}):?(\d{0,3})?/);
		if (!match) return new Date().toISOString();
		const [_, year, month, day, hour, min, sec, ms] = match;
		const msStr = ms ? ms.padEnd(3, '0') : '000';
		return `${year}-${month}-${day}T${hour}:${min}:${sec}.${msStr}Z`;
	}

	async function handleFile(filePath: string | null) {
		if (!filePath) return;

		try {
			tick = 0;
			const pathParts = filePath.split('\\');
			logLocation =
				pathParts.length > 1
					? pathParts[pathParts.length - 2]
					: filePath.split('/').length > 1
						? filePath.split('/').slice(-2, -1)[0]
						: null;

			const linesText = await readTextFile(filePath);
			const lineBreak = linesText.split('\n');
			const currentLineCount = lineBreak.length;

			// If file was truncated (e.g., new game session), reset
			if (currentLineCount < prevLineCount) {
				prevLineCount = 0;
				lineCount = 0;
				fileContent = [];
			}

			// No new lines to process
			if (currentLineCount <= prevLineCount) {
				return;
			}

			// Process only new lines since last read
			const newLines = lineBreak.slice(prevLineCount, currentLineCount);
			const newLinesCount = currentLineCount - prevLineCount;
			prevLineCount = currentLineCount;
			lineCount += newLinesCount;

			const newContent = newLines
				.map((line) => {
					if (!line.trim()) return null;

					const timestampMatch = line.match(/<([^>]+)>/);
					let timestamp = new Date().toISOString();
					if (timestampMatch) {
						const raw = timestampMatch[1];
						// If it's a valid ISO string, use it directly
						if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw)) {
							timestamp = raw;
						} else {
							timestamp = parseLogTimestamp(raw);
						}
					}
					if (
						onlyProcessLogsAfterThisDateTimeStamp &&
						new Date(timestamp).getTime() < onlyProcessLogsAfterThisDateTimeStamp
					) {
						return null;
					}
					let logEntry: Log | null = null;

					if (line.match(/AccountLoginCharacterStatus_Character/)) {
						const nameMatch = line.match(/- name (.*?) /);
						const oldPlayerName = playerName;
						playerName = nameMatch ? nameMatch[1] : playerName;

						// Extract Star Citizen player ID from EntityId if not already set
						if (!playerId && line.includes('EntityId')) {
							const entityIdMatch = line.match(/EntityId\[(.*?)\]/);
							if (entityIdMatch) {
								playerId = entityIdMatch[1];
								console.log('[Log] Extracted Star Citizen player ID from log:', playerId);
							}
						}

						if (playerName && playerName !== oldPlayerName) {
							if (appCtx.ws && appCtx.discordUserId) {
								// Fire-and-forget WebSocket send (don't block log parsing)
								appCtx.ws.send(
									JSON.stringify({
										type: 'update_my_details',
										userId: appCtx.discordUserId, // Use Discord ID for WebSocket
										playerName: playerName,
										playerId: playerId, // Include SC player ID as metadata
										timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
									})
								).catch((error: any) => {
									console.error('[WebSocket] Error sending update_my_details:', error);
								});
							}
						}
						logEntry = {
							id: generateId(timestamp, line),
							userId: playerId!,
							player: playerName,
							emoji: '🛜',
							line: `${playerName || 'Player'} connected to the game`,
							timestamp,
							original: line,
							open: false
						};
					} else if (line.match(/<RequestLocationInventory>/)) {
						const playerMatch = line.split('Player[')[1]?.split(']')[0];
						const locationMatch = line.split('Location[')[1]?.split(']')[0];
						if (playerMatch === playerName && locationMatch) {
							logEntry = {
								id: generateId(timestamp, line),
								userId: playerId!,
								player: playerName,
								emoji: '🔍',
								line: `${playerName} requested inventory in ${locationMatch}`,
								timestamp,
								original: line,
								open: false
							};
						}
					} else if (
						playerName &&
						line.match(/<Actor Death>/) &&
						line.match(`CActor::Kill: '${playerName}'`)
					) {
						const regex =
							/'([^']+)' \[(\d+)\] in zone '([^']+)' killed by '([^']+)' \[(\d+)\] using '([^']+)' \[Class ([^\]]+)\] with damage type '([^']+)' from direction x: ([\d\.\-]+), y: ([\d\.\-]+), z: ([\d\.\-]+)/;
						const match = line.match(regex);

						if (match) {
							const victimName = match[1];
							const victimId = match[2];
							const zone = match[3];
							const killerName = match[4];
							const killerId = match[5];
							const weaponInstance = match[6];
							const weaponClass = match[7];
							const damageType = match[8];
							const dirX = match[9];
							const dirY = match[10];
							const dirZ = match[11];

							const displayKillerName = getName(killerName);

							logEntry = {
								id: generateId(timestamp, line),
								userId: playerId!,
								player: playerName,
								emoji: '😵',
								line: `${playerName} killed by ${displayKillerName}`,
								timestamp,
								original: line,
								open: false,
								eventType: 'actor_death',
								metadata: {
									victimName,
									victimId,
									zone,
									killerName,
									killerId,
									weaponInstance,
									weaponClass,
									damageType,
									direction: { x: dirX, y: dirY, z: dirZ }
								}
							};
						}
					} else if (
						playerName &&
						line.match(/<Actor Death>/) &&
						!line.match(`CActor::Kill: '${playerName}'`)
					) {
						const regex =
							/'([^']+)' \[(\d+)\] in zone '([^']+)' killed by '([^']+)' \[(\d+)\] using '([^']+)' \[Class ([^\]]+)\] with damage type '([^']+)' from direction x: ([\d\.\-]+), y: ([\d\.\-]+), z: ([\d\.\-]+)/;
						const match = line.match(regex);

						if (match) {
							const victimName = match[1];
							const victimId = match[2];
							const zone = match[3];
							const killerName = match[4];
							const killerId = match[5];
							const weaponInstance = match[6];
							const weaponClass = match[7];
							const damageType = match[8];
							const dirX = match[9];
							const dirY = match[10];
							const dirZ = match[11];

							const displayVictimName = getName(victimName);
							const displayKillerName = getName(killerName);

							logEntry = {
								id: generateId(timestamp, line),
								userId: playerId!,
								player: playerName,
								emoji: '🗡️',
								line: `${displayVictimName} killed by ${displayKillerName}`,
								timestamp,
								original: line,
								open: false,
								eventType: 'actor_death',
								metadata: {
									victimName,
									victimId,
									zone,
									killerName,
									killerId,
									weaponInstance,
									weaponClass,
									damageType,
									direction: { x: dirX, y: dirY, z: dirZ }
								}
							};
						}
					} else if (line.match(/<Vehicle Destruction>/)) {
						const vehicle = line.match(/Vehicle '(.*?)' \[.*?\]/)?.[1];
						const shipType = getShipType(vehicle || '');
						const destroyer = getName(line.match(/caused by '(.*?)' \[.*?\]/)?.[1] || '');
						const destroyLevelMatch = line.match(/destroyLevel from '(.*?)' to '(.*?)'/);
						logEntry = {
							id: generateId(timestamp, line),
							userId: playerId!,
							player: playerName,
							emoji: '💥',
							line: `${shipType} destroyed by ${destroyer}`,
							timestamp,
							original: line,
							open: false,
							eventType: 'destruction',
							metadata: {
								vehicleName: vehicle,
								causeName: destroyer,
								destroyLevelFrom: destroyLevelMatch?.[1],
								destroyLevelTo: destroyLevelMatch?.[2]
							}
						};
					} else if (line.match(/<Ship Destruction>/)) {
						logEntry = {
							id: generateId(timestamp, line),
							userId: playerId!,
							player: playerName,
							emoji: '💥',
							line: `${playerName || 'Someone'} destroyed a ship`,
							timestamp,
							original: line,
							open: false
						};
					} else if (line.match(/<SystemQuit>/)) {
						logEntry = {
							id: generateId(timestamp, line),
							userId: playerId!,
							player: playerName,
							emoji: '👋',
							line: `${playerName || 'Player'} quit the game`,
							timestamp,
							original: line,
							open: false
						};
					} else if (line.match(/<Vehicle Control Flow>/)) {
						const shipNameMatch = line.match(/'([A-Za-z0-9_]+)_\d+'/);
						const shipIdMatch = line
							.match(/\[(\d+)\]/g)
							?.pop()
							?.match(/\d+/)?.[0];
						const shipName = shipNameMatch?.[1];
						if (shipName) {
							logEntry = {
								id: generateId(timestamp, line),
								userId: playerId!,
								player: playerName,
								emoji: '🚀',
								line: `${playerName || 'Player'} boarded ${shipName}${shipIdMatch ? ` [${shipIdMatch}]` : ''}`,
								timestamp,
								original: line,
								open: false,
								eventType: 'vehicle_control_flow',
								metadata: {
									vehicleName: shipName
								}
							};
						}
					}
					if (logEntry) {
						// Send via WebSocket if connected
						if (appCtx.connectionStatus === 'connected') sendLogViaWebSocket(logEntry);
					}
					return logEntry;
				})
				.filter((item): item is Log => item !== null);

			if (newContent.length > 0) {
				// Ensure all logs have userId (for backward compatibility or future-proofing)
				const newContentWithUserId = newContent.map((log) =>
					log.userId ? log : { ...log, userId: playerId! }
				);
				let groupedLogs = dedupeAndSortLogs([...fileContent, ...newContentWithUserId]);
				groupedLogs = groupKillingSprees(groupedLogs);
				fileContent = groupedLogs;

				// Batch save all new logs to disk if signed in (for sharing with friends)
				if (appCtx.isSignedIn) {
					// Save the deduplicated fileContent directly instead of merging with disk
					// fileContent already contains everything (loaded logs + new logs), deduplicated
					await saveLogsToDisk(fileContent);
				}

				setTimeout(() => {
					fileContentContainer?.scrollTo({
						top: fileContentContainer.scrollHeight,
						behavior: 'smooth'
					});
				}, 0);
			}
		} catch (error) {}
	}

	async function selectFile(environment?: 'LIVE' | 'PTU' | 'HOTFIX') {
		const store = await load('store.json', {
			defaults: {},
			autoSave: false
		});
		const env = environment || selectedEnvironment;
		const defaultPath = environment ? `C:\\Program Files\\Roberts Space Industries\\StarCitizen\\${env}\\` : undefined;

		const selectedPath = await open({
			multiple: false,
			directory: false,
			filters: [{ name: 'Game.log', extensions: ['log'] }],
			defaultPath
		});

		if (typeof selectedPath === 'string' && selectedPath) {
			file = selectedPath;
			fileContent = [];
			prevLineCount = 0;
			onlyProcessLogsAfterThisDateTimeStamp = null;
			await store.set('lastFile', selectedPath);

			// Store the environment
			if (environment) {
				selectedEnvironment = environment;
				await store.set('selectedEnvironment', environment);
			}

			let storedPlayerId = await store.get<string>('id');
			if (!storedPlayerId) {
				const pathPartsForId = selectedPath.split('/');
				playerId = pathPartsForId.length > 1 ? pathPartsForId.slice(-2, -1)[0] : crypto.randomUUID();
				await store.set('id', playerId);
			}
			await store.save();

			await handleFile(selectedPath);
			await handleInitialiseWatch(selectedPath);
		}
	}

	async function clearSettings() {
		const store = await load('store.json', {
			defaults: {},
			autoSave: false
		});

		// Save Discord auth before clearing
		const savedDiscordUserId = await store.get<string>('discordUserId');

		await store.clear();
		await store.delete('friendsList');
		await store.delete('lastFile');
		await store.delete('playerName');

		// Restore Discord auth
		if (savedDiscordUserId) {
			await store.set('discordUserId', savedDiscordUserId);
		}

		await store.save();

		file = null;
		fileContent = [];
		playerName = null;
		logLocation = null;
		prevLineCount = 0;
		lineCount = 0;
		playerId = null; // Will be re-extracted from Game.log
		currentUserDisplayData = null;

		console.log('[Reset] Data reset complete, Discord auth preserved');
	}

	let fileContentContainer = $state<HTMLDivElement | null>(null);
	let atTheBottom = $state(true);
	let hasScrollbar = $state(false);

	function handleScroll(event: Event) {
		if (!(event.target instanceof HTMLDivElement)) {
			return;
		}
		const target = event.target;
		const isAtBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 5;
		const hasContent = target.scrollHeight > target.clientHeight;

		hasScrollbar = hasContent;
		atTheBottom = isAtBottom;
	}

	const shipTypes = [
		'325a',
		'c1',
		'a2',
		'warlock',
		'eclipse',
		'inferno',
		'85x',
		'mantis',
		'hornet',
		'fury',
		'spirit_a1',
		'spirit_c1',
		'400i',
		'c2',
		'firebird',
		'reclaimer',
		'polaris',
		'comet',
		'gladius',
		'lightning',
		'scorpius',
		'arrow',
		'c8r',
		'c8x',
		'hull_c',
		'ursa_medivac',
		'starlancer_max',
		'mole',
		'starfighter',
		'ballista',
		'starfarer',
		'carrack',
		'taurus',
		'atls',
		'm50',
		'sabre',
		'dragonfly_yellow',
		'corsair',
		'cutlass_red',
		'prospector',
		'srv',
		'constellation',
		'freelancer',
		'archimedes',
		'avenger',
		'vulture',
		'cutter',
		'nomad',
		'cutlass',
		'350r',
		'razor',
		'890jump',
		'starlifter',
		'caterpillar',
		'vanguard',
		'reliant',
		'buccaneer',
		'glaive',
		'scythe',
		'600i',
		'talon'
	];

	function getShipType(shipName: string) {
		if (!shipName) return 'Unknown Ship';
		return (
			shipTypes.find((type) => shipName.toLowerCase().includes(type.toLowerCase())) || shipName
		);
	}

	function getName(line: string) {
		if (!line) return 'Unknown';
		if (line.includes('unknown')) {
			return '🤷‍♂️ Unknown';
		}
		return line.includes('PU_') ? '🤖 NPC' : line;
	}

	async function handleAddFriend(friendCode: string) {
		if (!appCtx.isSignedIn) {
			alert('Please sign in with Discord to add friends');
			return;
		}

		console.log('[Friend] Sending friend request to:', friendCode);
		const success = await apiSendFriendRequest(friendCode);

		if (success) {
			console.log('[Friend] Friend request sent successfully');
			// API will trigger refetch_friend_requests notification
		} else {
			alert('Failed to send friend request. Please check the friend code and try again.');
		}
	}

	async function handleRemoveFriend(id: string) {
		if (!appCtx.isSignedIn) {
			alert('Please sign in with Discord to remove friends');
			return;
		}

		// Find the friendship ID from apiFriends
		const apiFriend = appCtx.apiFriends.find((f) => f.friendUserId === id);
		if (!apiFriend) {
			console.error('[Friend] Cannot remove friend - friendship not found');
			return;
		}

		console.log('[Friend] Removing friend:', id);
		const success = await apiRemoveFriend(apiFriend.id);

		if (success) {
			console.log('[Friend] Friend removed successfully');
			// API will trigger refetch_friends notification
		} else {
			alert('Failed to remove friend. Please try again.');
		}
	}

	// Expose page-specific actions to the layout/header via context
	$effect(() => {
		appCtx.pageActions = {
			selectFile,
			clearLogs,
			logLocation
		};
	});

</script>

<main class="p-0 text-white flex flex-col h-full overflow-hidden">

	{#if appCtx.isSignedIn && appCtx.discordUser}
		{#key 'main-page'}
		<Resizer>
			{#snippet leftPanel()}
				<div class="flex flex-col h-full min-h-0">
					<div class="flex flex-col gap-4 overflow-y-auto flex-grow px-2 pb-2 pt-0">
						{#if currentUserDisplayData}
							<User user={currentUserDisplayData} />
						{/if}
						<Friends friendsList={appCtx.friendsList} removeFriend={handleRemoveFriend} />
					</div>
					<div class="mt-auto min-w-[200px] px-2 pb-2">
						<AddFriend addFriend={handleAddFriend} />
					</div>
				</div>
			{/snippet}

				{#snippet rightPanel()}
					<div class="relative grid grid-rows-[1fr_auto] h-full overflow-hidden">
						<div
							class="row-start-1 row-end-2 overflow-y-auto flex flex-col bg-black/10 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.3)_rgba(0,0,0,0.2)]"
							bind:this={fileContentContainer}>
							{#if file}
								{#each fileContent as item, index (item.id)}
									<Item {...item} bind:open={item.open} />
									{#if item.open && item.children && item.children.length > 0}
										<div class="relative ml-16 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-gradient-to-b before:from-red-500/50 before:via-red-500/30 before:to-transparent">
											{#each item.children as child (child.id)}
												<Item {...child} bind:open={child.open} child={true} />
											{/each}
										</div>
									{/if}
								{:else}
									<div class="flex items-start gap-4 px-4 py-3 border-b border-white/5">
										<div class="flex flex-col gap-[0.3rem]">
											<div class="text-[0.95rem] flex items-center gap-2 leading-[1.4]">
												No new logs yet. Waiting for game activity...
											</div>
										</div>
									</div>
								{/each}
							{:else if !isLoadingFile}
								<div
									class="flex flex-col items-start gap-4 my-8 mx-auto p-8 rounded-lg bg-white/[0.03] border border-white/10 max-w-[600px]">
									<h2 class="m-0 mb-2 text-[1.6rem] font-medium">🚀 Getting started</h2>
									<ol class="list-none pl-0 [counter-reset:welcome-counter] flex flex-col gap-2 mt-4">
										<li
											class="inline-block relative pl-[34px] m-0 text-base font-light leading-[1.6] before:content-[counter(welcome-counter)] before:[counter-increment:welcome-counter] before:absolute before:left-0 before:top-0 before:w-6 before:h-6 before:bg-[#4caf50] before:text-white before:rounded-full before:inline-flex before:items-center before:justify-center before:text-[0.85em] before:font-bold before:leading-6">
											Select your <code
												class="bg-white/10 px-[0.3rem] py-[0.1rem] rounded-[3px] font-mono inline text-base">
												Game.log
											</code>
											file. Usually found at the default path:
											<code
												class="bg-white/10 px-[0.3rem] py-[0.1rem] rounded-[3px] font-mono inline text-base">
												C:\Program Files\Roberts Space Industries\StarCitizen\LIVE\Game.log
											</code>
											<br />
											(Or the equivalent path on your system if installed elsewhere.)
										</li>
										<li
											class="inline-block relative pl-[34px] m-0 text-base font-light leading-[1.6] before:content-[counter(welcome-counter)] before:[counter-increment:welcome-counter] before:absolute before:left-0 before:top-0 before:w-6 before:h-6 before:bg-[#4caf50] before:text-white before:rounded-full before:inline-flex before:items-center before:justify-center before:text-[0.85em] before:font-bold before:leading-6">
											Once a log file is selected and you go <strong>Online</strong>
											(using the top-right button), Picologs automatically connects you with other friends for
											real-time log sharing.
										</li>
										<li
											class="inline-block relative pl-[34px] m-0 text-base font-light leading-[1.6] before:content-[counter(welcome-counter)] before:[counter-increment:welcome-counter] before:absolute before:left-0 before:top-0 before:w-6 before:h-6 before:bg-[#4caf50] before:text-white before:rounded-full before:inline-flex before:items-center before:justify-center before:text-[0.85em] before:font-bold before:leading-6">
											To add friends use your <strong>Friend Code</strong>
											displayed at the top. Share this with friends to connect with them.
										</li>
									</ol>
								</div>
							{/if}
						</div>

						{#if file}
							<div
								class="row-start-2 row-end-3 flex items-center justify-end gap-2 px-4 py-2 bg-[rgb(10,30,42)] border-t border-white/20 text-[0.8rem] text-white/70">
								Log lines processed: {Number(lineCount).toLocaleString()}
							</div>
						{/if}

						<!-- Scroll to bottom button -->
						{#if hasScrollbar && !atTheBottom}
							<button
								in:fade={{ duration: 200, delay: 400 }}
								out:fade={{ duration: 200 }}
								class="absolute bottom-[70px] text-3xl cursor-pointer z-50"
								style="left: 50%; transform: translateX(-50%);"
								onclick={() =>
									fileContentContainer?.scrollTo({
										top: fileContentContainer.scrollHeight,
										behavior: 'smooth'
									})}>
								⬇️
							</button>
						{/if}
					</div>
				{/snippet}
			</Resizer>
		{/key}
		{:else}
			<div class="relative grid grid-rows-[1fr_auto] h-full overflow-hidden">
				<div
					class="row-start-1 row-end-2 overflow-y-auto flex flex-col bg-black/10 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.3)_rgba(0,0,0,0.2)]"
					bind:this={fileContentContainer}>
					{#if file}
						{#each fileContent as item, index (item.id)}
							<Item {...item} bind:open={item.open} />
							{#if item.open && item.children && item.children.length > 0}
								<div class="relative ml-16 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-gradient-to-b before:from-red-500/50 before:via-red-500/30 before:to-transparent">
									{#each item.children as child (child.id)}
										<Item {...child} bind:open={child.open} child={true} />
									{/each}
								</div>
							{/if}
						{:else}
							<div class="flex items-start gap-4 px-4 py-3 border-b border-white/5">
								<div class="flex flex-col gap-[0.3rem]">
									<div class="text-[0.95rem] flex items-center gap-2 leading-[1.4]">
										No new logs yet. Waiting for game activity...
									</div>
								</div>
							</div>
						{/each}
					{:else if !isLoadingFile}
						<div
							class="flex flex-col items-start gap-4 my-8 mx-auto p-8 rounded-lg bg-white/[0.03] border border-white/10 max-w-[600px]">
							<h2 class="m-0 mb-2 text-[1.6rem] font-medium">🚀 Getting started</h2>
							<ol class="list-none pl-0 [counter-reset:welcome-counter] flex flex-col gap-2 mt-4">
								<li
									class="inline-block relative pl-[34px] m-0 text-base font-light leading-[1.6] before:content-[counter(welcome-counter)] before:[counter-increment:welcome-counter] before:absolute before:left-0 before:top-0 before:w-6 before:h-6 before:bg-[#4caf50] before:text-white before:rounded-full before:inline-flex before:items-center before:justify-center before:text-[0.85em] before:font-bold before:leading-6">
									Select your <code
										class="bg-white/10 px-[0.3rem] py-[0.1rem] rounded-[3px] font-mono inline text-base">
										Game.log
									</code>
									file. Usually found at the default path:
									<code
										class="bg-white/10 px-[0.3rem] py-[0.1rem] rounded-[3px] font-mono inline text-base">
										C:\Program Files\Roberts Space Industries\StarCitizen\LIVE\Game.log
									</code>
									<br />
									(Or the equivalent path on your system if installed elsewhere.)
								</li>
								<li
									class="inline-block relative pl-[34px] m-0 text-base font-light leading-[1.6] before:content-[counter(welcome-counter)] before:[counter-increment:welcome-counter] before:absolute before:left-0 before:top-0 before:w-6 before:h-6 before:bg-[#4caf50] before:text-white before:rounded-full before:inline-flex before:items-center before:justify-center before:text-[0.85em] before:font-bold before:leading-6">
									Once a log file is selected and you go <strong>Online</strong>
									(using the top-right button), Picologs automatically connects you with other friends for
									real-time log sharing.
								</li>
								<li
									class="inline-block relative pl-[34px] m-0 text-base font-light leading-[1.6] before:content-[counter(welcome-counter)] before:[counter-increment:welcome-counter] before:absolute before:left-0 before:top-0 before:w-6 before:h-6 before:bg-[#4caf50] before:text-white before:rounded-full before:inline-flex before:items-center before:justify-center before:text-[0.85em] before:font-bold before:leading-6">
									To add friends use your <strong>Friend Code</strong>
									displayed at the top. Share this with friends to connect with them.
								</li>
							</ol>
						</div>
					{/if}
				</div>

				{#if file}
					<div
						class="row-start-2 row-end-3 flex items-center justify-end gap-2 px-4 py-2 bg-[rgb(10,30,42)] border-t border-white/20 text-[0.8rem] text-white/70">
						Log lines processed: {Number(lineCount).toLocaleString()}
					</div>
				{/if}

				<!-- Scroll to bottom button -->
				{#if hasScrollbar && !atTheBottom}
					<button
						in:fade={{ duration: 200, delay: 400 }}
						out:fade={{ duration: 200 }}
						class="absolute bottom-[70px] text-3xl cursor-pointer z-50"
						style="left: 50%; transform: translateX(-50%);"
						onclick={() =>
							fileContentContainer?.scrollTo({
								top: fileContentContainer.scrollHeight,
								behavior: 'smooth'
							})}>
						⬇️
					</button>
				{/if}
			</div>
		{/if}
</main>

<style>
	:global(.item:nth-child(2n)) {
		background-color: rgba(255, 255, 255, 0.05);
	}
</style>
