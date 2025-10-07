# Picologs Testing Guide

## Overview

Picologs uses **Vitest** for testing with support for both unit tests and browser-based component tests. The test suite provides comprehensive coverage of utility functions, validation schemas, and Svelte 5 components.

## Test Architecture

### Two-Config Approach

We use separate Vitest configurations for different test types:

1. **`vitest.config.ts`** - Unit tests (happy-dom environment)
   - Fast execution for utility and logic tests
   - Mocked Tauri APIs
   - No browser overhead

2. **`vitest.browser.config.ts`** - Component tests (Playwright browser)
   - Real browser environment for Svelte 5 components
   - Tests user interactions and DOM behavior
   - Uses `vitest-browser-svelte` for component rendering

## Running Tests

### Quick Commands

```bash
# Run all unit tests
npm test

# Run unit tests once (CI mode)
npm run test:unit

# Run browser/component tests
npm run test:browser

# Run all tests (unit + browser)
npm run test:all

# Run with coverage
npm run test:coverage

# Run with UI
npm run test:ui
npm run test:browser:ui
```

### Test File Patterns

- **Unit tests**: `src/**/*.{test,spec}.{js,ts}`
- **Component tests**: `src/**/*.svelte.{test,spec}.{js,ts}`

## Test Coverage

### Current Coverage Stats

```
Test Files:  8 passed (8)
Tests:       174 passed (174)

Library Coverage:
- validation.ts:  100% (all metrics)
- cache.ts:       95.65% statements
- regex-utils.ts: 68.42% statements
- storage.ts:     24.67% statements (type/interface tests)
- api.ts:         Type and structure tests
```

### Coverage Thresholds

Configured in `vitest.config.ts`:

```typescript
coverage: {
  thresholds: {
    lines: 70,
    functions: 70,
    branches: 65,
    statements: 70,
  },
}
```

**Note**: Overall coverage appears low (5.98%) because Svelte components (`+page.svelte`, `+layout.svelte`, component files) are excluded from unit test coverage. These are tested separately in browser mode.

## Test Structure

### Unit Tests

Located in `src/lib/*.test.ts` and `src/tests/*.test.ts`:

- **`api.test.ts`** - WebSocket API type definitions and security constants
- **`storage.test.ts`** - Storage abstraction layer interfaces
- **`cache.test.ts`** - Cache module (friends, groups, group members)
- **`validation.test.ts`** - Zod validation schemas and security checks
- **`regex-utils.test.ts`** - Log parsing regex utilities
- **`log-parsing.test.ts`** - Star Citizen log parsing logic
- **`log-events.test.ts`** - Log event detection and classification
- **`websocket.test.ts`** - WebSocket message handling

### Component Tests

Located in `src/components/*.svelte.test.ts`:

- **`Item.svelte.test.ts`** - Log item component rendering and interactions
- **`Friends.svelte.test.ts`** - Friends list, requests, and status display

## Writing Tests

### Unit Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { validateMessage, LogSchema } from '$lib/validation';

describe('Validation', () => {
  it('should validate correct log entry', () => {
    const validLog = {
      id: 'log-123',
      userId: '550e8400-e29b-41d4-a716-446655440000',
      player: 'TestPlayer',
      emoji: '🛜',
      line: 'Test log entry',
      timestamp: '2024-01-01T12:00:00Z',
      original: '<2024.01.01-12:00:00.000> Test log entry',
    };

    const result = LogSchema.safeParse(validLog);
    expect(result.success).toBe(true);
  });
});
```

### Component Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from 'vitest-browser-svelte';
import Item from './Item.svelte';

describe('Item Component', () => {
  it('should render log item with emoji and line', async () => {
    const log = {
      emoji: '🛜',
      line: 'TestPlayer connected to the game',
      timestamp: new Date().toISOString(),
      original: '<2024.01.01-12:00:00.000> Connection log',
      player: 'TestPlayer',
      open: false,
    };

    render(Item, { ...log });

    expect(screen.getByText('🛜')).toBeTruthy();
    expect(screen.getByText('TestPlayer connected to the game')).toBeTruthy();
  });
});
```

## Mocking Tauri APIs

### Setup Files

- **`src/tests/setup.ts`** - Mocks for unit tests (happy-dom)
- **`src/tests/setup-browser.ts`** - Mocks for component tests (browser)

Both files mock:
- `@tauri-apps/api/path`
- `@tauri-apps/plugin-fs`
- `@tauri-apps/plugin-store`
- `@tauri-apps/plugin-dialog`
- `@tauri-apps/plugin-websocket`
- `@tauri-apps/plugin-opener`
- `@tauri-apps/plugin-process`
- `@tauri-apps/plugin-updater`
- `@tauri-apps/plugin-http`

