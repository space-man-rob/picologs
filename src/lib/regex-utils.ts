/**
 * Regex utility functions with timeout protection
 * SECURITY: Prevents ReDoS (Regular Expression Denial of Service) attacks
 */

/**
 * Execute regex match with timeout protection
 * @param pattern - Regular expression pattern
 * @param text - Text to match against
 * @param timeout - Timeout in milliseconds (default: 100ms)
 * @returns Match result or null if timeout exceeded
 */
export function safeMatch(
	pattern: RegExp,
	text: string,
	timeout: number = 100
): RegExpMatchArray | null {
	const start = Date.now();

	try {
		const match = text.match(pattern);
		const elapsed = Date.now() - start;

		if (elapsed > timeout) {
			console.warn(`[Security] Regex timeout exceeded (${elapsed}ms > ${timeout}ms)`);
			return null;
		}

		return match;
	} catch (error) {
		console.error('[Security] Regex execution error:', error);
		return null;
	}
}

/**
 * Execute regex test with timeout protection
 * @param pattern - Regular expression pattern
 * @param text - Text to test against
 * @param timeout - Timeout in milliseconds (default: 100ms)
 * @returns True if pattern matches, false otherwise or on timeout
 */
export function safeTest(
	pattern: RegExp,
	text: string,
	timeout: number = 100
): boolean {
	const start = Date.now();

	try {
		const result = pattern.test(text);
		const elapsed = Date.now() - start;

		if (elapsed > timeout) {
			console.warn(`[Security] Regex timeout exceeded (${elapsed}ms > ${timeout}ms)`);
			return false;
		}

		return result;
	} catch (error) {
		console.error('[Security] Regex execution error:', error);
		return false;
	}
}

/**
 * Execute regex exec with timeout protection
 * @param pattern - Regular expression pattern
 * @param text - Text to execute against
 * @param timeout - Timeout in milliseconds (default: 100ms)
 * @returns Exec result or null if timeout exceeded
 */
export function safeExec(
	pattern: RegExp,
	text: string,
	timeout: number = 100
): RegExpExecArray | null {
	const start = Date.now();

	try {
		const result = pattern.exec(text);
		const elapsed = Date.now() - start;

		if (elapsed > timeout) {
			console.warn(`[Security] Regex timeout exceeded (${elapsed}ms > ${timeout}ms)`);
			return null;
		}

		return result;
	} catch (error) {
		console.error('[Security] Regex execution error:', error);
		return null;
	}
}
