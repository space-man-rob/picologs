export type Log = {
	id: string;
	userId: string;
	player: string | null;
	emoji: string;
	line: string;
	timestamp: string;
	original: string;
	open: boolean;
	reportedBy?: string[];
	eventType?:
		| 'connection'
		| 'vehicle_control_flow'
		| 'actor_death'
		| 'location_change'
		| 'actor_spawn'
		| 'destruction'
		| 'system_quit'
		| 'killing_spree'
		| 'corpsify';
	metadata?: {
		vehicleName?: string;
		vehicleId?: string;
		team?: string;
		entityType?: string;
		victimName?: string;
		victimId?: string;
		zone?: string;
		killerName?: string;
		killerId?: string;
		weaponInstance?: string;
		weaponClass?: string;
		damageType?: string;
		direction?: { x: string; y: string; z: string };
		location?: string;
		destroyLevel?: string;
		destroyLevelFrom?: string;
		destroyLevelTo?: string;
		causeName?: string;
		causeId?: string;
		player?: string;
		reason?: string;
		spawnpoint?: string;
	};
	ship?: {
		vehicleId: string;
		vehicleName: string;
		team: string;
		location: string;
		events: Log[];
	};
	children?: Log[];
};

export type RecentEvent = {
	eventType: string;
	timestamp: string;
	player: string;
	emoji: string;
	metadata: {};
};

export type LogLine = {
	timestamp: string;
	player: string | null;
	emoji: string;
	line: string;
};

export type User = {
	id: string;
	name: string;
	timezone?: string;
	isOnline?: boolean;
};

export type Friend = {
	id: string;
	discordId?: string;
	friendCode: string;
	name?: string;
	avatar?: string | null;
	status: 'pending_them' | 'pending_me' | 'confirmed';
	timezone?: string;
	isOnline?: boolean;
	isConnected?: boolean;
};

export type FriendRequest = {
	id: string;
	from: string;
	to: string;
	timestamp: string;
};

export type Friends = {
	friends: Friend[];
	friendRequests: FriendRequest[];
};

export type RTCIceServer = {
	urls: string[];
	username?: string;
	credential?: string;
};

export type RTCPeerConnection = {
	iceServers: RTCIceServer[];
};

export type RTCDataChannel = {
	send: (message: string) => void;
	onmessage: (event: MessageEvent) => void;
};

export type Group = {
	id: string;
	name: string;
	description?: string;
	avatar?: string;
	tags?: string[];
	ownerId: string;
	memberRole: string; // 'owner', 'admin', 'member'
	memberCount: number;
	createdAt: string;
};

export type GroupMember = {
	userId: string;
	discordId: string;
	username: string;
	avatar?: string;
	player?: string;
	role: string;
	isOnline?: boolean;
	isConnected?: boolean;
};

export type GroupInvitation = {
	id: string;
	groupId: string;
	inviterId: string;
	status: 'pending' | 'accepted' | 'denied';
	createdAt: string;
	group: {
		id: string;
		name: string;
		description?: string;
		avatar?: string;
		tags?: string[];
	};
	inviter: {
		id: string;
		username: string;
		avatar?: string;
		player?: string;
	};
};