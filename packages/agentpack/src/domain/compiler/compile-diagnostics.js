export class CompilerDiagnosticError extends Error {
  constructor(message, {
    code = 'compiler_diagnostic',
    location = null,
    details = null,
  } = {}) {
    super(message);
    this.name = 'CompilerDiagnosticError';
    this.code = code;
    this.location = location;
    this.details = details;
  }
}

export function diagnostic(message, options = {}) {
  return new CompilerDiagnosticError(message, options);
}
