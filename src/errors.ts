// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2025 Theodor Storm

/**
 * Custom error classes for Brainstorm MCP server
 *
 * This module provides a hierarchy of error types that distinguish between
 * user-facing errors (safe to surface to clients) and system errors (should
 * be sanitized to prevent information leakage).
 *
 * Error Hierarchy:
 * - UserError (base class for all user-facing errors)
 *   - ValidationError (invalid input format/constraints)
 *   - NotFoundError (requested resource doesn't exist)
 *   - PermissionError (access denied)
 *   - ConflictError (resource collision/duplicate)
 *
 * System errors (plain Error) are caught and sanitized to "Internal server error"
 *
 * @module errors
 */

/**
 * Base class for all user-facing errors that are safe to return to clients.
 *
 * UserError and its subclasses include:
 * - message: Human-readable error description
 * - code: Machine-readable error code for client branching
 * - details: Optional additional context (must not contain sensitive data)
 *
 * @example
 * throw new UserError('Invalid operation', 'INVALID_OPERATION', {
 *   attempted: 'delete',
 *   reason: 'missing permission'
 * });
 */
export class UserError extends Error {
  /**
   * Create a user-facing error
   * @param message - Human-readable error description
   * @param code - Machine-readable error code (UPPER_SNAKE_CASE)
   * @param details - Optional additional context (no sensitive data)
   */
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'UserError';

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UserError);
    }
  }
}

/**
 * Error thrown when user input fails validation constraints.
 *
 * Use for:
 * - Invalid identifier formats (path traversal, special characters)
 * - Length/size limit violations
 * - Malformed data (JSON structure, encoding)
 * - Type mismatches
 *
 * @example
 * throw new ValidationError(
 *   'Invalid project_id: must contain only alphanumeric characters, dash, underscore',
 *   'INVALID_ID_FORMAT',
 *   { provided: '../etc/passwd' }
 * );
 *
 * @example
 * throw new ValidationError(
 *   'Resource exceeds maximum size of 10485760 bytes',
 *   'RESOURCE_TOO_LARGE',
 *   { size: 15000000, limit: 10485760 }
 * );
 */
export class ValidationError extends UserError {
  constructor(
    message: string,
    code: string,
    details?: Record<string, unknown>
  ) {
    super(message, code, details);
    this.name = 'ValidationError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }
}

/**
 * Error thrown when a requested resource does not exist.
 *
 * Use for:
 * - Project not found
 * - Agent/member not found
 * - Resource not found
 * - Message not found
 *
 * @example
 * throw new NotFoundError(
 *   'Project not found',
 *   'PROJECT_NOT_FOUND',
 *   { project_id: 'nonexistent-project' }
 * );
 *
 * @example
 * throw new NotFoundError(
 *   'Member not found',
 *   'MEMBER_NOT_FOUND',
 *   { project_id: 'my-project', agent_name: 'unknown-agent' }
 * );
 */
export class NotFoundError extends UserError {
  constructor(
    message: string,
    code: string,
    details?: Record<string, unknown>
  ) {
    super(message, code, details);
    this.name = 'NotFoundError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NotFoundError);
    }
  }
}

/**
 * Error thrown when user lacks required permissions for an operation.
 *
 * Use for:
 * - Access denied to resources
 * - Insufficient read/write permissions
 * - Creator-only operations
 * - Authorization failures
 *
 * @example
 * throw new PermissionError(
 *   'Access denied: only the project creator can delete it',
 *   'DELETE_PERMISSION_DENIED',
 *   { project_id: 'my-project', creator: 'alice', requester: 'bob' }
 * );
 *
 * @example
 * throw new PermissionError(
 *   'Access denied: insufficient write permissions',
 *   'WRITE_PERMISSION_DENIED',
 *   { resource_id: 'secret-doc', required: 'write', has: 'read' }
 * );
 */
export class PermissionError extends UserError {
  constructor(
    message: string,
    code: string,
    details?: Record<string, unknown>
  ) {
    super(message, code, details);
    this.name = 'PermissionError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PermissionError);
    }
  }
}

/**
 * Error thrown when an operation would create a duplicate or conflicting resource.
 *
 * Use for:
 * - Duplicate project creation
 * - Agent name already taken
 * - Resource ID collision
 * - Constraint violations
 *
 * @example
 * throw new ConflictError(
 *   'Project already exists',
 *   'PROJECT_EXISTS',
 *   { project_id: 'duplicate-project' }
 * );
 *
 * @example
 * throw new ConflictError(
 *   'Agent name already taken in this project',
 *   'AGENT_NAME_TAKEN',
 *   { project_id: 'my-project', agent_name: 'frontend' }
 * );
 */
export class ConflictError extends UserError {
  constructor(
    message: string,
    code: string,
    details?: Record<string, unknown>
  ) {
    super(message, code, details);
    this.name = 'ConflictError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ConflictError);
    }
  }
}

/**
 * Type guard to check if an error is a UserError
 * @param error - Error to check
 * @returns true if error is UserError or subclass
 */
export function isUserError(error: unknown): error is UserError {
  return error instanceof UserError;
}
