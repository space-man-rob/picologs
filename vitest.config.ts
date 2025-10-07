import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		// Use happy-dom for unit tests (faster than browser mode)
		environment: 'happy-dom',
		// Setup file for global mocks
		setupFiles: ['./src/tests/setup.ts'],
		// Include only unit test files (no component tests)
		include: ['src/**/*.{test,spec}.{js,ts}'],
		// Exclude component tests (use vitest.browser.config.ts for those)
		exclude: [
			'**/node_modules/**',
			'**/dist/**',
			'**/.svelte-kit/**',
			'src/**/*.svelte.{test,spec}.{js,ts}',
		],
		// Coverage configuration
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			include: ['src/**/*.{js,ts,svelte}'],
			exclude: [
				'src/tests/**',
				'src/**/*.{test,spec}.{js,ts}',
				'src/**/*.svelte.{test,spec}.{js,ts}',
				'**/*.config.{js,ts}',
			],
			// Coverage thresholds
			thresholds: {
				lines: 70,
				functions: 70,
				branches: 65,
				statements: 70,
			},
		},
		// Global test timeout
		testTimeout: 10000,
		// Retry failed tests once
		retry: 1,
	},
	resolve: {
		alias: {
			$lib: '/src/lib',
			$app: '/.svelte-kit/runtime/app',
		},
	},
});
