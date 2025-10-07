import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	// Optimize dependencies to prevent reload issues
	optimizeDeps: {
		include: [
			'@tauri-apps/plugin-process',
			'@tauri-apps/plugin-http',
			'@tauri-apps/plugin-fs',
			'@tauri-apps/plugin-store',
			'@tauri-apps/plugin-dialog',
			'@tauri-apps/plugin-websocket',
			'@tauri-apps/plugin-opener',
			'@tauri-apps/plugin-updater',
			'date-fns',
		],
	},
	test: {
		// Enable browser mode for component tests
		browser: {
			enabled: true,
			provider: 'playwright',
			name: 'chromium',
			headless: true,
			// Prevent unexpected reloads
			screenshotFailures: false,
		},
		// Setup file for browser environment
		setupFiles: ['./src/tests/setup-browser.ts'],
		// Include only Svelte component tests
		include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
		// Coverage configuration for browser tests
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
		},
		// Global test timeout
		testTimeout: 30000,
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
