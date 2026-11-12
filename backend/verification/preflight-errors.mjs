// Never include service messages, URLs, credentials, or arbitrary error codes.
const messages = {
 '28P01': 'Database credentials rejected (28P01); refresh credentials for the existing database roles',
 ECONNREFUSED: 'Service connection refused', ENOTFOUND: 'Service hostname could not be resolved',
 ETIMEDOUT: 'Service connection timed out', ENOENT: 'Required executable is unavailable',
 SCANNER_NOT_CONFIGURED: 'Missing CLAMAV_HOST or CLAMAV_SOCKET',
 SCANNER_REQUIRES_LOCAL_PRIVATE_TRANSPORT: 'Scanner requires a local private transport',
 SCANNER_CONFIGURATION_INVALID: 'Invalid scanner configuration',
 SCANNER_TIMEOUT: 'Scanner connection timed out', SCANNER_UNAVAILABLE: 'Scanner is unavailable',
 SCANNER_TRUNCATED_RESPONSE: 'Scanner returned an incomplete response',
 SCANNER_INVALID_RESPONSE: 'Scanner returned an invalid response',
 SCANNER_VERSION_UNAVAILABLE: 'Scanner version unavailable',
 SCANNER_SIGNATURES_STALE: 'Scanner signatures are stale or have an invalid timestamp'
};
export function safePreflightError(error) {
 return (Object.hasOwn(messages,error?.code) ? messages[error.code] : null) || 'Check failed; verify configuration and service availability';
}
