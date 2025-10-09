# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Picologs is a Tauri desktop application for viewing and filtering Star Citizen Game.log files. It features real-time log monitoring, social features via WebSocket connection to a backend server, and Discord-based authentication.

## Tech Stack

- **Frontend**: SvelteKit 2 with Svelte 5 (runes API), TypeScript, TailwindCSS
- **Desktop Runtime**: Tauri 2 (Rust backend with webview frontend)
- **Build**: Vite with static adapter (SSG, no SSR)
- **Backend Integration**: WebSocket client connecting to configurable remote server (configured via environment variables)
- **Shared Components**: `@space-man-rob/shared-components` from GitHub Packages (private package)

## Shared Components

This project uses shared Svelte 5 components from `@space-man-rob/shared-components`, a private npm package published to GitHub Packages. These components are designed with a prop-based architecture and work across both the desktop app and website.

**Available Components:**
- **ProfilePage**: User profile management component (used in `src/routes/profile/+page.svelte`)
- **SubNav**: Side navigation component

**Installation:**
Components are installed via npm and require GitHub authentication:

```bash
export GITHUB_TOKEN=$(gh auth token)
npm install
```

**Authentication Required:**
The package is private and requires a GitHub Personal Access Token with `read:packages` scope. Contributors need to set the `GITHUB_TOKEN` environment variable before running `npm install`.

**Usage Pattern:**
Shared components accept all data via props and use callbacks for side effects:

```svelte
<script lang="ts">
  import { ProfilePage } from '@space-man-rob/shared-components';

  async function handleSave(data) {
    const updated = await updateUserProfile(data); // WebSocket API
    appCtx.apiUserProfile = { ...appCtx.apiUserProfile!, ...updated };
  }
</script>

<ProfilePage
  userProfile={appCtx.apiUserProfile}
  onSave={handleSave}
  onNotification={appCtx.addNotification}
/>
```

See the monorepo's `shared-components/PUBLISHING.md` for more details on the shared components system.

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
- `src/routes/profile/+page.svelte`: User profile settings using shared ProfilePage component

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
- `tauri-plugin-deep-link`: Deep link handling for OAuth callback
- `tauri-plugin-single-instance`: Prevent multiple app instances (forwards deep links to first instance)
- `tauri-plugin-http`: HTTP client for API calls
- `tauri-plugin-process`: Process management
- `tauri-plugin-persisted-scope`: Persistent file system permissions

**Rust Backend:**

- Minimal Rust code in `src-tauri/src/lib.rs`
- Commands:
  - `greet(name: &str)`: Demo greeting command
  - `find_star_citizen_logs()`: Auto-detects Star Citizen log file locations via Windows registry and %APPDATA%
- Menu integration: Custom Help menu items for Terms of Service and Privacy Policy
- Most heavy lifting done in TypeScript frontend via Tauri plugins

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

**Log Grouping & Features:**

- **Killing Spree Detection**: Automatically groups sequential kills within 2-minute window
  - Minimum 2 kills to create a spree
  - Parent log shows total kill count with red highlight
  - Child logs expandable to see individual kills
  - Visual indicator: Red border and background (`bg-red-500/10 border-l-4 border-red-500`)

- **Delta Sync**: Efficient log synchronization with friends
  - Tracks last sync timestamp per friend in `friendSyncTimestamps` (SvelteMap)
  - Only sends logs newer than last sync timestamp
  - Stored in Tauri store: `store.json` → `friendSyncTimestamps`
  - Triggered when friend comes online

- **Batch Sending**: Reduces network overhead
  - Buffers logs: 2.5 second interval OR 8 logs (whichever first)
  - Separate buffers for friends and each group
  - Compression support for large batches (>1KB threshold)
  - Auto-flushes on component unmount

### Ship Image System

**Ship Data & Images:**

