/**
 * Structured error codes matching the CLI design reference exit code map.
 */
export const EXIT_CODES = {
  SUCCESS: 0,
  GENERAL: 1,
  VALIDATION: 2,
  NETWORK: 3,
  NOT_FOUND: 4,
};

/**
 * Base error class for all agentpack CLI errors.
 * Carries a machine-readable code and mapped exit code.
 */
export class AgentpackError extends Error {
  constructor(message, {
    code,
    exitCode = EXIT_CODES.GENERAL,
    suggestion,
    path,
    nextSteps,
    details,
  } = {}) {
    super(message);
    this.name = 'AgentpackError';
    this.code = code || 'general_error';
    this.exitCode = exitCode;
    this.suggestion = suggestion;
    this.path = path;
    this.nextSteps = nextSteps || [];
    this.details = details || {};
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      ...(this.path && { path: this.path }),
      ...(this.nextSteps.length > 0 && { nextSteps: this.nextSteps }),
      ...(Object.keys(this.details).length > 0 && { details: this.details }),
      ...(this.suggestion && { suggestion: this.suggestion }),
    };
  }
}

export class ValidationError extends AgentpackError {
  constructor(message, opts = {}) {
    super(message, { code: 'validation_error', exitCode: EXIT_CODES.VALIDATION, ...opts });
    this.name = 'ValidationError';
  }
}

export class NetworkError extends AgentpackError {
  constructor(message, opts = {}) {
    super(message, { code: 'network_error', exitCode: EXIT_CODES.NETWORK, ...opts });
    this.name = 'NetworkError';
  }
}

export class NotFoundError extends AgentpackError {
  constructor(message, opts = {}) {
    super(message, { code: 'not_found', exitCode: EXIT_CODES.NOT_FOUND, ...opts });
    this.name = 'NotFoundError';
  }
}

/**
 * Format an error for human-readable stderr output.
 */
export function formatError(err) {
  if (err instanceof AgentpackError) {
    let msg = `Error: ${err.message}`;
    if (err.path) {
      msg += `\nPath: ${err.path}`;
    }
    if (err.nextSteps?.length) {
      for (const step of err.nextSteps) {
        const actionLabel = step.action === 'create_file'
          ? `Create ${step.path}`
          : step.action === 'edit_file'
            ? `Edit ${step.path}`
            : step.reason;
        msg += `\nNext: ${actionLabel}`;
        if (step.reason && step.reason !== actionLabel) {
          msg += `\nWhy: ${step.reason}`;
        }
        if (step.example) {
          msg += `\nExample:\n${JSON.stringify(step.example, null, 2)}`;
        }
      }
    }
    if (err.suggestion) {
      msg += `\n\nSuggestion: ${err.suggestion}`;
    }
    return msg;
  }
  return `Error: ${err.message || err}`;
}
