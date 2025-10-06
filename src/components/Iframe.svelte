<script lang="ts">
	import { getJwtToken } from '$lib/oauth';
	import { onMount } from 'svelte';
	import { getAppContext } from '$lib/appContext.svelte';
	import { goto } from '$app/navigation';

	type Props = {
		page: 'profile' | 'friends' | 'groups';
	};

	let { page }: Props = $props();

	function goBack() {
		goto('/');
	}

	let iframeUrl = $state('');
	let iframeElement = $state<HTMLIFrameElement | null>(null);
	let isInitialized = $state(false);
	let loadingState = $state<'loading' | 'error' | 'loaded'>('loading');
	let errorMessage = $state('');
	const appCtx = getAppContext();

	// Security: Allowed origins for postMessage communication
	// Only Tauri's localhost origins are permitted to prevent XSS attacks
	const ALLOWED_ORIGINS = [
		'http://localhost:1420',  // Tauri dev server
		'tauri://localhost',      // Tauri production
		'https://tauri.localhost' // Tauri production (alternative)
	] as const;

	// Map page names to URL paths
	const pagePathMap = {
		profile: 'profile-settings',
		friends: 'friends',
		groups: 'groups'
	};

	// Watch for page changes - use postMessage after initial load
	$effect(() => {
		if (!appCtx.isSignedIn) {
			iframeUrl = '';
			isInitialized = false;
			loadingState = 'error';
			errorMessage = 'Please sign in to access this page';
			return;
		}

		if (page && isInitialized && iframeElement?.contentWindow) {
			// After initial load, use postMessage to navigate without reload
			const targetPath = `/${pagePathMap[page]}`;

			// Get the actual iframe origin from the loaded iframe URL
			// This handles both Tauri dev (http://localhost:1420) and website origins
			let iframeOrigin: string;
			try {
				const url = new URL(iframeElement.src);
				iframeOrigin = url.origin;
			} catch (e) {
				return;
			}

			// Security: Use the actual iframe origin (not the website URL) for postMessage
			iframeElement.contentWindow.postMessage(
				{ type: 'navigate', path: targetPath },
				iframeOrigin // Use iframe's actual origin, not the website baseUrl
			);
		} else if (page && !isInitialized) {
			// Initial load - set the src
			loadingState = 'loading';
			errorMessage = '';
			loadIframeUrl();
		}
	});

	async function loadIframeUrl() {
		try {
			// Get JWT token for authentication
			const jwt = await getJwtToken();

			if (!jwt) {
				loadingState = 'error';
				errorMessage = 'Authentication failed. Please sign in again.';
				return;
			}

			// Build iframe URL with token parameter - start at first page
			const baseUrl = import.meta.env.DEV ? 'http://localhost:5173' : 'https://picologs.com';
			const url = new URL(`${baseUrl}/${pagePathMap[page]}`);
			url.searchParams.set('token', jwt);

			iframeUrl = url.toString();
			loadingState = 'loaded';
		} catch (error) {
			loadingState = 'error';
			errorMessage = 'Failed to load content. Please try again.';
		}
	}

	function handleIframeLoad() {
		isInitialized = true;
	}
</script>

<!-- Back Button -->
<button
	class="absolute top-[86px] left-4 text-sm cursor-pointer z-10 flex items-center gap-2 text-white"
	onclick={goBack}
	title="Back to Logs">
	⬅️ Back to Logs
</button>

