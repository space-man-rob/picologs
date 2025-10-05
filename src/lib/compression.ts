/**
 * Compression utilities for log data using gzip
 * Uses browser's native CompressionStream/DecompressionStream APIs
 */

// Compression constants - must match server-side constants
const COMPRESSION_THRESHOLD_BYTES = 5 * 1024; // 5KB - compress if payload is larger
const COMPRESSION_THRESHOLD_LOGS = 10; // 10 logs - compress if more than this many

/**
 * Compress logs using gzip and return base64-encoded string
 * @param logs - Array of log objects to compress
 * @returns Base64-encoded gzipped JSON string
 */
export async function compressLogs(logs: any[]): Promise<string> {
	const json = JSON.stringify(logs);
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
 * @param compressedData - Base64-encoded gzipped data
 * @returns Array of decompressed log objects
 */
export async function decompressLogs(compressedData: string): Promise<any[]> {
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

	return JSON.parse(json);
}

/**
 * Check if logs should be compressed based on size/count thresholds
 * @param logs - Array of log objects
 * @returns true if compression should be used
 */
export function shouldCompressLogs(logs: any[]): boolean {
	if (logs.length > COMPRESSION_THRESHOLD_LOGS) {
		return true;
	}
	const jsonSize = JSON.stringify(logs).length;
	return jsonSize > COMPRESSION_THRESHOLD_BYTES;
}
