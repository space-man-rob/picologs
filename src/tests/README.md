# Picologs Test Suite

Comprehensive test suite for the Picologs Tauri + Svelte 5 desktop application.

## Overview

This test suite provides comprehensive coverage for:

- **Unit Tests**: Log parsing utilities, regex helpers, timestamp parsing
- **Component Tests**: Svelte 5 components with runes-based reactivity
- **Integration Tests**: WebSocket communication, file watching, Tauri API integration

## Test Structure

```
src/tests/
├── setup.ts                 # Test configuration and Tauri API mocks
├── log-parsing.test.ts      # Log parsing utility tests
├── log-events.test.ts       # Real-world log event parsing tests
├── websocket.test.ts        # WebSocket integration tests
└── README.md                # This file

src/lib/
└── regex-utils.test.ts      # Regex utility function tests

src/components/
├── Item.svelte.test.ts      # Item component tests
└── Friends.svelte.test.ts   # Friends list component tests
```

## Running Tests

### Run all tests in watch mode
```bash
npm test
```

### Run tests once (CI mode)
```bash
npm run test:run
```

### Run with UI
```bash
npm run test:ui
```

### Run with coverage
```bash
npm run test:coverage
```

## Test Configuration

### Vitest Configuration (`vitest.config.ts`)

- **Browser Mode**: Uses Playwright with Chromium for component testing
- **Setup Files**: `src/tests/setup.ts` for global mocks
- **Test Patterns**: `**/*.{test,spec}.{js,ts}` and `**/*.svelte.{test,spec}.{js,ts}`
- **Coverage**: V8 provider with HTML reports

### Mocked APIs

The test suite mocks all Tauri APIs to enable testing without a Tauri runtime:

- `@tauri-apps/api/path` - File path utilities
- `@tauri-apps/plugin-fs` - File system operations
- `@tauri-apps/plugin-store` - Persistent storage
- `@tauri-apps/plugin-dialog` - Native dialogs
- `@tauri-apps/plugin-websocket` - WebSocket client
- `@tauri-apps/plugin-opener` - URL opener
- `@tauri-apps/plugin-process` - Process management
- `@tauri-apps/plugin-updater` - Auto-updater

## Test Categories

### 1. Unit Tests

#### Log Parsing (`log-parsing.test.ts`)
Tests for utility functions extracted from the main page component:

- `parseLogTimestamp()` - Converts Star Citizen log timestamps to ISO 8601
- `generateId()` - Creates deterministic IDs for log deduplication
- `getShipType()` - Identifies ship types from vehicle names
- `getName()` - Formats entity names (players, NPCs, unknowns)
- `dedupeAndSortLogs()` - Removes duplicates and sorts by timestamp

#### Regex Utilities (`regex-utils.test.ts`)
Tests for safe regex execution with timeout protection:

- `safeMatch()` - Pattern matching with ReDoS protection
- `safeTest()` - Boolean pattern testing
- `safeExec()` - Regex execution with timeout

### 2. Component Tests

#### Item Component (`Item.svelte.test.ts`)
Tests for the log item display component:

- Basic rendering with emojis and log text
- Event type rendering (actor_death, vehicle_control_flow, killing_spree, etc.)
- Interactive features (expand/collapse, clipboard copy)
- Timestamp formatting with date-fns
- Ship data fetching and display
- Child item rendering for grouped events

#### Friends Component (`Friends.svelte.test.ts`)
Tests for the friends list component:

- Friends list rendering and sorting (online first, alphabetical)
- Incoming/outgoing friend request display
- Accept/deny friend request actions
- Loading states with skeleton UI
- Avatar display (image or initial)
- Player name display

### 3. Integration Tests

#### WebSocket Communication (`websocket.test.ts`)
Tests for real-time communication:

- Connection establishment with JWT authentication
- Message sending (register, log, batch_logs, friend_request, etc.)
- Message receiving (log, friend_came_online, friend_request_received)
- Ping/pong keepalive mechanism
- Error handling (connection errors, malformed JSON)
- Compression support for large batches
- Group log broadcasting