### Using Mocks in Tests

Mocks are automatically available via `vitest.config.ts` setupFiles:

```typescript
import { vi } from 'vitest';

// Mock is already loaded, just use it
const mockOpen = vi.fn(async () => '/path/to/Game.log');
```

## Testing Svelte 5 Components

### Browser Mode with Playwright

Component tests use Vitest Browser Mode with Playwright:

1. **Install Playwright browsers** (already done):
   ```bash
   npx playwright install chromium
   ```

2. **Use `vitest-browser-svelte`** for rendering:
   ```typescript
   import { render, screen } from 'vitest-browser-svelte';
   ```

3. **Test Svelte 5 Runes**:
   - `$state` - reactive state automatically updates in tests
   - `$derived` - computed values work as expected
   - `$effect` - side effects are testable

### Locators and Retry-ability

Vitest browser mode includes built-in retry mechanisms:

```typescript
// Automatically retries until element is found or timeout
expect(screen.getByText('Loading...')).toBeTruthy();

// Use .element for better retry-ability
await expect.element(screen.getByRole('button')).toBeVisible();
```

## Debugging Tests

### UI Mode

Best for interactive debugging:

```bash
npm run test:ui           # Unit tests
npm run test:browser:ui   # Component tests
```

Opens a web interface with:
- Test file explorer
- Live test results
- Code coverage visualization
- Console output

### Watch Mode

Automatically re-run tests on file changes:

```bash
npm test  # Watch mode by default
```

### Headed Browser Mode

See tests running in a real browser:

```bash
# Edit vitest.browser.config.ts temporarily:
headless: false  # Change to false
```

## Best Practices

### 1. **Separate Unit and Component Tests**

- Unit tests → `*.test.ts` (fast, no DOM)
- Component tests → `*.svelte.test.ts` (browser, full rendering)

### 2. **Use Descriptive Test Names**

```typescript
describe('LogSchema', () => {
  it('should validate correct log entry', () => {});
  it('should reject invalid UUID for userId', () => {});
  it('should enforce max string length for DoS prevention', () => {});
});
```

### 3. **Test Security Boundaries**

```typescript
it('should reject extremely long strings in log lines', () => {
  const attackLog = {
    id: 'log-123',
    userId: '550e8400-e29b-41d4-a716-446655440000',
    line: 'x'.repeat(1001), // Exceeds MAX_STRING_LENGTH
    // ...
  };

  const result = LogSchema.safeParse(attackLog);
  expect(result.success).toBe(false);
});
```

### 4. **Use Mock Utilities**

```typescript
import { createMockLog, createMockFriend } from '../tests/setup';

const log = createMockLog({ player: 'CustomPlayer' });
const friend = createMockFriend({ status: 'pending' });
```

## Continuous Integration

### Running in CI

```bash
# One-time test run with coverage
npm run test:all:coverage
```

### Coverage Reports

Generated in:
- `coverage/` - HTML and JSON reports
- Terminal - Text summary

View HTML coverage:
```bash
open coverage/index.html
```

## Troubleshooting

### Tests Timing Out

- **Unit tests**: Check for unmocked async operations
- **Component tests**: Ensure Playwright browser is installed

### Mock Not Working

- Check `setupFiles` in `vitest.config.ts`
- Verify mock import path matches actual import
- Clear Vitest cache: `rm -rf node_modules/.vitest`

### Component Not Rendering

- Ensure using `vitest.browser.config.ts` for Svelte tests
- Check `vitest-browser-svelte` is installed
- Verify Svelte 5 compatibility

### Coverage Thresholds Failing

- Svelte components are excluded from unit coverage
- Focus on lib/ coverage (70% target)
- Run `npm run test:browser` for component coverage

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Vitest Browser Mode](https://vitest.dev/guide/browser/)
- [vitest-browser-svelte](https://github.com/vitest-dev/vitest-browser-svelte)
- [Svelte 5 Testing Guide](https://svelte.dev/docs/svelte/testing)
- [Playwright Documentation](https://playwright.dev/)

## Migration Notes

### From @testing-library/svelte

We've migrated to `vitest-browser-svelte` for better Svelte 5 support:

- ✅ Native Svelte 5 runes support
- ✅ Real browser environment (not jsdom)
- ✅ Built-in retry-ability
- ✅ Auto-cleanup before tests (not after)
- ✅ No `act()` required

### Tauri v2 Mocking

All Tauri plugins are mocked in setup files:
- No need for manual mocking in each test
- Consistent behavior across all tests
- Safe for both unit and browser tests
