import * as fs from 'fs/promises';

const DEFAULT_MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
const DEFAULT_MAX_CONTENT_LENGTH = 500_000; // 500K chars

/**
 * Validates file size before reading.
 * Prevents denial-of-service via large file reads.
 */
export async function validateFileSize(
  filePath: string,
  maxBytes: number = DEFAULT_MAX_FILE_SIZE
): Promise<void> {
  const stat = await fs.stat(filePath);
  if (stat.size > maxBytes) {
    throw new FileTooLargeError(filePath, stat.size, maxBytes);
  }
}

/**
 * Validates that content length is within bounds before processing.
 */
export function validateContentLength(
  content: string,
  maxLength: number = DEFAULT_MAX_CONTENT_LENGTH
): void {
  if (content.length > maxLength) {
    throw new ContentTooLargeError(content.length, maxLength);
  }
}

export class FileTooLargeError extends Error {
  constructor(filePath: string, actualSize: number, maxSize: number) {
    const sizeMb = (actualSize / 1024 / 1024).toFixed(1);
    const maxMb = (maxSize / 1024 / 1024).toFixed(1);
    super(`File too large (${sizeMb}MB, max ${maxMb}MB)`);
    this.name = 'FileTooLargeError';
  }
}

export class ContentTooLargeError extends Error {
  constructor(actualLength: number, maxLength: number) {
    super(`Content too large (${actualLength} chars, max ${maxLength})`);
    this.name = 'ContentTooLargeError';
  }
}
