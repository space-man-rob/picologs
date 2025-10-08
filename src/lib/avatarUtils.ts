/**
 * Avatar utility functions
 */

/**
 * Check if avatar is a valid Discord avatar hash (not just a default avatar index)
 */
export function isValidAvatarHash(avatar: string | null | undefined): boolean {
	if (!avatar) return false;
	// Discord avatar hashes are alphanumeric strings (usually 32 chars)
	// Default avatars are just single digits (0-5), which are not valid custom avatars
	const cleanAvatar = avatar.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '');
	return cleanAvatar.length > 2 && /^[a-zA-Z0-9_]+$/.test(cleanAvatar);
}

/**
 * Get Discord CDN avatar URL
 */
export function getAvatarUrl(
	discordId: string | null | undefined,
	avatar: string | null | undefined,
	size: number = 128
): string | null {
	if (!avatar || !discordId || !isValidAvatarHash(avatar)) return null;

	// If avatar is already a full URL, return it
	if (avatar.startsWith('http://') || avatar.startsWith('https://')) {
		return avatar;
	}

	// Strip any existing extension to avoid duplication (.png.png)
	const avatarHash = avatar.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '');

	return `${import.meta.env.VITE_DISCORD_CDN_URL}/avatars/${discordId}/${avatarHash}.png?size=${size}`;
}
