#!/usr/bin/env node

/**
 * Transform hangar.link ship data to fleet.json format
 *
 * Fetches ship data from hangar.link and transforms it to match
 * the current fleet.json structure expected by the app.
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HANGAR_LINK_URL = 'https://hangar.link/assets/assets/ships227.json';
const OUTPUT_PATH = path.join(__dirname, 'src/libs/fleet.json');

// Map hangar.link manufacturer codes to game manufacturer codes
const MANUFACTURER_CODE_MAP = {
	AEGI: 'AEGS', // Aegis Dynamics
	ORIG: 'ORIG', // Origin Jumpworks
	ANVL: 'ANVL', // Anvil Aerospace
	Mirai: 'MRAI', // Mirai
	Gatac: 'GATC', // Gatac Manufacture
	AOPO: 'AOPO' // Aopoa
	// Add more mappings as needed
};

function fetchJson(url) {
	return new Promise((resolve, reject) => {
		https
			.get(url, (res) => {
				let data = '';

				res.on('data', (chunk) => {
					data += chunk;
				});

				res.on('end', () => {
					try {
						resolve(JSON.parse(data));
					} catch (e) {
						reject(e);
					}
				});
			})
			.on('error', reject);
	});
}

function generateScIdentifier(manufacturerCode, fleetview) {
	// Map manufacturer code to game code if needed
	const mappedCode = MANUFACTURER_CODE_MAP[manufacturerCode] || manufacturerCode;

	// Convert fleetview to sc identifier format
	// e.g., "constellation taurus" -> "constellation_taurus"
	const shipPart = fleetview.toLowerCase().replace(/\s+/g, '_');
	const mfgPart = mappedCode.toLowerCase();

	return `${mfgPart}_${shipPart}`;
}

function transformShipData(ships) {
	const fleet = {};

	for (const ship of ships) {
		// Skip ships without required data
		if (!ship.slug || !ship.name || !ship.variants || ship.variants.length === 0) {
			console.warn(`Skipping ship without required data: ${ship.name || 'unknown'}`);
			continue;
		}

		// Generate the key using fleetview (preferred) or slug as fallback
		const fleetview = ship.fleetview || ship.slug.replace(/-/g, ' ');
		const scIdentifier = generateScIdentifier(ship.manufacturerCode || 'UNKN', fleetview);

		// Use mapped manufacturer code for consistency with game
		const mappedManufacturerCode =
			MANUFACTURER_CODE_MAP[ship.manufacturerCode] || ship.manufacturerCode || 'UNKN';

		// Transform to expected structure
		fleet[scIdentifier] = {
			name: ship.name,
			slug: ship.slug,
			scIdentifier: scIdentifier,
			erkulIdentifier: scIdentifier,
			'manufacturer.code': mappedManufacturerCode,
			links: {
				storeUrl: '',
				salesPageUrl: ''
			},
			fleetData: {
				variants: ship.variants.map((variant) => ({
					// Copy all variant data directly
					...variant,
					// Ensure required fields exist
					slug: variant.slug || '',
					name: variant.name || '',
					supporter: variant.supporter || false,
					official: variant.official !== undefined ? variant.official : true
				}))
			}
		};
	}

	return fleet;
}

async function main() {
	try {
		console.log(`Fetching ship data from ${HANGAR_LINK_URL}...`);
		const ships = await fetchJson(HANGAR_LINK_URL);

		console.log(`Received ${ships.length} ships`);
		console.log('Transforming data...');

		const fleetData = transformShipData(ships);
		const shipCount = Object.keys(fleetData).length;

		console.log(`Transformed ${shipCount} ships`);
		console.log(`Writing to ${OUTPUT_PATH}...`);

		fs.writeFileSync(OUTPUT_PATH, JSON.stringify(fleetData, null, 2), 'utf8');

		console.log('✅ Fleet data updated successfully!');
		console.log(`📊 Total ships: ${shipCount}`);

		// Show sample of generated keys
		const sampleKeys = Object.keys(fleetData).slice(0, 5);
		console.log('\nSample ship keys:');
		sampleKeys.forEach((key) => {
			console.log(`  - ${key} (${fleetData[key].name})`);
		});
	} catch (error) {
		console.error('❌ Error updating fleet data:', error);
		process.exit(1);
	}
}

main();
