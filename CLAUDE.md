# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Picologs is a Tauri desktop application for viewing and filtering Star Citizen Game.log files. It features real-time log monitoring, social features via WebSocket connection to a backend server, and Discord-based authentication.

## Tech Stack

- **Frontend**: SvelteKit 2 with Svelte 5 (runes API), TypeScript, TailwindCSS
- **Desktop Runtime**: Tauri 2 (Rust backend with webview frontend)
- **Build**: Vite with static adapter (SSG, no SSR)
- **Backend Integration**: WebSocket client connecting to configurable remote server (configured via environment variables)

## Development Commands

```bash
# Start development server with hot reload
npm run dev

# Build the application
npm run build

# Preview production build
npm run preview

# Type checking
npm run check

# Type checking with watch mode
npm run check:watch

# Run Tauri-specific commands
npm run tauri [command]
```

## Architecture

### Frontend Architecture

**Svelte 5 Runes-Based State Management**
- Uses Svelte 5's `$state`, `$derived`, `$effect` runes instead of stores
- Shared app state managed via context API (not Svelte stores)
- App-wide context in `src/lib/appContext.svelte.ts` using `setAppContext()` and `getAppContext()`

**Context Structure (`AppContext` class)**
- Authentication state: `isSignedIn`, `discordUser`, `discordUserId`, `jwtToken`, `authSessionId`, `authError`
- WebSocket state: `ws`, `connectionStatus`, `connectionError`
- Friends/API data: `friendsList`, `apiFriends`, `apiFriendRequests`, `apiUserProfile`
- Page actions: `pageActions` object for header-to-page communication

**Layout and Page Structure**
- `src/routes/+layout.svelte`: Root layout, initializes `AppContext`, handles auth and WebSocket lifecycle
- `src/routes/+page.svelte`: Main log viewer page with file watching and real-time updates
- `src/routes/profile/+page.svelte`: User profile settings with JWT-authenticated iframe

### Authentication Flow

**Discord App OAuth with Website Bridge:**
- User clicks sign in → Desktop app establishes WebSocket connection
- App sends `init_desktop_auth` message with session ID to WebSocket
- App opens Discord app using `discord://-/oauth2/authorize` with `https://picologs.com/auth/desktop/callback` redirect URI
- User authorizes in Discord app → Discord redirects to website with OAuth code
- Website receives OAuth code and immediately redirects to `picologs://auth/callback?code=...&state={sessionId}`
- Desktop app receives deep link callback via Tauri's deep link plugin
- App sends OAuth code + session ID to server via WebSocket (`discord_oauth_callback` message)
- Server exchanges OAuth code for Discord user info, creates JWT, sends `auth_complete` via WebSocket
- Desktop app stores JWT in `auth.json` Tauri store
- App disconnects temp auth WebSocket and connects to main WebSocket with JWT
- JWT used for all subsequent WebSocket authentication

**Note:** Discord only accepts `http://` or `https://` redirect URIs, so the website acts as a bridge to redirect back to the desktop app using the `picologs://` protocol.

**JWT Token Storage and Usage:**
- Stored in Tauri store `auth.json` under key `jwtToken`
- Retrieved via `getJwtToken()` from `src/lib/oauth.ts`
- Sent in WebSocket `register` message for authentication
- Used to authenticate profile page iframe via query parameter

### WebSocket Communication

**Connection Pattern (`src/lib/api.ts`)**
- Singleton WebSocket instance managed by `connectWebSocket()`
- Request-response pattern: Each request gets unique `requestId` for matching responses
- Subscription pattern: Register handlers via `subscribe()` for server-sent events
- Auto-reconnection logic in layout with exponential backoff

**Message Types:**
- `register`: Initial authentication with JWT
- `get_user_profile`, `get_friends`, `get_friend_requests`: Data fetching
- `send_friend_request`, `accept_friend_request`, `deny_friend_request`, `remove_friend`: Friend actions
- `registered`, `refetch_friends`, `refetch_friend_requests`: Server notifications
- `user_online`, `user_offline`: Real-time presence updates

**WebSocket Lifecycle:**
1. User signs in → JWT stored
2. `connectWebSocket()` called with Discord user ID
3. Subscribe to message types BEFORE connecting
4. Send `register` message with JWT token
5. Server responds with `registered` event
6. Sync user profile, friends, and friend requests from API

### Tauri Integration

**Plugins Used:**
- `tauri-plugin-fs`: File system access with `watch` feature for log monitoring
- `tauri-plugin-store`: Persistent key-value storage for auth and app state
- `tauri-plugin-websocket`: WebSocket client for backend communication
- `tauri-plugin-dialog`: Native file dialogs for log file selection
- `tauri-plugin-opener`: Opening URLs in system browser
- `tauri-plugin-updater`: Auto-update functionality
- `tauri-plugin-deep-link`: Deep link handling for OAuth callback (legacy)
- `tauri-plugin-single-instance`: Prevent multiple app instances
- `tauri-plugin-http`: HTTP client for API calls
- `tauri-plugin-process`: Process management

**Rust Backend:**
- Minimal Rust code in `src-tauri/src/lib.rs`
- Single demo command: `greet(name: &str)`
- All heavy lifting done in TypeScript frontend via Tauri plugins

### File Watching and Log Processing

**Log File Monitoring:**
- Uses `watchImmediate()` from `tauri-plugin-fs` to monitor Game.log file
- Detects environment (LIVE/PTU/HOTFIX) from file path
- Incremental reading: Only processes new lines since last read
- Deduplication by log ID to prevent duplicates

**Log Storage:**
- Logs persisted to `{appDataDir}/logs.json`
- Structured log format with event types, metadata, and player info
- Event types: `connection`, `vehicle_control_flow`, `actor_death`, `location_change`, etc.

## Common Development Patterns

**Adding New WebSocket Message Handlers:**
1. Add TypeScript interface for message data in `src/lib/api.ts`
2. Create async function using `sendRequest<T>()` for request-response
3. Or use `subscribe()` in layout for server-sent notifications
4. Update `AppContext` if state needs to be shared across pages

**Working with Svelte 5 Context:**
1. Import `getAppContext()` in page/component
2. Access reactive state: `appCtx.propertyName`
3. Mutations trigger reactivity automatically (no `.set()` needed)
4. For page-specific actions, update `appCtx.pageActions` object

**Adding Tauri Commands:**
1. Define Rust function in `src-tauri/src/lib.rs` with `#[tauri::command]`
2. Add to `invoke_handler!` macro in `run()` function
3. Call from TypeScript using `invoke('command_name', { args })`

**Updating Dependencies:**
- Frontend: `npm update` for Node packages
- Rust: `cd src-tauri && cargo update`
- Tauri CLI: `npm install @tauri-apps/cli@latest -D`

## Project-Specific Notes

**Star Citizen Integration:**
- Parses Game.log files from `%APPDATA%\Roberts Space Industries\StarCitizen\{ENVIRONMENT}\`
- Extracts player name and ID from log file header
- Recognizes event patterns for kills, deaths, vehicle control, location changes
- Ship data sourced from Fleet Yards (https://fleetyards.net/)

**Multi-User Sync:**
- Friend system allows sharing logs between users in real-time
- Online presence tracked via WebSocket presence events
- Timezone support for displaying friend activity in local time

**Build Configuration:**
- Static adapter for SvelteKit (no Node.js server in Tauri)
- Vite dev server on port 1420 (required by Tauri)
- HMR via WebSocket on port 1421
- Rust source code excluded from Vite watch
