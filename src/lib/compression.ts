/**
 * Compression utilities for log data using gzip
 * Uses browser's native CompressionStream/DecompressionStream APIs
 *
 * IMPORTANT: This module compresses LogTransmit objects (without 'original' field)
 * to reduce bandwidth. The 'original' field is kept in local storage but excluded
 * from network transmission.
 */

import type { Log, LogTransmit } from '../types';
import { toLogTransmit } from '../types';

// Compression constants - must match server-side constants
const COMPRESSION_THRESHOLD_BYTES = 5 * 1024; // 5KB - compress if payload is larger
const COMPRESSION_THRESHOLD_LOGS = 10; // 10 logs - compress if more than this many

/**
 * Compress logs using gzip and return base64-encoded string
 *
 * Converts logs to LogTransmit format (removing 'original' field) before compression
 * to reduce bandwidth. The 'original' field is ~50% of the payload size and is only
 * needed locally when users expand log entries.
 *
 * @param logs - Array of log objects to compress
 * @returns Base64-encoded gzipped JSON string of optimized logs
 */
export async function compressLogs(logs: Log[]): Promise<string> {
	// Convert to transmission format (removes 'original' field for bandwidth optimization)
	const transmitLogs: LogTransmit[] = logs.map(toLogTransmit);

	const json = JSON.stringify(transmitLogs);
	const encoder = new TextEncoder();
	const uint8Array = encoder.encode(json);

	// Use browser's native CompressionStream (supported in all modern browsers)
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(uint8Array);
			controller.close();
		}
	});

	const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
	const compressedArrayBuffer = await new Response(compressedStream).arrayBuffer();
	const compressedUint8Array = new Uint8Array(compressedArrayBuffer);

	// Convert to base64 for JSON transmission
	return btoa(String.fromCharCode(...compressedUint8Array));
}

/**
 * Decompress base64-encoded gzipped data and return log array
 *
 * Note: Decompressed logs are in LogTransmit format (without 'original' field).
 * When received from friends/groups, these logs will have 'original' set to an empty
 * string or undefined. The expanded view in the UI will show "Original log unavailable"
 * for remote logs, or we can hide the expand functionality for remote logs.
 *
 * @param compressedData - Base64-encoded gzipped data
 * @returns Array of decompressed LogTransmit objects (cast to Log for compatibility)
 */
export async function decompressLogs(compressedData: string): Promise<Log[]> {
	// Decode base64
	const binaryString = atob(compressedData);
	const uint8Array = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		uint8Array[i] = binaryString.charCodeAt(i);
	}

	// Use browser's native DecompressionStream
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(uint8Array);
			controller.close();
		}
	});

	const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
	const decompressedArrayBuffer = await new Response(decompressedStream).arrayBuffer();
	const decoder = new TextDecoder();
	const json = decoder.decode(decompressedArrayBuffer);

	const transmitLogs: LogTransmit[] = JSON.parse(json);

	// Convert LogTransmit to Log format by adding missing fields
	// Recursive function to convert children as well
	function convertToLog(transmitLog: LogTransmit): Log {
		const log: Log = {
			...transmitLog,
			original: '', // Remote logs don't have original text
			open: false, // UI state always starts closed
			children: transmitLog.children?.map(convertToLog)
		};
		return log;
	}

	return transmitLogs.map(convertToLog);
}

/**
 * Check if logs should be compressed based on size/count thresholds
 * @param logs - Array of log objects
 * @returns true if compression should be used
 */
export function shouldCompressLogs(logs: Log[]): boolean {
	if (logs.length > COMPRESSION_THRESHOLD_LOGS) {
		return true;
	}
	const jsonSize = JSON.stringify(logs).length;
	return jsonSize > COMPRESSION_THRESHOLD_BYTES;
}