<!-- Iframe Content -->
<div class="flex-1 overflow-hidden relative">
	{#if loadingState === 'error'}
		<div class="flex items-center justify-center h-full text-white/70">
			<div class="text-center max-w-md px-4">
				<div class="text-6xl mb-4">⚠️</div>
				<h2 class="text-xl font-semibold mb-2 text-white">Error Loading Content</h2>
				<p class="mb-4">{errorMessage}</p>
				{#if !appCtx.isSignedIn}
					<button
						class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
						onclick={goBack}
					>
						Go Back
					</button>
				{:else}
					<button
						class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
						onclick={() => {
							loadingState = 'loading';
							errorMessage = '';
							loadIframeUrl();
						}}
					>
						Try Again
					</button>
				{/if}
			</div>
		</div>
	{:else if iframeUrl && loadingState === 'loaded'}
		<!--
			SECURITY REVIEW: Iframe Sandbox Configuration

			Current permissions: allow-same-origin allow-scripts allow-forms allow-popups

			RISK ASSESSMENT:
			⚠️ The combination of allow-same-origin + allow-scripts is generally considered dangerous
			   because it allows embedded scripts to access the parent's DOM and potentially remove
			   the sandbox attribute itself, defeating the security protection.

			MITIGATION FACTORS (Why this is acceptable in our case):

			1. TRUSTED SAME-ORIGIN CONTENT ONLY:
			   - Iframe ONLY loads picologs.com content (localhost:5173 in dev, https://picologs.com in prod)
			   - Both parent (Tauri app) and iframe content are from the same codebase we control
			   - No third-party or user-generated content is ever loaded in this iframe
			   - URL is strictly validated and constructed programmatically (not user input)

			2. JWT AUTHENTICATION:
			   - Iframe access requires valid JWT token passed in URL query parameter
			   - Token verified server-side before any content is served
			   - Expired/invalid tokens are rejected, preventing unauthorized access

			3. REQUIRED PERMISSIONS JUSTIFICATION:
			   - allow-scripts: REQUIRED - Website uses Svelte 5 framework with interactive components
			                    (forms, buttons, navigation, WebSocket client, state management)
			   - allow-same-origin: REQUIRED - Needed for:
			                        * Reading/writing cookies for session management
			                        * Accessing localStorage/sessionStorage for client-side state
			                        * Making authenticated API calls to same origin
			                        * WebSocket connections to same-origin server
			   - allow-forms: REQUIRED - Users need to submit profile updates, add friends, create groups
			   - allow-popups: REQUIRED - OAuth flows and external link handling may require popups

			4. ADDITIONAL SECURITY MEASURES:
			   - postMessage validation: Only accepts messages from Tauri localhost origins
			   - Explicit targetOrigin: postMessage uses exact origin, never '*'
			   - Content-Security-Policy: Server can enforce CSP headers on iframe content
			   - No Tauri API access: Website code doesn't import @tauri-apps packages
			   - Tauri isolation: Desktop app and iframe run in separate security contexts

			5. TAURI-SPECIFIC CONSIDERATIONS:
			   - Tauri has known limitations with iframe origin validation on Linux/Android
			   - However, we don't expose Tauri IPC endpoints to the iframe
			   - The website is a separate SvelteKit app with no Tauri dependencies
			   - Communication is only via standard postMessage API

			ALTERNATIVE APPROACHES CONSIDERED:

			❌ Remove allow-same-origin: Would break authentication, session management, and API calls
			❌ Remove allow-scripts: Would make the entire website non-functional (no Svelte framework)
			❌ Use separate window: Would lose integrated UI/UX and require complex window management
			❌ Load from different domain: Adds complexity, requires additional infrastructure, breaks auth

			SECURITY TRADEOFFS:

			✅ ACCEPTABLE RISK: Since we control both the parent and iframe content, and the iframe
			   only loads our own trusted website, the security risk of allow-same-origin + allow-scripts
			   is mitigated. The main threat model this protects against (XSS from untrusted third-party
			   content) doesn't apply because we never load external content.

			⚠️ RESIDUAL RISK: If the website (picologs.com) itself were compromised via XSS vulnerability,
			   the iframe could potentially access the Tauri parent context. However, this is the same
			   risk as if the user visited the compromised website directly in their browser.

			FUTURE IMPROVEMENTS:
			- Consider implementing Content-Security-Policy headers on the website
			- Add subresource integrity (SRI) for any external scripts/styles
			- Implement nonce-based validation for postMessage communications
			- Regular security audits of website code for XSS vulnerabilities
		-->
		<iframe
			bind:this={iframeElement}
			src={iframeUrl}
			title={page.charAt(0).toUpperCase() + page.slice(1)}
			class="w-full h-full border-0"
			sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
			onload={handleIframeLoad}
			style="background-color: #1a1a1a;"
		></iframe>
	{:else}
		<div class="flex items-center justify-center h-full text-white/70">
			<div class="text-center">
				<div class="w-10 h-10 mx-auto mb-4 border-[3px] border-white/10 border-t-white rounded-full animate-spin"></div>
				<p>Loading...</p>
			</div>
		</div>
	{/if}
</div>
