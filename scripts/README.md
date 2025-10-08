# Ship Image Caching Script

This directory contains a build-time script to download and cache all Star Citizen ship images from Fleet Viewer.

## Overview

The `cache-fleet-images.js` script:
1. Reads all ships from `src/libs/fleet.json`
2. Downloads ship images in parallel batches (10 at a time)
3. Resizes images to 120x120px (maintains aspect ratio)
4. Converts to WebP format (75% quality)
5. Saves to `static/ships/` (bundled with app)

## Usage

### Install Dependencies

First, make sure `sharp` is installed:

```bash
cd picologs
npm install
```

### Run the Script

To cache all ship images before building the app:

```bash
npm run cache-ships
```

### What It Does

- **Downloads**: Fetches PNG images from Fleet Viewer in parallel batches (10 at a time)
- **Resizes**: Resizes to 120x120px to reduce file size
- **Converts**: Uses `sharp` to convert to WebP format (75% quality)
- **Optimizes**: Final images are ~3-4KB each (vs ~200KB original)
- **Caches**: Saves to `static/ships/` which gets bundled with the app
- **Skips**: Automatically skips images that are already cached

### Output

Images are saved to `static/ships/` with the following naming convention:
```
{slug}__iso_l_{hash}.webp
```

Example:
```
static/ships/600i__iso_l_abc123def456.webp
```

These files are served at `/ships/` in the app.

### Build Process

Before releasing a new version of the app:

1. Run `npm run cache-ships` to download and cache all ship images
2. Verify the `static/ships/` directory contains all WebP images
3. Run `npm run tauri build` to build the app with bundled images

### Benefits

- **Faster Loading**: Images load instantly from local assets
- **Much Smaller**: Images are ~3-4KB each (50x smaller than originals)
- **Quick Caching**: Parallel processing downloads all ships in ~2 minutes
- **Offline**: Works without internet connection
- **No CDN**: No dependency on external services at runtime

### Troubleshooting

**Issue**: Script fails with "Failed to download image"
- **Solution**: Check your internet connection and try again

**Issue**: Images not showing in app
- **Solution**: Verify the `static/ships/` directory exists and contains .webp files

**Issue**: "sharp not installed" error
- **Solution**: Run `npm install` to install all dev dependencies

## Implementation Details

### Component Usage

The `Item.svelte` component automatically loads ship images from local assets:

```typescript
let shipImage = $derived(
  shipData?.slug && shipData?.fleetData?.variants[0]?.iso_l?.hash
    ? `/ships/${shipData.slug}__iso_l_${shipData.fleetData.variants[0]?.iso_l?.hash}.webp`
    : null
);
```

### File Structure

```
picologs/
├── scripts/
│   ├── cache-fleet-images.js  # Download & convert script
│   └── README.md              # This file
├── static/
│   └── ships/                 # Cached WebP images (created by script)
├── src/
│   ├── components/
│   │   └── Item.svelte        # Uses local ship images
│   └── libs/
│       └── fleet.json         # Ship data source
```

### Environment Variables

The script uses `VITE_FLEET_VIEWER_URL` from your `.env` file or defaults to:
```
https://fleetviewer.link
```

## Maintenance

Re-run `npm run cache-ships` whenever:
- New ships are added to `fleet.json`
- Ship images are updated in Fleet Viewer
- You want to refresh all cached images

The script will skip already-cached images, so it's safe to run multiple times.
