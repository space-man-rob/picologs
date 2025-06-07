<script lang="ts">
	import { appDataDir } from '@tauri-apps/api/path';
	import { ask, open } from '@tauri-apps/plugin-dialog';
	import { readTextFile, watchImmediate, writeFile } from '@tauri-apps/plugin-fs';
	import { load } from '@tauri-apps/plugin-store';
	import { check } from '@tauri-apps/plugin-updater';
	import { onMount } from 'svelte';
	import AddFriend from '../components/AddFriend.svelte';
	import Friends from '../components/Friends.svelte';
	import Header from '../components/Header.svelte';
	import PendingFriendRequests from '../components/PendingFriendRequests.svelte';
	import Timeline from '../components/Timeline.svelte';
	import User from '../components/User.svelte';
	import type { Friend as FriendType, Log } from '../types';
	import Resizer from '../components/Resizer.svelte';

	let ws = $state<WebSocket | null>(null);
	let file = $state<string | null>(null);
	let fileContent = $state<Log[]>([]);
	let friendCode = $state<string | null>(null);
	let playerName = $state<string | null>(null);
	let playerId = $state<string | null>(null);
	let tick = $state(0);
	let logLocation = $state<string | null>(null);
	let prevLineCount = $state<number>(0);
	let lineCount = $state<number>(0);
	let connectionStatus = $state<'connected' | 'disconnected' | 'connecting'>('disconnected');
	let copiedStatusVisible = $state(false);
	let pendingFriendRequests = $state<{ friendCode: string }[]>([]);
	let incomingFriendRequests = $state<
		{
			fromUserId: string;
			fromFriendCode: string;
			fromPlayerName?: string;
			fromTimezone?: string;
		}[]
	>([]);
	let autoConnectionAttempted = $state(false);
	let friendsList = $state<FriendType[]>([]);
	let currentUserDisplayData = $state<FriendType | null>(null);
	let onlyProcessLogsAfterThisDateTimeStamp = $state<number | null>(null);
	let fileContentContainer = $state<HTMLDivElement | null>(null);
	let endWatch: () => void;
	let destroyedShips = $state<Record<string, number>>({});

	let hasInitialised = $state(false);

	function groupDestructionEvents(logs: Log[]): Log[] {
		const destructionMap = new Map<string, Log>(); // vehicleId -> parent log
		const childLogIds = new Set<string>();

		// Reset children to avoid duplicates on re-processing
		for (const log of logs) {
			log.children = [];
		}

		for (const log of logs) {
			let parentLog: Log | undefined;

			if (log.eventType === 'destruction' && log.metadata?.vehicleId) {
				const vehicleId = log.metadata.vehicleId;
				parentLog = destructionMap.get(vehicleId);
				if (parentLog) {
					const timeDiff = new Date(log.timestamp).getTime() - new Date(parentLog.timestamp).getTime();
					if (timeDiff < 10000) {
						if (!parentLog.children) parentLog.children = [];
						parentLog.children.push(log);
						childLogIds.add(log.id);
					} else {
						destructionMap.set(vehicleId, log); // New parent event
					}
				} else {
					destructionMap.set(vehicleId, log); // New parent event
				}
			} else if (
				log.eventType === 'actor_death' &&
				log.metadata?.damageType === 'VehicleDestruction' &&
				log.metadata?.zone
			) {
				const vehicleIdMatch = log.metadata.zone.match(/_(\d+)$/);
				if (vehicleIdMatch) {
					const vehicleId = vehicleIdMatch[1];
					parentLog = destructionMap.get(vehicleId);
					if (parentLog) {
						const timeDiff =
							new Date(log.timestamp).getTime() - new Date(parentLog.timestamp).getTime();
						if (timeDiff < 10000) {
							if (!parentLog.children) parentLog.children = [];
							parentLog.children.push(log);
							childLogIds.add(log.id);
						}
					}
				}
			}
		}

		return logs.filter((log) => !childLogIds.has(log.id));
	}

	onMount(async () => {
		await checkForUpdates();

		const store = await load('store.json', { autoSave: false });
		const savedFile = await store.get<string>('lastFile');
		const savedFriendCode = await store.get<string>('friendCode');
		const savedFriendsList = await store.get<FriendType[]>('friendsList');
		const savedPlayerName = await store.get<string>('playerName');
		const savedPendingFriendRequests =
			await store.get<{ friendCode: string }[]>('pendingFriendRequests');

		if (savedPlayerName) {
			playerName = savedPlayerName;
		}

		if (savedFriendsList) {
			friendsList = savedFriendsList.map((friend) => ({ ...friend, isOnline: false }));
		}

		if (savedPendingFriendRequests) {
			pendingFriendRequests = savedPendingFriendRequests;
		}

		let storedPlayerId = await store.get<string>('id');

		if (!savedFriendCode) {
			friendCode = generateId(6);
			await store.set('friendCode', friendCode);
		} else {
			friendCode = savedFriendCode;
		}

		if (storedPlayerId) {
			playerId = storedPlayerId;
		} else if (savedFile) {
			const pathPartsForId = savedFile.split('/');
			playerId = pathPartsForId.length > 1 ? pathPartsForId.slice(-2, -1)[0] : generateId();
			await store.set('id', playerId);
		} else {
			playerId = generateId();
			await store.set('id', playerId);
		}

		await store.save();

		// Load logs from disk first
		const storedLogs = await loadLogsFromDisk();
		if (storedLogs && Array.isArray(storedLogs) && storedLogs.length > 0) {
			fileContent = dedupeAndSortLogs(storedLogs);
			// Set the timestamp filter to the newest log in logs.json
			const newestLog = storedLogs.reduce((latest, current) => {
				return new Date(current.timestamp).getTime() > new Date(latest.timestamp).getTime()
					? current
					: latest;
			});
			onlyProcessLogsAfterThisDateTimeStamp = new Date(newestLog.timestamp).getTime();
		} else {
			fileContent = storedLogs || []; // Initialize if no logs or empty
		}

		try {
			logLocation = savedFile?.split('/').slice(-2, -1)[0] || null;

			if (savedFile) {
				file = savedFile;
				await handleFile(file); // Process game log, respecting onlyProcessLogsAfterThisDateTimeStamp
				handleInitialiseWatch(file);
			}
		} catch (error) {}

		if (playerId && friendCode && file && (!ws || ws.readyState !== WebSocket.OPEN)) {
			connectWebSocket();
		}

		hasInitialised = true;
	});

	async function getLogFilePath(): Promise<string> {
		const dir = await appDataDir();
		return dir.endsWith('/') ? `${dir}logs.json` : `${dir}/logs.json`;
	}

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

	async function clearLogs() {
		await saveLogsToDisk([]);
		fileContent = [];
		prevLineCount = 0;
		lineCount = 0;
		onlyProcessLogsAfterThisDateTimeStamp = new Date().getTime();
		const store = await load('store.json', { autoSave: false });
		await store.set('lastFile', null);
		await store.save();
	}

	function generateId(length: number = 10) {
		return crypto.randomUUID().slice(0, length);
	}

	function sendLogViaWebSocket(log: Log) {
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify({ type: 'log', log }));
		}
	}

	async function connectWebSocket() {
		const store = await load('store.json', { autoSave: false });
		const wouldGoOnline = await store.get<boolean>('wouldGoOnline');
		if (!wouldGoOnline) {
			return;
		}
		if (ws && ws.readyState === WebSocket.OPEN) {
			return;
		}
		connectionStatus = 'connecting';

		try {
			const socket = new WebSocket('wss://picologs-server.fly.dev/ws');
			ws = socket;

			socket.onopen = () => {
				connectionStatus = 'connected';
				try {
					if (playerId && friendCode) {
						socket.send(
							JSON.stringify({
								type: 'register',
								userId: playerId,
								friendCode: friendCode,
								playerName: playerName,
								timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
							})
						);
					} else {
					}
				} catch (sendError) {}
			};

			socket.onmessage = async (event) => {
				if (typeof event.data === 'string') {
					try {
						const message = JSON.parse(event.data);

						switch (message.type) {
							case 'welcome':
								break;
							case 'registration_success':
								break;
							case 'auto_initiate_offer':
								if (message.targetUserId && !autoConnectionAttempted) {
									autoConnectionAttempted = true;
								} else if (autoConnectionAttempted) {
								}
								break;
							case 'auto_expect_offer':
								if (message.fromUserId) {
									autoConnectionAttempted = true;
								}
								break;
							case 'friend_request_received':
								if (message.fromUserId && message.fromFriendCode) {
									// Step 5: Immediately acknowledge receipt to server
									ws?.send(
										JSON.stringify({
											type: 'friend_request_received_ack',
											requesterUserId: message.fromUserId,
											responderUserId: playerId,
											responderFriendCode: friendCode,
											responderPlayerName: playerName,
											responderTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
										})
									);

									// Avoid duplicates
									if (!incomingFriendRequests.some((req) => req.fromUserId === message.fromUserId)) {
										const newRequest = {
											fromUserId: message.fromUserId,
											fromFriendCode: message.fromFriendCode,
											fromPlayerName: message.fromPlayerName,
											fromTimezone: message.fromTimezone
										};
										incomingFriendRequests = [...incomingFriendRequests, newRequest];
									}
								}
								break;
							case 'friend_request_accepted_notice':
								if (message.friend) {
									pendingFriendRequests = pendingFriendRequests.filter(
										(req) => req.friendCode !== message.friend.friendCode
									);
									const store = await load('store.json', { autoSave: false });
									await store.set('pendingFriendRequests', pendingFriendRequests);
									await store.save();
									addFriendToList(message.friend);
									alert(
										`Your friend request to ${message.friend.playerName || message.friend.friendCode} was accepted!`
									);
								}
								break;
							case 'friend_added_notice':
								if (message.friend) {
									addFriendToList(message.friend);
									// Send our logs to the new friend
									if (ws && ws.readyState === WebSocket.OPEN && playerId && message.friend.id) {
										const myLogs = await loadLogsFromDisk();
										ws.send(
											JSON.stringify({
												type: 'sync_logs',
												targetUserId: message.friend.id,
												logs: myLogs
											})
										);
									}
								}
								break;
							case 'friend_request_denied_notice':
								if (message.fromFriendCode) {
									pendingFriendRequests = pendingFriendRequests.map((req) =>
										req.friendCode === message.fromFriendCode ? { ...req, status: 'denied' } : req
									);
									const store = await load('store.json', { autoSave: false });
									await store.set('pendingFriendRequests', pendingFriendRequests);
									await store.save();
									alert(`Your friend request to ${message.fromFriendCode} was denied.`);
								}
								break;
							case 'friend_request_error':
								alert(`Friend request error: ${message.message}`);
								break;
							case 'user_came_online':
								if (message.userData && message.userData.id !== playerId) {
									const friendId = message.userData.id;
									const friendIndex = friendsList.findIndex((f) => f.id === friendId);
									if (friendIndex !== -1) {
										const oldFriendData = friendsList[friendIndex];
										friendsList = [
											...friendsList.slice(0, friendIndex),
											{
												...oldFriendData,
												isOnline: true,
												name: message.userData.playerName || oldFriendData.name,
												timezone: message.userData.timezone || oldFriendData.timezone
											},
											...friendsList.slice(friendIndex + 1)
										];
										saveFriendsListToStore();
										// Send our logs to the friend who just came online
										if (ws && ws.readyState === WebSocket.OPEN && playerId && friendId) {
											const myLogs = await loadLogsFromDisk();
											ws.send(
												JSON.stringify({
													type: 'sync_logs',
													targetUserId: friendId,
													logs: myLogs
												})
											);
										}
									}
								}
								break;
							case 'friend_details_updated':
								if (message.userData && message.userData.id !== playerId) {
									const friendIndex = friendsList.findIndex((f) => f.id === message.userData.id);
									if (friendIndex !== -1) {
										friendsList = [
											...friendsList.slice(0, friendIndex),
											{
												...friendsList[friendIndex],
												name: message.userData.playerName || friendsList[friendIndex].name,
												timezone: message.userData.timezone || friendsList[friendIndex].timezone,
												friendCode:
													message.userData.friendCode || friendsList[friendIndex].friendCode
											},
											...friendsList.slice(friendIndex + 1)
										];
										saveFriendsListToStore();
									}
								}
								break;
							case 'user_disconnected':
								if (message.userId) {
									const friendId = message.userId;
									const friendIndex = friendsList.findIndex((f) => f.id === friendId);
									if (friendIndex !== -1) {
										friendsList = [
											...friendsList.slice(0, friendIndex),
											{ ...friendsList[friendIndex], isOnline: false },
											...friendsList.slice(friendIndex + 1)
										];
										saveFriendsListToStore();
									}
								}
								break;
							case 'error':
								break;
							case 'log':
								if (message.log) {
									const log = message.log;
									// Only show logs from friends or yourself
									const isFromFriend = friendsList.some(
										(friend) => friend.id === log.userId && friend.status === 'confirmed'
									);
									const isFromMe = log.userId === playerId;
									if (isFromFriend || isFromMe) {
										fileContent = dedupeAndSortLogs([...fileContent, log]);
										appendLogToDisk(log); // Save to disk
									}
								}
								break;
							case 'friend_request_pending':
								if (
									!pendingFriendRequests.some((req) => req.friendCode === message.targetFriendCode)
								) {
									pendingFriendRequests = [
										...pendingFriendRequests,
										{ friendCode: message.targetFriendCode }
									];
									const store = await load('store.json', { autoSave: false });
									await store.set('pendingFriendRequests', pendingFriendRequests);
									await store.save();
								}
								break;
							case 'friend_removed':
								if (message.userId) {
									friendsList = friendsList.filter((f) => f.id !== message.userId);
									saveFriendsListToStore();
								}
								break;
							case 'sync_logs':
								if (message.logs && Array.isArray(message.logs)) {
									// Merge, dedupe, and save logs
									const localLogs = await loadLogsFromDisk();
									const allLogs = dedupeAndSortLogs([...localLogs, ...message.logs]);
									await saveLogsToDisk(allLogs);
									fileContent = allLogs;
								}
								break;
							default:
						}
					} catch (e) {}
				} else {
				}
			};

			socket.onclose = (event) => {
				connectionStatus = 'disconnected';
				ws = null;
				autoConnectionAttempted = false;

				friendsList = friendsList.map((friend) => ({ ...friend, isOnline: false }));
				saveFriendsListToStore();
			};

			socket.onerror = (error) => {
				connectionStatus = 'disconnected';
				ws = null;
				autoConnectionAttempted = false;

				friendsList = friendsList.map((friend) => ({ ...friend, isOnline: false }));
				saveFriendsListToStore();
			};
		} catch (error) {}
	}

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

	$effect(() => {
		if (logLocation && logLocation !== null) {
			load('store.json', { autoSave: false }).then((store) => {
				store
					.get('lastFile')
					.then((location) => {
						const originalPath = location as string;
						if (!originalPath) {
							return;
						}
						const updatedPath = originalPath.replace(
							/(\\StarCitizen\\)[^\\]+(\\Game\.log)/i,
							`$1${logLocation}$2`
						);
						fileContent = [];
						prevLineCount = 0;
						onlyProcessLogsAfterThisDateTimeStamp = null;
						file = updatedPath;
						store.set('lastFile', updatedPath).then(() => {
							handleFile(updatedPath);
						});
					})
					.catch((error) => {
						console.error('Error loading store', error);
					});
			});
		}
	});

	async function handleFile(filePath: string | null) {
		if (!filePath) return;
		try {
			tick = 0;
			const pathParts = filePath.split('\\');
			if (!logLocation) {
				logLocation =
					pathParts.length > 1
						? pathParts[pathParts.length - 2]
						: filePath.split('/').length > 1
							? filePath.split('/').slice(-2, -1)[0]
							: null;
			}

			const linesText = await readTextFile(filePath);
			const lineBreak = linesText.split('\n');
			const currentLineCount = lineBreak.length;

			if (currentLineCount <= prevLineCount && !onlyProcessLogsAfterThisDateTimeStamp) {
				// If the file hasn't grown and we don't have a specific start time, nothing new to process.
				// This check might need refinement if game log resets but we still want to process from a certain point.
				return;
			}

			// If we have a timestamp filter, we might re-process the whole file to catch up if prevLineCount was reset.
			// Otherwise, just process new lines. This logic could be refined further.
			// For now, if onlyProcessLogsAfterThisDateTimeStamp is set, we will process all lines from the game log file
			// that are newer than this timestamp, regardless of prevLineCount.
			const linesToProcess = onlyProcessLogsAfterThisDateTimeStamp
				? lineBreak
				: lineBreak.slice(prevLineCount, currentLineCount);

			prevLineCount = currentLineCount; // Update prevLineCount after slicing/deciding linesToProcess
			lineCount = currentLineCount;

			let latestProcessedTimestamp = onlyProcessLogsAfterThisDateTimeStamp || 0;

			const prevInventoryLocations: { [key: string]: { timestamp: string; location: string } } = {};

			const processedNewContent: Log[] = linesToProcess
				.map((line) => {
					if (!line.trim()) return null;

					const timestampMatch = line.match(/<([^>]+)>/);
					let timestamp = new Date().toISOString(); // Default, should be replaced
					let rawTimestampFromLog: string | undefined;

					if (timestampMatch) {
						rawTimestampFromLog = timestampMatch[1];
						if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(rawTimestampFromLog)) {
							timestamp = rawTimestampFromLog;
						} else {
							timestamp = parseLogTimestamp(rawTimestampFromLog);
						}
					}

					const currentLogTime = new Date(timestamp).getTime();

					if (
						onlyProcessLogsAfterThisDateTimeStamp &&
						currentLogTime <= onlyProcessLogsAfterThisDateTimeStamp
					) {
						return null; // Skip logs that are not newer than what we already have
					}

					let logEntry: Log | null = null;

					if (line.match(/AccountLoginCharacterStatus_Character/)) {
						const nameMatch = line.match(/- name (.*?) /);
						const oldPlayerName = playerName;
						playerName = nameMatch ? nameMatch[1] : playerName;
						if (playerName && playerName !== oldPlayerName) {
							if (ws && ws.readyState === WebSocket.OPEN && playerId && friendCode) {
								ws.send(
									JSON.stringify({
										type: 'update_my_details',
										userId: playerId,
										friendCode: friendCode,
										playerName: playerName,
										timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
									})
								);
							}
						}
						logEntry = {
							id: generateId(),
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
						const checkLocationsOverLastMinutes = (minutes: number) => {
							const prevLocation = prevInventoryLocations[playerMatch];
							if (!prevLocation) return true;
							const date = new Date(timestamp);
							const prevDate = new Date(prevLocation.timestamp);
							const diffMs = date.getTime() - prevDate.getTime();
							const isAtLeastMinutesApart = diffMs >= minutes * 60 * 1000;
							if (prevLocation && isAtLeastMinutesApart) {
								return true;
							}
							if (prevLocation.location !== locationMatch) {
								return true;
							}
							return false;
						};
						if (playerMatch === playerName && locationMatch && checkLocationsOverLastMinutes(15)) {
							prevInventoryLocations[playerMatch] = { timestamp, location: locationMatch };
							logEntry = {
								id: generateId(),
								userId: playerId!,
								player: playerName,
								emoji: '🔍',
								line: `${playerName} requested inventory in ${locationMatch}`,
								timestamp,
								original: line,
								open: false,
								eventType: 'location_change',
								metadata: {
									location: locationMatch
								}
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

							//    "original": "<2025-05-29T21:16:49.545Z> [Notice] <Actor Death> CActor::Kill: 'space-man-rob' [600682182829] in zone 'AEGS_Idris_P_602567901387' killed by 'OvRuin' [602076272105] using 'behr_lmg_ballistic_01_602567887316' [Class behr_lmg_ballistic_01] with damage type 'Bullet' from direction x: 0.811733, y: 0.533934, z: -0.236652 [Team_ActorTech][Actor]\r",
							logEntry = {
								id: generateId(),
								userId: playerId!,
								player: playerName,
								emoji: '😵',
								line: `${playerName} was `,
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

							logEntry = {
								id: generateId(),
								userId: playerId!,
								player: playerName,
								emoji: '🗡️',
								line: `${victimName} killed by ${killerName}`,
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
						//"original": "<2025-05-29T21:10:28.425Z> [Notice] <Vehicle Destruction> CVehicle::OnAdvanceDestroyLevel: Vehicle 'MRAI_Guardian_MX_602567996805' [602567996805] in zone 'pyro1' [pos x: -140667.891402, y: 313131.061752, z: 229132.608634 vel x: -22.312147, y: 0.408933, z: 14.170518] driven by 'unknown' [0] advanced from destroy level 1 to 2 caused by 'AIModule_Unmanned_PU_PDC_602567901611' [602567901611] with 'Combat' [Team_CGP4][Vehicle]\r",
						const regex =
							/Vehicle '([^']+)' \[(\d+)\].*?from destroy level (\d+) to (\d+).*?caused by '([^']+)' \[(\d+)\]/;
						const match = line.match(regex);

						if (match) {
							const vehicleName = match[1];
							const vehicleId = match[2];
							const destroyLevel = match[3];
							const destroyLevelTo = match[4];
							const causeName = match[5];
							const causeId = match[6];

							logEntry = {
								id: generateId(),
								userId: playerId!,
								player: playerName,
								emoji: destroyLevelTo === '1' ? '❌' : '💥',
								line: `${vehicleName.split('_').slice(0, -1).join(' ')} destroyed (${destroyLevelTo === '1' ? 'soft' : 'hard'}) by ${causeName.split('_').slice(0, -1).join(' ') || causeName}`,
								timestamp,
								original: line,
								open: false,
								eventType: 'destruction',
								metadata: {
									vehicleName,
									vehicleId,
									destroyLevel,
									destroyLevelTo,
									causeName,
									causeId
								}
							};
						}
					} else if (line.match(/<SystemQuit>/)) {
						logEntry = {
							id: generateId(),
							userId: playerId!,
							player: playerName,
							emoji: '👋',
							line: `${playerName || 'Player'} quit the game`,
							timestamp,
							original: line,
							open: false,
							eventType: 'system_quit'
						};
					}
					const regex = /<Vehicle Control Flow> CVehicle::Initialize/;
					// and doesn't include "Default_"
					if (regex.test(line) && !line.includes('Default_')) {
						const regex =
							/Local client node \[(\d+)\] granted control token for '([^']+)' \[(\d+)\] \[([^\]]+)\]\[([^\]]+)\]/;

						const match = line.match(regex);
						if (match) {
							//  "original": "<2025-05-30T02:57:14.890Z> [Notice] <Vehicle Control Flow> CVehicle::Initialize::<lambda_1>::operator (): Local client node [201990707292] granted control token for 'MISC_Prospector_4006139647963' [4006139647963] [Team_VehicleFeatures][Vehicle]\r",
							const vehicleName = match[2];
							const vehicleId = match[3];
							const team = match[4];
							const entityType = match[5];

							logEntry = {
								id: generateId(),
								userId: playerId!,
								player: playerName,
								emoji: '🚀',
								line: ``,
								timestamp,
								original: line,
								open: false,
								eventType: 'vehicle_control_flow',
								metadata: {
									vehicleName,
									vehicleId,
									team,
									entityType
								}
							};
						}
					}

					if (logEntry) {
						if (connectionStatus === 'connected') sendLogViaWebSocket(logEntry);
						// Don't append to disk one by one here. Collect and save later.
						if (currentLogTime > latestProcessedTimestamp) {
							latestProcessedTimestamp = currentLogTime;
						}
					}
					return logEntry;
				})
				.filter((item): item is Log => item !== null);

			if (processedNewContent.length > 0) {
				const newContentWithUserId = processedNewContent.map((log) =>
					log.userId ? log : { ...log, userId: playerId! }
				);

				// Combine with existing content, dedupe, sort, and save
				const combinedLogs = dedupeAndSortLogs([...fileContent, ...newContentWithUserId]);
				const groupedLogs = groupDestructionEvents(combinedLogs);
				await saveLogsToDisk(groupedLogs);
				fileContent = groupedLogs; // Update in-memory state

				// Update the timestamp filter to the latest processed log
				if (latestProcessedTimestamp > (onlyProcessLogsAfterThisDateTimeStamp || 0)) {
					onlyProcessLogsAfterThisDateTimeStamp = latestProcessedTimestamp;
				}
			}
			scrollToBottom();
		} catch (error) {
			console.error(error);
		}
	}

	function scrollToBottom() {
		fileContentContainer?.scrollTo({
			top: fileContentContainer.scrollHeight,
			behavior: 'smooth'
		});
	}

	async function selectFile() {
		const store = await load('store.json', { autoSave: false });
		const selectedPath = await open({
			multiple: false,
			directory: false,
			filters: [{ name: 'Game.log', extensions: ['log'] }],
			defaultPath: 'C:\\Program Files\\Roberts Space Industries\\StarCitizen'
		});

		if (typeof selectedPath === 'string' && selectedPath) {
			file = selectedPath;
			fileContent = [];
			prevLineCount = 0;
			onlyProcessLogsAfterThisDateTimeStamp = null;
			await store.set('lastFile', selectedPath);

			let storedPlayerId = await store.get<string>('id');
			if (!storedPlayerId) {
				const pathPartsForId = selectedPath.split('/');
				playerId = pathPartsForId.length > 1 ? pathPartsForId.slice(-2, -1)[0] : generateId();
				await store.set('id', playerId);
			}
			await store.save();

			await handleFile(selectedPath);
			await handleInitialiseWatch(selectedPath);

			if ((!ws || ws.readyState !== WebSocket.OPEN) && playerId) {
				connectWebSocket();
			}
		}
	}

	async function saveFriendsListToStore() {
		try {
			const store = await load('store.json', { autoSave: false });
			await store.set('friendsList', friendsList);
			await store.save();
		} catch (error) {}
	}

	function addFriendToList(newFriend: any) {
		const mappedFriend: FriendType = {
			id: newFriend.id,
			friendCode: newFriend.friendCode,
			name: newFriend.playerName || newFriend.name || newFriend.friendCode,
			status: newFriend.status || 'confirmed',
			timezone: newFriend.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
			isOnline: newFriend.isOnline !== undefined ? newFriend.isOnline : false,
			isConnected: false
		};

		// Find by id or friendCode (to catch pending entries with only friendCode)
		const existingFriendIndex = friendsList.findIndex(
			(f) => f.id === mappedFriend.id || f.friendCode === mappedFriend.friendCode
		);

		if (existingFriendIndex !== -1) {
			// Always update the entry to the new data if confirmed
			if (mappedFriend.status === 'confirmed') {
				friendsList = [
					...friendsList.slice(0, existingFriendIndex),
					{
						...friendsList[existingFriendIndex],
						...mappedFriend,
						status: 'confirmed',
						isOnline: mappedFriend.isOnline
					},
					...friendsList.slice(existingFriendIndex + 1)
				];
				saveFriendsListToStore();
			}
		} else {
			friendsList = [...friendsList, mappedFriend];
			saveFriendsListToStore();
		}
	}

	async function handleAddFriend(friendCode: string) {
		// send friend request to friend
		ws?.send(
			JSON.stringify({
				type: 'friend_request_by_code',
				targetFriendCode: friendCode,
				requesterId: playerId,
				requesterFriendCode: friendCode,
				requesterPlayerName: playerName,
				requesterTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
			})
		);
	}

	function respondToFriendRequest(
		accepted: boolean,
		request: {
			fromUserId: string;
			fromFriendCode: string;
			fromPlayerName?: string;
			fromTimezone?: string;
		}
	) {
		if (!request || !ws || !playerId || !friendCode) {
			return;
		}

		const response = {
			type: accepted ? 'friend_request_response_accept' : 'friend_request_response_deny',
			requesterUserId: request.fromUserId,
			responderUserId: playerId,
			responderFriendCode: friendCode,
			responderPlayerName: playerName,
			responderTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
		};

		ws.send(JSON.stringify(response));
		incomingFriendRequests = incomingFriendRequests.filter(
			(req) => req.fromUserId !== request.fromUserId
		);
	}

	function handleRemoveFriend(id: string) {
		const friend = friendsList.find((f) => f.id === id);
		if (friend && ws && playerId) {
			ws.send(
				JSON.stringify({
					type: 'remove_friend',
					userId: playerId,
					targetUserId: friend.id,
					friendCode: friend.friendCode
				})
			);
		}
		friendsList = friendsList.filter((f) => f.id !== id);
		saveFriendsListToStore();
	}

	async function handleRemoveFriendRequest(friendCode: string) {
		pendingFriendRequests = pendingFriendRequests.filter(
			(request: { friendCode: string }) => request.friendCode !== friendCode
		);
		const store = await load('store.json', { autoSave: false });
		await store.set('pendingFriendRequests', pendingFriendRequests);
		await store.save();
	}

	async function checkForUpdates() {
		const update = await check();
		if (update) {
				const answer = await ask(
					'A new update is available. Would you like to download and install it now?',
					{
						title: 'Update available',
						kind: 'info'
					}
				);
				if (answer) {
					update.downloadAndInstall().catch((error: any) => {
						console.error('Error downloading and installing update:', error);
					});
			}
		}
	}

	setInterval(() => {
		checkForUpdates();
	}, 1000 * 60 * 10); // 10 minutes

	setInterval(() => {
		tick += 1;
		if (tick > 5 && file) {
			handleFile(file);
		}
	}, 1000);
</script>

<main class="container">
	<Header
		{playerId}
		{friendCode}
		{friendsList}
		{saveFriendsListToStore}
		{connectWebSocket}
		{connectionStatus}
		{ws}
		{currentUserDisplayData}
		{copiedStatusVisible}
		{selectFile}
		{playerName}
		{clearLogs}
		bind:logLocation />

	<div class="content">
		<Resizer>
			{#snippet leftPanel()}
				<div class="friends-sidebar">
					<div class="friends-sidebar-container">
						{#if currentUserDisplayData}
							<User user={currentUserDisplayData} />
						{/if}
						{#if pendingFriendRequests.length > 0 || incomingFriendRequests.length > 0}
							<PendingFriendRequests
								{pendingFriendRequests}
								{incomingFriendRequests}
								removeFriendRequest={handleRemoveFriendRequest}
								respondToFriendRequest={respondToFriendRequest}
							/>
						{/if}
						<Friends {friendsList} removeFriend={handleRemoveFriend} />
					</div>
					<div class="add-friend-container">
						<AddFriend addFriend={handleAddFriend} />
					</div>
				</div>
			{/snippet}

			{#snippet rightPanel()}
				{#if hasInitialised}
					<Timeline {fileContent} {file} {friendsList} {playerName} />
				{/if}

				{#if file}
					<div class="line-count">
						Log lines processed: {Number(lineCount).toLocaleString()}
					</div>
				{/if}
			{/snippet}
		</Resizer>
	</div>
</main>

<style>
	main {
		padding: 0;
		color: #fff;
		display: grid;
		grid-template-columns: 1fr;
		grid-template-rows: auto 1fr;
		height: 100dvh;
		overflow: hidden;
	}

	.content {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.line-count {
		height: 40px;
		grid-column: 2 / 3;
		grid-row: 2 / 3;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: rgb(10, 30, 42);
		border-top: 1px solid rgba(255, 255, 255, 0.2);
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.7);
	}

	.friends-sidebar {
		/* grid-column: 1 / 2; */ /* Handled by Resizer */
		/* grid-row: 1 / 3; */ /* Handled by Resizer's grid item */
		/* border-right: 1px solid rgba(255, 255, 255, 0.2); */ /* Resizer itself will have a border */
		display: flex;
		flex-direction: column;
		overflow-y: hidden;
		height: 100%; /* Ensure it fills the resizer panel */
	}

	.friends-sidebar-container {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		overflow-y: hidden;
		flex-grow: 1;
	}

	.add-friend-container {
		margin-top: auto;
		min-width: 200px;
	}
</style>
