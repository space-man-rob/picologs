export type Log = {
	id: string;
	userId: string;
	player: string | null;
	emoji: string;
	line: string;
	timestamp: string;
	original: string;
	open: boolean;
	eventType?: string;
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
	};
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
	friendCode: string;
	name?: string;
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