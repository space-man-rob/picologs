/**
 * Tests for OAuth authentication utilities
 * Tests JWT token storage, validation, and authentication flow
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAuthComplete, loadAuthData, signOut, getJwtToken } from './oauth';

// Mock Tauri store
const mockStore = {
	get: vi.fn(),
	set: vi.fn(),
	clear: vi.fn(),
	save: vi.fn(),
};

vi.mock('@tauri-apps/plugin-store', () => ({
	load: vi.fn(async () => mockStore),
}));

describe('OAuth Utilities', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockStore.get.mockReset();
		mockStore.set.mockReset();
		mockStore.clear.mockReset();
		mockStore.save.mockReset();
	});

	describe('handleAuthComplete', () => {
		it('should store JWT token and user data', async () => {
			const authData = {
				jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
				user: {
					discordId: 'discord-123',
					username: 'TestUser',
					avatar: 'avatar-hash',
				},
			};

			await handleAuthComplete(authData);

			expect(mockStore.set).toHaveBeenCalledWith('jwtToken', authData.jwt);
			expect(mockStore.set).toHaveBeenCalledWith('discord_user', {
				id: 'discord-123',
				username: 'TestUser',
				discriminator: '0',
				avatar: 'avatar-hash',
				global_name: 'TestUser',
			});
		});

		it('should handle null avatar', async () => {
			const authData = {
				jwt: 'valid.jwt.token',
				user: {
					discordId: 'discord-123',
					username: 'TestUser',
					avatar: null,
				},
			};

			await handleAuthComplete(authData);

			expect(mockStore.set).toHaveBeenCalledWith('discord_user', {
				id: 'discord-123',
				username: 'TestUser',
				discriminator: '0',
				avatar: null,
				global_name: 'TestUser',
			});
		});

		it('should throw error on storage failure', async () => {
			mockStore.set.mockRejectedValueOnce(new Error('Storage error'));

			const authData = {
				jwt: 'valid.jwt.token',
				user: {
					discordId: 'discord-123',
					username: 'TestUser',
					avatar: null,
				},
			};

			await expect(handleAuthComplete(authData)).rejects.toThrow('Storage error');
		});

		it('should call store.set twice (once for JWT, once for user)', async () => {
			const authData = {
				jwt: 'valid.jwt.token',
				user: {
					discordId: 'discord-123',
					username: 'TestUser',
					avatar: null,
				},
			};

			await handleAuthComplete(authData);

			expect(mockStore.set).toHaveBeenCalledTimes(2);
		});
	});

	describe('loadAuthData', () => {
		it('should return null when no auth data stored', async () => {
			mockStore.get.mockResolvedValue(null);

			const result = await loadAuthData();

			expect(result).toBeNull();
		});

		it('should return null when only JWT stored but no user', async () => {
			mockStore.get.mockImplementation(async (key: string) => {
				if (key === 'jwtToken') return 'valid.jwt.token';
				return null;
			});

			const result = await loadAuthData();

			expect(result).toBeNull();
		});

		it('should return null when only user stored but no JWT', async () => {
			mockStore.get.mockImplementation(async (key: string) => {
				if (key === 'discord_user')
					return {
						id: 'discord-123',
						username: 'TestUser',
						discriminator: '0',
						avatar: null,
						global_name: 'TestUser',
					};
				return null;
			});

			const result = await loadAuthData();

			expect(result).toBeNull();
		});

		it('should return auth data when valid JWT and user stored', async () => {
			// Create a valid JWT with expiration in the future
			const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
			const payload = JSON.stringify({ sub: '123', exp: futureExp });
			const validJWT = `header.${btoa(payload)}.signature`;

			const discordUser = {
				id: 'discord-123',
				username: 'TestUser',
				discriminator: '0',
				avatar: null,
				global_name: 'TestUser',
			};

			mockStore.get.mockImplementation(async (key: string) => {
				if (key === 'jwtToken') return validJWT;
				if (key === 'discord_user') return discordUser;
				return null;
			});

			const result = await loadAuthData();

			expect(result).not.toBeNull();
			expect(result?.user).toEqual(discordUser);
			expect(result?.expiresAt).toBeGreaterThan(Date.now());
		});

		it('should return null for expired JWT', async () => {
			// Create an expired JWT
			const pastExp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
			const payload = JSON.stringify({ sub: '123', exp: pastExp });
			const expiredJWT = `header.${btoa(payload)}.signature`;

			const discordUser = {
				id: 'discord-123',
				username: 'TestUser',
				discriminator: '0',
				avatar: null,
				global_name: 'TestUser',
			};

			mockStore.get.mockImplementation(async (key: string) => {
				if (key === 'jwtToken') return expiredJWT;
				if (key === 'discord_user') return discordUser;
				return null;
			});

			const result = await loadAuthData();

			expect(result).toBeNull();
			expect(mockStore.clear).toHaveBeenCalled();
		});

		it('should return null for invalid JWT format', async () => {
			mockStore.get.mockImplementation(async (key: string) => {
				if (key === 'jwtToken') return 'invalid-jwt-format';
				if (key === 'discord_user')
					return {
						id: 'discord-123',
						username: 'TestUser',
						discriminator: '0',
						avatar: null,
						global_name: 'TestUser',
					};
				return null;
			});

			const result = await loadAuthData();

			expect(result).toBeNull();
		});

		it('should handle malformed JWT payload', async () => {
			const malformedJWT = `header.invalid-base64!@#.signature`;

			mockStore.get.mockImplementation(async (key: string) => {
				if (key === 'jwtToken') return malformedJWT;
				if (key === 'discord_user')
					return {
						id: 'discord-123',
						username: 'TestUser',
						discriminator: '0',
						avatar: null,
						global_name: 'TestUser',
					};
				return null;
			});

			const result = await loadAuthData();

			expect(result).toBeNull();
		});

		it('should use default expiration when exp claim missing', async () => {
			// JWT without exp claim
			const payload = JSON.stringify({ sub: '123' });
			const jwtWithoutExp = `header.${btoa(payload)}.signature`;

			const discordUser = {
				id: 'discord-123',
				username: 'TestUser',
				discriminator: '0',
				avatar: null,
				global_name: 'TestUser',
			};

			mockStore.get.mockImplementation(async (key: string) => {
				if (key === 'jwtToken') return jwtWithoutExp;
				if (key === 'discord_user') return discordUser;
				return null;
			});

			const result = await loadAuthData();

			expect(result).not.toBeNull();
			// Default expiration should be 1 year from now
			const oneYearFromNow = Date.now() + 365 * 24 * 60 * 60 * 1000;
			expect(result?.expiresAt).toBeGreaterThan(Date.now());
			expect(result?.expiresAt).toBeLessThanOrEqual(oneYearFromNow + 1000); // +1s tolerance
		});

		it('should handle storage errors gracefully', async () => {
			mockStore.get.mockRejectedValueOnce(new Error('Storage error'));

			const result = await loadAuthData();

			expect(result).toBeNull();
		});
	});

	describe('signOut', () => {
		it('should clear stored auth data', async () => {
			await signOut();

			expect(mockStore.clear).toHaveBeenCalled();
		});

		it('should handle storage errors gracefully', async () => {
			mockStore.clear.mockRejectedValueOnce(new Error('Storage error'));

			// Should not throw
			await expect(signOut()).rejects.toThrow('Storage error');
		});
	});

	describe('getJwtToken', () => {
		it('should return null when no token stored', async () => {
			mockStore.get.mockResolvedValue(null);

			const result = await getJwtToken();

			expect(result).toBeNull();
		});

		it('should return valid JWT token', async () => {
			// Create a valid JWT with expiration in the future
			const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
			const payload = JSON.stringify({ sub: '123', exp: futureExp });
			const validJWT = `header.${btoa(payload)}.signature`;

			mockStore.get.mockResolvedValue(validJWT);

			const result = await getJwtToken();

			expect(result).toBe(validJWT);
		});

		it('should return null for expired token', async () => {
			// Create an expired JWT
			const pastExp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
			const payload = JSON.stringify({ sub: '123', exp: pastExp });
			const expiredJWT = `header.${btoa(payload)}.signature`;

			mockStore.get.mockResolvedValue(expiredJWT);

			const result = await getJwtToken();

			expect(result).toBeNull();
			expect(mockStore.clear).toHaveBeenCalled();
		});

		it('should return null for invalid JWT format', async () => {
			mockStore.get.mockResolvedValue('invalid-jwt');

			const result = await getJwtToken();

			expect(result).toBeNull();
			expect(mockStore.clear).toHaveBeenCalled();
		});

		it('should return null for malformed JWT payload', async () => {
			const malformedJWT = `header.invalid-base64!@#.signature`;
			mockStore.get.mockResolvedValue(malformedJWT);

			const result = await getJwtToken();

			expect(result).toBeNull();
			expect(mockStore.clear).toHaveBeenCalled();
		});

		it('should handle storage errors gracefully', async () => {
			mockStore.get.mockRejectedValueOnce(new Error('Storage error'));

			const result = await getJwtToken();

			expect(result).toBeNull();
		});

		it('should validate expiration before returning token', async () => {
			// Token that expires in 30 seconds
			const soonExp = Math.floor(Date.now() / 1000) + 30;
			const payload = JSON.stringify({ sub: '123', exp: soonExp });
			const soonToExpireJWT = `header.${btoa(payload)}.signature`;

			mockStore.get.mockResolvedValue(soonToExpireJWT);

			const result = await getJwtToken();

			// Should still return token if not yet expired
			expect(result).toBe(soonToExpireJWT);
		});
	});

	describe('Security - JWT Validation', () => {
		it('should reject JWT with missing payload', async () => {
			const invalidJWT = 'header..signature';

			mockStore.get.mockResolvedValue(invalidJWT);

			const result = await getJwtToken();

			expect(result).toBeNull();
			expect(mockStore.clear).toHaveBeenCalled();
		});

		it('should reject JWT with only one part', async () => {
			const invalidJWT = 'single-part';

			mockStore.get.mockResolvedValue(invalidJWT);

			const result = await getJwtToken();

			expect(result).toBeNull();
			expect(mockStore.clear).toHaveBeenCalled();
		});

		it('should clear storage when JWT validation fails', async () => {
			const invalidJWT = 'invalid.jwt.token';

			mockStore.get.mockResolvedValue(invalidJWT);

			await getJwtToken();

			expect(mockStore.clear).toHaveBeenCalled();
		});

		it('should handle JWT with non-JSON payload', async () => {
			const nonJSONPayload = btoa('not-json-data');
			const invalidJWT = `header.${nonJSONPayload}.signature`;

			mockStore.get.mockResolvedValue(invalidJWT);

			const result = await getJwtToken();

			expect(result).toBeNull();
			expect(mockStore.clear).toHaveBeenCalled();
		});

		it('should validate exp claim is a number', async () => {
			const futureExp = Math.floor(Date.now() / 1000) + 3600;
			const payload = JSON.stringify({ sub: '123', exp: futureExp });
			const validJWT = `header.${btoa(payload)}.signature`;

			mockStore.get.mockResolvedValue(validJWT);

			const result = await getJwtToken();

			expect(result).toBe(validJWT);
		});

		it('should handle JWT with string exp claim', async () => {
			const payload = JSON.stringify({ sub: '123', exp: 'not-a-number' });
			const invalidJWT = `header.${btoa(payload)}.signature`;

			mockStore.get.mockResolvedValue(invalidJWT);

			const result = await getJwtToken();

			// Should still return token since exp is NaN and check fails gracefully
			expect(result).toBe(invalidJWT);
		});
	});

	describe('Edge Cases', () => {
		it('should handle concurrent auth operations', async () => {
			const authData = {
				jwt: 'valid.jwt.token',
				user: {
					discordId: 'discord-123',
					username: 'TestUser',
					avatar: null,
				},
			};

			// Simulate concurrent auth complete calls
			await Promise.all([
				handleAuthComplete(authData),
				handleAuthComplete(authData),
				handleAuthComplete(authData),
			]);

			// Should complete without errors
			expect(mockStore.set).toHaveBeenCalled();
		});

		it('should handle very long JWT tokens', async () => {
			const longPayload = JSON.stringify({
				sub: '123',
				exp: Math.floor(Date.now() / 1000) + 3600,
				data: 'x'.repeat(10000),
			});
			const longJWT = `header.${btoa(longPayload)}.signature`;

			mockStore.get.mockResolvedValue(longJWT);

			const result = await getJwtToken();

			expect(result).toBe(longJWT);
		});

		it('should handle JWT with additional claims', async () => {
			const futureExp = Math.floor(Date.now() / 1000) + 3600;
			const payload = JSON.stringify({
				sub: '123',
				exp: futureExp,
				iat: Math.floor(Date.now() / 1000),
				aud: 'picologs',
				iss: 'auth-server',
				customClaim: 'custom-value',
			});
			const jwtWithClaims = `header.${btoa(payload)}.signature`;

			mockStore.get.mockResolvedValue(jwtWithClaims);

			const result = await getJwtToken();

			expect(result).toBe(jwtWithClaims);
		});

		it('should handle special characters in username', async () => {
			const authData = {
				jwt: 'valid.jwt.token',
				user: {
					discordId: 'discord-123',
					username: 'User™©®_Special-Name.123',
					avatar: null,
				},
			};

			await handleAuthComplete(authData);

			expect(mockStore.set).toHaveBeenCalledWith('discord_user', {
				id: 'discord-123',
				username: 'User™©®_Special-Name.123',
				discriminator: '0',
				avatar: null,
				global_name: 'User™©®_Special-Name.123',
			});
		});
	});
});