- Ship database sourced from Fleet Yards API (https://fleetyards.net/)
- Ship data stored in `src/libs/fleet.json`
- Ship images cached as WebP files in `static/ships/` directory
- Image naming convention: `{slug}__iso_l_{hash}.webp`
- Images served from `/ships/` route in production

**Ship Matching Logic (`src/components/Item.svelte`):**

1. **Direct match**: Tries exact match on vehicle name from logs
2. **Progressive shortening**: Removes suffix parts until match found
3. **Fuzzy search fallback**: Uses Fuse.js to find closest match by name/slug/identifier
4. Displays ship image for `vehicle_control_flow` and `destruction` event types
5. Special "hard death" effect: Split ship image for complete destruction (destroyLevel === '2')

### Groups Feature

**Group Management:**

- Users can create and join groups for organized log sharing
- Group roles: `owner`, `admin`, `member` with granular permissions
- Permissions: `canInvite`, `canRemoveMembers`, `canEditGroup`
- Group invitations flow: pending → accepted/denied
- Real-time group log broadcasting via WebSocket
- Group members' logs displayed when group is selected
- Group avatars stored and served from website (`/uploads/avatars/`)

**Group WebSocket Messages:**

- `batch_group_logs`: Send logs to all group members
- `group_log`: Receive logs from group members
- Compression support for large log batches (like friend logs)

## Common Development Patterns

**Using Lucide Icons:**

- **IMPORTANT**: Import from `@lucide/svelte`, NOT `lucide-svelte`
- Example: `import { Copy, Check } from '@lucide/svelte';`
- Use with size prop: `<Copy size={16} />`

**CSS Variables & Styling Patterns:**

- **Background colors** (defined in Tailwind config):
  - `bg-primary`: Main background color
  - `bg-panel`: Panel/card background (used for dropdowns, modals, dialogs)
  - `bg-overlay-dark`: Dark overlay background
  - `bg-overlay-light`: Light overlay background
  - `bg-overlay-card`: Card background

- **Border opacity patterns**: Consistent across UI
  - `border-white/5`: Subtle borders on panels and dropdowns
  - `border-white/10`: Standard borders

- **Text opacity patterns**: For hierarchy
  - `text-white/50`: Secondary text (timestamps, metadata)
  - `text-white/70`: Muted text (help text, placeholders)
  - `text-muted`: Semantic muted text color
  - `text-subtle`: Very subtle text

- **Hover states**: Always include transitions
  - `hover:bg-white/20`: Buttons and interactive elements
  - `hover:text-white`: Icon buttons and links
  - `transition-colors`: Standard for color transitions
  - `transition-opacity duration-200`: For opacity changes

- **Dropdown/Modal consistency**:
  - Always use `bg-panel` for background
  - Always use `border-white/5` for borders
  - Include `shadow-xl` for elevation
  - Use `rounded-lg` for consistent border radius

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

**UI/UX Patterns:**

- **Scroll Banner**: "You're viewing old logs" popup
  - Appears when user scrolls away from bottom (debounced 1 second)
  - Uses `bg-panel` with `border-white/5` for consistency
  - Fade in/out transitions (200ms)
  - "Jump To Present" button scrolls to bottom smoothly

- **Auto-scroll behavior**:
  - Automatically scrolls to bottom when new logs arrive (only if user was already at bottom)
  - Tracks `atTheBottom` state via scroll event listener
  - Initial scroll to bottom on page load
  - Uses `tick()` to wait for DOM updates before scrolling

- **Expandable log cards**:
  - Click to expand/collapse individual log entries
  - Show full original log text in code-style box
  - Copy button (Lucide Copy/Check icons) in top-right corner
  - Hover states with transitions for better UX

- **Panel management**:
  - Resizable panels with drag handles (Resizer/VerticalResizer components)
  - Panel state persisted to Tauri store
  - Toggle buttons for Friends/Groups visibility
  - Automatic collapse when both sections hidden

**Adding Tauri Commands:**

1. Define Rust function in `src-tauri/src/lib.rs` with `#[tauri::command]`
2. Add to `invoke_handler!` macro in `run()` function
3. Call from TypeScript using `invoke('command_name', { args })`

**Performance & Error Handling:**

- **Regex Safety**: Use `safeMatch()` from `src/lib/regex-utils.ts`
  - Includes timeout protection (default 200ms)
  - Prevents regex DoS attacks
  - Example: `safeMatch(regex, line, 200)`

- **Compression**: Automatic for large data transfers
  - Threshold: 1KB+ (checked via `shouldCompressLogs()`)
  - Uses gzip compression via `compressLogs()`
  - Applied to both friend and group log batches

- **Memory Management**:
  - Log limit: 1000 most recent logs kept in memory
  - Older logs automatically pruned
  - Deduplication on every save to prevent bloat

- **Error Handling Patterns**:
  - Silent failures with `.catch(() => {})` for non-critical operations
  - Fire-and-forget for background operations (e.g., WebSocket sends)
  - No error dialogs for routine failures (sync, updates, etc.)
  - User-facing errors only for critical actions

**Updating Dependencies:**

- Frontend: `npm update` for Node packages
- Rust: `cd src-tauri && cargo update`
- Tauri CLI: `npm install @tauri-apps/cli@latest -D`

## Project-Specific Notes

**Star Citizen Integration:**

- Parses Game.log files from `%APPDATA%\Roberts Space Industries\StarCitizen\{ENVIRONMENT}\`
- Extracts player name and ID from log file header (`EntityId` field)
- Auto-detects log location via Rust command `find_star_citizen_logs()`
- Recognizes event patterns for kills, deaths, vehicle control, location changes
- Ship data sourced from Fleet Yards (https://fleetyards.net/)
- NPC detection: Checks for `PU_` prefix or `_NPC_` in names
- "Unknown" entity handling: Special emoji display (🤷‍♂️ Unknown)

**Event Type Parsing:**

- `actor_death`: Extracts victim, killer, weapon, damage type, zone, and direction
- `vehicle_control_flow`: Ship boarding events with ship name/ID
- `destruction`: Vehicle/ship destruction with destroy level (soft vs hard death)
- `location_change`: Inventory requests in different locations
- `system_quit`: Player disconnect events
- All events include metadata for detailed display when expanded

**Multi-User Sync:**

- Friend system allows sharing logs between users in real-time
- Online presence tracked via WebSocket presence events (`user_online`, `user_offline`)
- Timezone support for displaying friend activity in local time
- Friend codes: 6-character UUIDs for easy sharing
- Request/response flow: pending → accepted/denied

**Log Display Filtering:**

- Default view: Shows own logs + friends' logs only
- User selection: Filters to show only selected user's logs
- Group selection: Filters to show all group members' logs
- Displayed logs are reactive (`$derived.by`) based on selection state
- User display names pulled from group members or friends list

**Build Configuration:**

- Static adapter for SvelteKit (no Node.js server in Tauri)
- Vite dev server on port 1420 (required by Tauri)
- HMR via WebSocket on port 1421
- Rust source code excluded from Vite watch
- Uses npm (not pnpm) for package management
