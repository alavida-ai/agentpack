import { ValidationError } from '../../utils/errors.js';

export class PluginDiagnosticError extends ValidationError {
  constructor(message, {
    code,
    path,
    nextSteps = [],
    details = {},
  } = {}) {
    super(message, {
      code,
      path,
      nextSteps,
      details,
    });
    this.name = 'PluginDiagnosticError';
  }
}
