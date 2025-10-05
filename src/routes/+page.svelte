<script lang="ts">
	import { readTextFile, watchImmediate, writeFile } from '@tauri-apps/plugin-fs';
	import { load } from '@tauri-apps/plugin-store';
	import { open } from '@tauri-apps/plugin-dialog';
	import Item from '../components/Item.svelte';
	import { onMount, tick } from 'svelte';
	import { fade } from 'svelte/transition';
	import Friends from '../components/Friends.svelte';
	import Groups from '../components/Groups.svelte';
	import User from '../components/User.svelte';
	import AddFriend from '../components/AddFriend.svelte';
	import type { Log, Friend as FriendType } from '../types';
	import { appDataDir } from '@tauri-apps/api/path';
	import Resizer from '../components/Resizer.svelte';
	import VerticalResizer from '../components/VerticalResizer.svelte';
	import {
		sendFriendRequest as apiSendFriendRequest,
		removeFriend as apiRemoveFriend,
		type ApiFriend
	} from '$lib/api';
	import { getAppContext } from '$lib/appContext.svelte';
	import { compressLogs, shouldCompressLogs } from '$lib/compression';

	// Get shared app context from layout
	const appCtx = getAppContext();

	// Page-specific state (not in shared context)
	let file = $state<string | null>(null);
	let fileContent = $state<Log[]>([]);
	let playerName = $state<string | null>(null);
	let playerId = $state<string | null>(null); // Star Citizen player ID from Game.log
	let isLoadingFile = $state(true); // Prevent flash of welcome screen
	let tickCounter = $state(0);
	let logLocation = $state<string | null>(null);
	let selectedEnvironment = $state<'LIVE' | 'PTU' | 'HOTFIX'>('LIVE');
	let prevLineCount = $state<number>(0);
	let lineCount = $state<number>(0);
	let currentUserDisplayData = $state<FriendType | null>(null);

	// Track last sync timestamp per friend for delta sync
	// Map<friendId, lastSyncTimestamp>
	let friendSyncTimestamps = $state<Map<string, string>>(new Map());

	// Derived state for filtered logs based on selected user or group
	let displayedLogs = $derived.by(() => {
		// If a specific user is selected, show only their logs
		if (appCtx.selectedUserId) {
			return fileContent.filter(log => log.userId === appCtx.selectedUserId);
		}

		// If a group is selected, show group members' logs
		if (appCtx.selectedGroupId) {
			const members = appCtx.groupMembers.get(appCtx.selectedGroupId) || [];
			const memberUserIds = new Set(members.map(m => m.discordId));

			return fileContent.filter(log => {
				// Include own logs
				if (log.userId === playerId) return true;

				// Include logs from group members
				return memberUserIds.has(log.userId);
			});
		}

		// Show all logs (default behavior)
		return fileContent;
	});

	// Get user display name from group members or friends
	function getUserDisplayName(userId: string): string | null {
		if (!userId || userId === playerId) return null; // Don't show for own logs

		// If viewing a group, get name from group members
		if (appCtx.selectedGroupId) {
			const members = appCtx.groupMembers.get(appCtx.selectedGroupId) || [];
			const member = members.find(m => m.discordId === userId);
			if (member) {
				return member.player || member.username;
			}
		}

		// Otherwise, try to find in friends list
		const friend = appCtx.friendsList.find(f => f.id === userId);
		if (friend) {
			return friend.name || null;
		}

		return null;
	}

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

	// Load friend sync timestamps from Tauri store
	async function loadFriendSyncTimestamps(): Promise<void> {
		try {
			const store = await load('store.json', { defaults: {}, autoSave: false });
			const timestamps = await store.get<Record<string, string>>('friendSyncTimestamps');
			if (timestamps) {
				friendSyncTimestamps = new Map(Object.entries(timestamps));
			}
		} catch (error) {
			// Silently fail - timestamps will be rebuilt
		}
	}

	// Save friend sync timestamps to Tauri store
	async function saveFriendSyncTimestamps(): Promise<void> {
		try {
			const store = await load('store.json', { defaults: {}, autoSave: 200 });
			const timestampsObj = Object.fromEntries(friendSyncTimestamps);
			await store.set('friendSyncTimestamps', timestampsObj);
		} catch (error) {
			// Silently fail - will retry on next save
		}
	}

	// Update last sync timestamp for a friend
	function updateFriendSyncTimestamp(friendId: string, timestamp?: string): void {
		const now = timestamp || new Date().toISOString();
		friendSyncTimestamps.set(friendId, now);
		// Trigger reactivity
		friendSyncTimestamps = new Map(friendSyncTimestamps);
		saveFriendSyncTimestamps(); // Async save
	}

	// Request log sync from a friend with delta sync support
	async function requestLogSyncFromFriend(friendId: string): Promise<void> {
		if (!appCtx.ws || !playerId) {
			return;
		}

		try {
			const lastSyncTimestamp = friendSyncTimestamps.get(friendId);
			const myLogs = await loadLogsFromDisk();

			// Filter logs to send based on last sync timestamp
			let logsToSend = myLogs;
			if (lastSyncTimestamp) {
				const lastSyncTime = new Date(lastSyncTimestamp).getTime();
				logsToSend = myLogs.filter(log => {
					if (!log.timestamp) return false;
					return new Date(log.timestamp).getTime() > lastSyncTime;
				});
			}

			// Send sync request with delta parameters
			await appCtx.ws.send(JSON.stringify({
				type: 'sync_logs',
				targetUserId: friendId,
				logs: logsToSend,
				since: lastSyncTimestamp || null,
				limit: 100,
				offset: 0
			}));

			// Update sync timestamp after successful sync
			updateFriendSyncTimestamp(friendId);
		} catch (error) {
			// Silently fail - will retry on next connection
		}
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

	// Log batching configuration
	const BATCH_INTERVAL_MS = 2500; // Flush every 2.5 seconds
	const BATCH_SIZE_LIMIT = 8; // Flush when buffer reaches 8 logs

	// Separate buffers for friends and groups
	let friendLogsBuffer = $state<Log[]>([]);
	let groupLogsBuffers = $state<Map<string, Log[]>>(new Map());
	let batchFlushTimer = $state<number | null>(null);

	// Flush all batched logs
	async function flushLogBatches() {
		if (!appCtx.ws) return;

		// Flush friend logs
		if (friendLogsBuffer.length > 0) {
			try {
				const useCompression = shouldCompressLogs(friendLogsBuffer);
				let message: any = {
					type: 'batch_logs'
				};

				if (useCompression) {
					message.compressed = true;
					message.compressedData = await compressLogs(friendLogsBuffer);
				} else {
					message.logs = friendLogsBuffer;
				}

				await appCtx.ws.send(JSON.stringify(message));
				friendLogsBuffer = [];
			} catch (error) {
				console.error('[WebSocket] Error sending batched friend logs:', error);
			}
		}

		// Flush group logs
		for (const [groupId, logs] of groupLogsBuffers.entries()) {
			if (logs.length > 0) {
				try {
					const useCompression = shouldCompressLogs(logs);
					let message: any = {
						type: 'batch_group_logs',
						groupId
					};

					if (useCompression) {
						message.compressed = true;
						message.compressedData = await compressLogs(logs);
					} else {
						message.logs = logs;
					}

					await appCtx.ws.send(JSON.stringify(message));
				} catch (error) {
					console.error(`[WebSocket] Error sending batched group logs to ${groupId}:`, error);
				}
			}
		}
		groupLogsBuffers.clear();

		// Clear the timer
		if (batchFlushTimer !== null) {
			clearTimeout(batchFlushTimer);
			batchFlushTimer = null;
		}
	}

	// Schedule batch flush if not already scheduled
	function scheduleBatchFlush() {
		if (batchFlushTimer === null) {
			batchFlushTimer = setTimeout(() => {
				flushLogBatches();
			}, BATCH_INTERVAL_MS) as unknown as number;
		}
	}

	async function sendLogViaWebSocket(log: Log) {
		if (appCtx.ws) {
			try {
				// Add to friend logs buffer
				friendLogsBuffer.push(log);

				// Add to all group buffers
				for (const group of appCtx.groups) {
					if (!groupLogsBuffers.has(group.id)) {
						groupLogsBuffers.set(group.id, []);
					}
					groupLogsBuffers.get(group.id)!.push(log);
				}

				// Check if any buffer is full
				const friendBufferFull = friendLogsBuffer.length >= BATCH_SIZE_LIMIT;
				const anyGroupBufferFull = Array.from(groupLogsBuffers.values()).some(
					buffer => buffer.length >= BATCH_SIZE_LIMIT
				);

				// Flush immediately if any buffer is full
				if (friendBufferFull || anyGroupBufferFull) {
					await flushLogBatches();
				} else {
					// Schedule a flush
					scheduleBatchFlush();
				}
			} catch (error) {
				console.error('[WebSocket] Error buffering log:', error);
			}
		}
	}

	onMount(() => {
		// Load sync timestamps on mount
		loadFriendSyncTimestamps();

		// Listen for group logs from WebSocket
		const handleGroupLog = async (event: CustomEvent) => {
			const { log, groupId, senderId, senderUsername } = event.detail;

			// Add log to fileContent and disk
			const newLog = { ...log, userId: senderId };
			fileContent = dedupeAndSortLogs([...fileContent, newLog]);

			if (appCtx.isSignedIn) {
				await appendLogToDisk(newLog);
			}
		};

		// Listen for friend logs from WebSocket
		const handleFriendLog = async (event: CustomEvent) => {
			const { log } = event.detail;

			// Add log to fileContent and disk
			const newLog = { ...log };
			fileContent = dedupeAndSortLogs([...fileContent, newLog]);

			if (appCtx.isSignedIn) {
				await appendLogToDisk(newLog);
			}
		};

		// Listen for friend coming online and trigger delta sync
		const handleFriendCameOnline = async (event: CustomEvent) => {
			const { friendId } = event.detail;
			await requestLogSyncFromFriend(friendId);
		};

		// Listen for sync_logs messages (receiving synced logs from friends)
		const handleSyncLogsReceived = async (event: CustomEvent) => {
			const { logs, senderId } = event.detail;
			if (!logs || !Array.isArray(logs)) return;

			// Add received logs to fileContent and disk
			const newLogs = logs.map((log: Log) => ({ ...log, userId: senderId || log.userId }));
			fileContent = dedupeAndSortLogs([...fileContent, ...newLogs]);

			if (appCtx.isSignedIn) {
				// Save all logs to disk
				await saveLogsToDisk(fileContent);
			}

			// Update sync timestamp for this friend
			if (senderId) {
				updateFriendSyncTimestamp(senderId);
			}
		};

		window.addEventListener('group-log-received', handleGroupLog as unknown as EventListener);
		window.addEventListener('friend-log-received', handleFriendLog as unknown as EventListener);
		window.addEventListener('friend-came-online', handleFriendCameOnline as unknown as EventListener);
		window.addEventListener('sync-logs-received', handleSyncLogsReceived as unknown as EventListener);

		// Async initialization
		(async () => {
			// Store strategy: Use autoSave with 300ms debounce to batch writes during initialization
			// This prevents multiple rapid saves while loading initial settings
			const store = await load('store.json', {
				defaults: {},
				autoSave: 300
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

			// No explicit save needed - autoSave will handle any changes

			// Load the Game.log file if previously selected
			if (savedFile && file) {
				try {
					// Load existing logs from disk and deduplicate any existing duplicates
					const savedLogs = await loadLogsFromDisk();
					// Run deduplication on load to clean up any pre-existing duplicates
					const dedupedSavedLogs = dedupeAndSortLogs(savedLogs);
					if (dedupedSavedLogs.length !== savedLogs.length) {
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
				} catch (error) {
					console.error('[Initialization] Failed to load saved log file on startup:', error);
				}
			}

			// Mark loading complete
			isLoadingFile = false;
		})();

		// Cleanup event listeners on unmount
		return () => {
			// Flush any pending batched logs before unmounting
			flushLogBatches();
			window.removeEventListener('group-log-received', handleGroupLog as unknown as EventListener);
			window.removeEventListener('friend-log-received', handleFriendLog as unknown as EventListener);
			window.removeEventListener('friend-came-online', handleFriendCameOnline as unknown as EventListener);
			window.removeEventListener('sync-logs-received', handleSyncLogsReceived as unknown as EventListener);
		};
	});

	// Re-attach scroll listener when fileContentContainer changes (e.g., after navigating back from profile)
	$effect(() => {
		const container = fileContentContainer; // Capture current value
		if (container) {
			container.addEventListener('scroll', handleScroll, { passive: true });

			return () => {
				container.removeEventListener('scroll', handleScroll); // Use captured value
			};
		}
	});

	// Initial scroll to bottom on page load
	let initialScrollDone = $state(false);
	$effect(() => {
		if (!initialScrollDone && fileContentContainer && displayedLogs.length > 0) {
			tick().then(() => {
				if (fileContentContainer) {
					fileContentContainer.scrollTop = fileContentContainer.scrollHeight;
					atTheBottom = true;
					initialScrollDone = true;
				}
			});
		}
	});

	// Auto-scroll to bottom when new logs arrive (if user was already at bottom)
	$effect(() => {
		// Skip during initial scroll
		if (!initialScrollDone) return;

		// Track displayedLogs length to trigger on new logs
		const logsCount = displayedLogs.length;

		// Only auto-scroll if user was at the bottom before new content arrived
		if (atTheBottom && fileContentContainer && logsCount > 0) {
			tick().then(() => {
				if (fileContentContainer) {
					fileContentContainer.scrollTop = fileContentContainer.scrollHeight;
				}
			});
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
			tickCounter = 0;
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
								).catch(() => {
									// Silently fail - will retry on next update
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

				// Add size limit to prevent unbounded memory growth
				const MAX_LOGS = 1000;
				if (groupedLogs.length > MAX_LOGS) {
					groupedLogs = groupedLogs.slice(-MAX_LOGS); // Keep most recent 1000
				}

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
		} catch (error) {
			console.error('[FileHandler] Failed to process log file:', error);
		}
	}

	async function selectFile(environment?: 'LIVE' | 'PTU' | 'HOTFIX') {
		// Store strategy: Use autoSave with 200ms debounce for file selection
		// Multiple settings may be updated rapidly (file path, environment, player ID)
		const store = await load('store.json', {
			defaults: {},
			autoSave: 200
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
			// No explicit save needed - autoSave will persist all changes with 200ms debounce

			await handleFile(selectedPath);
			await handleInitialiseWatch(selectedPath);
		}
	}

	async function clearSettings() {
		// Store strategy: Use autoSave with 100ms debounce for settings reset
		// Multiple delete operations followed by a restore - autoSave batches these writes
		const store = await load('store.json', {
			defaults: {},
			autoSave: 100
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

		// No explicit save needed - autoSave will persist all changes with 100ms debounce

		file = null;
		fileContent = [];
		playerName = null;
		logLocation = null;
		prevLineCount = 0;
		lineCount = 0;
		playerId = null; // Will be re-extracted from Game.log
		currentUserDisplayData = null;
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

		const success = await apiSendFriendRequest(friendCode);

		if (!success) {
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
			return;
		}

		const success = await apiRemoveFriend(apiFriend.id);

		if (!success) {
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
					{#if currentUserDisplayData}
						<div class="px-2 pt-0 pb-2">
							<User user={currentUserDisplayData} />
						</div>
					{/if}
					<VerticalResizer storeKey="friendsGroupsResizerHeight">
						{#snippet topPanel()}
							<Groups
								groups={appCtx.groups}
								groupMembers={appCtx.groupMembers}
							/>
						{/snippet}
						{#snippet bottomPanel()}
							<Friends friendsList={appCtx.friendsList} removeFriend={handleRemoveFriend} />
						{/snippet}
					</VerticalResizer>
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
								{#each displayedLogs as item, index (item.id)}
									{@const username = getUserDisplayName(item.userId)}
									<Item {...item} bind:open={item.open} reportedBy={username ? [username] : undefined} />
									{#if item.open && item.children && item.children.length > 0}
										<div class="relative ml-16 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-gradient-to-b before:from-red-500/50 before:via-red-500/30 before:to-transparent">
											{#each item.children as child (child.id)}
												{@const childUsername = getUserDisplayName(child.userId)}
												<Item {...child} bind:open={child.open} child={true} reportedBy={childUsername ? [childUsername] : undefined} />
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
						{#each displayedLogs as item, index (item.id)}
							{@const username = getUserDisplayName(item.userId)}
							<Item {...item} bind:open={item.open} reportedBy={username ? [username] : undefined} />
							{#if item.open && item.children && item.children.length > 0}
								<div class="relative ml-16 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-gradient-to-b before:from-red-500/50 before:via-red-500/30 before:to-transparent">
									{#each item.children as child (child.id)}
										{@const childUsername = getUserDisplayName(child.userId)}
										<Item {...child} bind:open={child.open} child={true} reportedBy={childUsername ? [childUsername] : undefined} />
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
						class="row-start-3 row-end-4 flex items-center justify-end gap-2 px-4 py-2 bg-[rgb(10,30,42)] border-t border-white/20 text-[0.8rem] text-white/70">
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
