import * as path from 'path';

const SLUG_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const MAX_SLUG_LENGTH = 128;

/**
 * Validates that a resolved path stays within the allowed base directory.
 * Prevents path traversal attacks (../ sequences, absolute paths escaping root).
 * Throws if the path escapes containment.
 */
export function validateContainedPath(basePath: string, userPath: string): string {
  const resolvedBase = path.resolve(basePath);
  const resolved = path.resolve(resolvedBase, userPath);

  if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) {
    throw new PathTraversalError(userPath);
  }

  return resolved;
}

/**
 * Sanitizes a slug (featureSlug, decisionId, templateName, stage).
 * Only allows alphanumeric, hyphens, and underscores.
 * Rejects empty strings, dot-sequences, and path separators.
 */
export function sanitizeSlug(input: string, fieldName: string): string {
  if (!input || input.length === 0) {
    throw new InvalidSlugError(fieldName, input, 'cannot be empty');
  }

  if (input.length > MAX_SLUG_LENGTH) {
    throw new InvalidSlugError(fieldName, input, `exceeds max length of ${MAX_SLUG_LENGTH}`);
  }

  if (!SLUG_PATTERN.test(input)) {
    throw new InvalidSlugError(
      fieldName,
      input,
      'must contain only alphanumeric characters, hyphens, and underscores'
    );
  }

  return input;
}

/**
 * Validates a file path array from user input.
 * Each path must resolve within the project root.
 * Returns array of validated absolute paths.
 */
export function validatePathArray(basePath: string, paths: string[]): string[] {
  return paths.map((p) => validateContainedPath(basePath, p));
}

export class PathTraversalError extends Error {
  constructor(attemptedPath: string) {
    super(`Path traversal blocked: ${sanitizeErrorPath(attemptedPath)}`);
    this.name = 'PathTraversalError';
  }
}

export class InvalidSlugError extends Error {
  constructor(fieldName: string, value: string, reason: string) {
    super(`Invalid ${fieldName}: ${reason}`);
    this.name = 'InvalidSlugError';
  }
}

/**
 * Strips sensitive path information from error messages.
 * Prevents leaking internal directory structure to MCP clients.
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof PathTraversalError || error instanceof InvalidSlugError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message.replace(/\/[^\s:'"]+/g, '[path]');
  }

  return 'An internal error occurred';
}

/**
 * Truncate a path for safe inclusion in error messages.
 */
function sanitizeErrorPath(p: string): string {
  if (p.length > 50) {
    return p.slice(0, 47) + '...';
  }
  return p;
}