#### Log Event Parsing (`log-events.test.ts`)
Tests for real-world Star Citizen log patterns:

- Player connection events with EntityId extraction
- Actor death events (player kills, NPC kills, suicide, self-destruct)
- Vehicle destruction events (soft death, hard death)
- Vehicle control flow events (ship boarding)
- Inventory request events
- System quit events
- Timestamp parsing in various formats
- Edge cases (special characters, long names, multiple brackets)

## Test Helpers

### Mock Data Factories (`setup.ts`)

```typescript
import { createMockLog, createMockFriend } from '../tests/setup';

// Create a mock log entry
const log = createMockLog({
  emoji: '🛜',
  line: 'Player connected',
  eventType: 'connection',
});

// Create a mock friend
const friend = createMockFriend({
  name: 'TestFriend',
  status: 'confirmed',
  isOnline: true,
});
```

### Mock Log Lines

Pre-defined log lines for testing:

```typescript
import { mockLogLines } from '../tests/setup';

const { playerConnection, actorDeath, vehicleDestruction } = mockLogLines;
```

## Writing New Tests

### Testing Svelte 5 Components

Use `vitest-browser-svelte` for component testing:

```typescript
import { render, screen } from 'vitest-browser-svelte';
import MyComponent from './MyComponent.svelte';

it('should render component', async () => {
  render(MyComponent, { prop1: 'value' });

  expect(screen.getByText('value')).toBeTruthy();
});
```

### Testing Runes-Based State

Test components with `$state`, `$derived`, and `$effect`:

```typescript
it('should update derived state', async () => {
  const { component } = render(MyComponent, { count: 0 });

  // Interact with component to trigger state change
  await button.click();

  // Verify derived state updated
  expect(screen.getByText('Count: 1')).toBeTruthy();
});
```

### Mocking Tauri APIs

Mock Tauri APIs for specific test scenarios:

```typescript
import { vi } from 'vitest';

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(async (path: string) => {
    return '<2024.01.01-12:00:00.000> Mock log content';
  }),
}));
```

## Coverage Goals

- **Unit Tests**: 90%+ coverage for utility functions
- **Component Tests**: 80%+ coverage for UI components
- **Integration Tests**: Key user flows and WebSocket scenarios

## CI/CD Integration

Tests run automatically on:

- Pre-commit (local development)
- Pull requests (GitHub Actions)
- Before deployments

### GitHub Actions Example

```yaml
- name: Run Tests
  run: npm run test:run

- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/coverage-final.json
```

## Debugging Tests

### Run specific test file
```bash
npx vitest run src/lib/regex-utils.test.ts
```

### Run tests matching pattern
```bash
npx vitest run -t "parseLogTimestamp"
```

### Debug with VS Code
Add breakpoints and use the built-in debugger with the Vitest extension.

### View coverage reports
```bash
npm run test:coverage
open coverage/index.html
```

## Best Practices

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Mocking**: Mock external dependencies (Tauri APIs, network requests)
3. **Descriptive Names**: Use clear, descriptive test names that explain what's being tested
4. **Arrange-Act-Assert**: Structure tests with clear setup, action, and verification phases
5. **Edge Cases**: Test boundary conditions, empty states, and error scenarios
6. **Performance**: Keep tests fast by mocking expensive operations

## Troubleshooting

### Tests fail with "Cannot find module '@tauri-apps/...'
Ensure all Tauri plugins are mocked in `setup.ts`.

### Component tests timeout
Increase timeout in `vitest.config.ts` or specific test:
```typescript
it('slow test', async () => {
  // test code
}, 15000); // 15 second timeout
```

### WebSocket tests fail
Verify mock WebSocket implementation in test setup.

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Vitest Browser Mode](https://vitest.dev/guide/browser.html)
- [vitest-browser-svelte](https://github.com/sveltejs/vitest-browser-svelte)
- [Svelte Testing Library](https://testing-library.com/docs/svelte-testing-library/intro)
- [Tauri Testing Guide](https://tauri.app/v2/learn/testing/)
