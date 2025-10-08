import { writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Load fleet data
const fleetDataPath = join(projectRoot, 'src', 'libs', 'fleet.json');
const fleetDataRaw = await readFile(fleetDataPath, 'utf-8');
const fleetData = JSON.parse(fleetDataRaw);

// Output directory for cached images (static files are bundled with app)
const OUTPUT_DIR = join(projectRoot, 'static', 'ships');

// Fleet Viewer base URL - uses their API proxy
const FLEET_VIEWER_URL = process.env.VITE_FLEET_VIEWER_URL || 'https://fleetviewer.link';

/**
 * Download a file from URL
 */
async function downloadFile(url) {
	return new Promise((resolve, reject) => {
		const protocol = url.startsWith('https') ? https : http;

		protocol.get(url, (response) => {
			if (response.statusCode === 302 || response.statusCode === 301) {
				// Follow redirect
				downloadFile(response.headers.location).then(resolve).catch(reject);
				return;
			}

			if (response.statusCode !== 200) {
				reject(new Error(`HTTP ${response.statusCode} for ${url}`));
				return;
			}

			const chunks = [];
			response.on('data', (chunk) => chunks.push(chunk));
			response.on('end', () => resolve(Buffer.concat(chunks)));
			response.on('error', reject);
		}).on('error', reject);
	});
}

/**
 * Convert PNG buffer to WebP with resizing
 */
async function convertToWebP(buffer, outputPath) {
	const webpBuffer = await sharp(buffer)
		.resize(120, 120, {
			fit: 'contain',
			background: { r: 0, g: 0, b: 0, alpha: 0 }
		})
		.webp({ quality: 75 })
		.toBuffer();

	await writeFile(outputPath, webpBuffer);
}

/**
 * Process a single ship image
 */
async function processShip(ship) {
	// Skip if no image data
	if (!ship.slug || !ship.fleetData?.variants?.[0]?.iso_l?.hash) {
		return { status: 'skipped', reason: 'no-data' };
	}

	const { slug } = ship;
	const hash = ship.fleetData.variants[0].iso_l.hash;
	const imageUrl = `${FLEET_VIEWER_URL}/fleetpics/${slug}__iso_l_${hash}.png`;
	const outputFilename = `${slug}__iso_l_${hash}.webp`;
	const outputPath = join(OUTPUT_DIR, outputFilename);

	// Skip if already exists
	if (existsSync(outputPath)) {
		return { status: 'skipped', reason: 'exists', name: ship.name };
	}

	try {
		const buffer = await downloadFile(imageUrl);
		await convertToWebP(buffer, outputPath);
		return { status: 'success', name: ship.name, filename: outputFilename };
	} catch (error) {
		return { status: 'failed', name: ship.name, error: error.message };
	}
}

/**
 * Process all fleet images in parallel batches
 */
async function cacheFleetImages() {
	console.log('🚀 Starting fleet image caching (parallel mode)...\n');

	// Create output directory
	if (!existsSync(OUTPUT_DIR)) {
		await mkdir(OUTPUT_DIR, { recursive: true });
		console.log(`📁 Created directory: ${OUTPUT_DIR}\n`);
	}

	const ships = Object.values(fleetData);
	const BATCH_SIZE = 10; // Process 10 images at a time
	let processed = 0;
	let skipped = 0;
	let failed = 0;

	// Process in batches
	for (let i = 0; i < ships.length; i += BATCH_SIZE) {
		const batch = ships.slice(i, i + BATCH_SIZE);
		console.log(`\n📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(ships.length / BATCH_SIZE)}...`);

		const results = await Promise.all(batch.map(ship => processShip(ship)));

		// Log results
		for (const result of results) {
			if (result.status === 'success') {
				console.log(`  ✅ ${result.name}`);
				processed++;
			} else if (result.status === 'skipped') {
				if (result.reason === 'exists') {
					console.log(`  ⏭️  ${result.name} (cached)`);
				}
				skipped++;
			} else if (result.status === 'failed') {
				console.log(`  ❌ ${result.name}: ${result.error}`);
				failed++;
			}
		}

		// Small delay between batches
		if (i + BATCH_SIZE < ships.length) {
			await new Promise(resolve => setTimeout(resolve, 200));
		}
	}

	console.log('\n' + '='.repeat(50));
	console.log(`📊 Summary:`);
	console.log(`   Processed: ${processed}`);
	console.log(`   Skipped:   ${skipped}`);
	console.log(`   Failed:    ${failed}`);
	console.log(`   Total:     ${ships.length}`);
	console.log('='.repeat(50));
}

// Run the script
cacheFleetImages().catch(error => {
	console.error('Fatal error:', error);
	process.exit(1);
});
