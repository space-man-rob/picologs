# Security Policy

## Open Source Transparency

Picologs is an open-source desktop application. This document explains our security model and what information is safe to be public.

## What's Public (and Why That's OK)

### Discord OAuth Client ID
**Value:** `1342740437768867872`
**Location:** `.env.production`, `.env.example`, GitHub Actions workflows

**Why it's safe to expose:**
- OAuth Client IDs are designed to be public (they appear in authorization URLs)
- The Client **SECRET** is stored securely on the backend server (NOT in this repository)
- Discord validates redirect URIs to prevent misuse
- This app uses OAuth via a website bridge with additional security measures

### WebSocket Server URL
**Location:** `.env.production`, `.env.example`

**Why it's configurable:**
- Allows self-hosting and custom deployments
- Production builds use environment variables for the WebSocket URL
- Authentication is handled via JWT tokens (never exposed in client code)
- The server validates all connections and enforces rate limiting

### Website URL
**Location:** `.env.production`, `.env.example`

**Why it's configurable:**
- Allows custom OAuth bridge implementations
- This is the public website URL used for OAuth bridging
- No secrets or credentials are transmitted through this URL

## What's NEVER Exposed

### JWT Tokens
- Generated server-side after Discord OAuth
- Transmitted securely via WebSocket
- Stored locally in Tauri encrypted store
- **Never** committed to version control
- **Never** included in error logs or debugging output

### User Authentication Data
- Discord access tokens stored server-side only
- User credentials never stored in desktop app
- All authentication flows use secure OAuth 2.0

### Database Credentials
- Backend database credentials stored as environment variables on server
- Never transmitted to desktop clients
- Not included in this repository

## Security Best Practices

### For Users
1. Download Picologs only from official sources:
   - GitHub Releases: https://github.com/space-man-rob/picologs/releases
   - Official website: https://picologs.com

2. Verify code signatures on downloaded binaries

3. Keep your app updated for latest security patches

### For Contributors
1. **Never commit:**
   - `.env` files (except `.env.example` and `.env.production`)
   - User data or logs
   - Test credentials
   - Private keys or secrets

2. **Always:**
   - Use the provided `.env.example` as a template
   - Follow the security notes in code comments
   - Report security issues privately (see below)

## Architecture Security

### Desktop App → Server Communication
```
Desktop App (Picologs)
    ↓ OAuth via Discord
Website (picologs.com)
    ↓ Exchange code for JWT
Backend Server (fly.dev)
    ↓ JWT-authenticated WebSocket
Desktop App (Picologs)
```

**Security layers:**
1. Discord OAuth validates user identity
2. Backend server generates JWT with short expiration
3. WebSocket connection requires valid JWT
4. All production connections use TLS (wss://)

### Data Storage
- **Local logs:** Stored in Tauri app data directory (user-only access)
- **Auth tokens:** Stored in Tauri store (`auth.json`) with OS-level permissions
- **Settings:** Stored in Tauri store (`store.json`)

## Reporting Security Issues

**DO NOT** open public issues for security vulnerabilities.

Instead, please report security issues privately:
1. Email: [Your security email]
2. Or use GitHub's private vulnerability reporting

We'll respond within 48 hours and provide updates as we address the issue.

## Compliance

### Data Privacy
- Picologs processes only Star Citizen game logs (local files)
- Discord authentication uses minimal scopes (identify only)
- No telemetry or analytics tracking
- User data never sold or shared

### Open Source License
This project is licensed under the MIT License. See LICENSE file for details.

## Security Updates

We release security updates as soon as possible after discovering vulnerabilities. Update notifications are shown in the app when new versions are available.

### Update Verification
All releases are:
- Signed with Tauri's code signing
- Published with checksums on GitHub Releases
- Built via automated GitHub Actions (transparent build process)

## Questions?

If you have questions about this security policy, please open a discussion on GitHub or contact the maintainers.

---

**Last Updated:** 2025-10-08
**Policy Version:** 1.0
