export function runtimeConfig(env = process.env) {
  const profile = env.APP_PROFILE || 'development';
  if (!['development', 'production'].includes(profile)) throw Error('Unsupported APP_PROFILE');
  const production = profile === 'production';
  const port = Number(env.PORT || 5174);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid PORT');
  const origin = env.APP_ORIGIN || 'http://localhost:' + port;
  const url = new URL(origin);
  if (url.origin !== origin || url.username || url.password) throw Error('APP_ORIGIN must be an origin without path or credentials');
  if (production) {
    if (url.protocol !== 'https:') throw Error('Production APP_ORIGIN requires HTTPS');
    if (env.LOCAL_DEMO_ARCHIVE === '1') throw Error('Demo archive is forbidden in production');
    const required = ['APP_DATABASE_URL','AUTH_DATABASE_URL','APP_DATA_REGION','BETTER_AUTH_SECRET','SOURCE_ENCRYPTION_KEY','RESEND_API_KEY','MAIL_FROM','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_ENDPOINT_URL_S3','AWS_REGION','SCANNER_DATABASE_URL','IMPORT_PREVIEW_IMAGE'];
    const missing = required.filter(key => !env[key]);
    if (!env.CLAMAV_SOCKET && !env.CLAMAV_HOST) missing.push('CLAMAV_HOST or CLAMAV_SOCKET');
    if (missing.length) throw Error('Missing production configuration: ' + missing.join(', '));
    if (env.BETTER_AUTH_SECRET.length < 32) throw Error('BETTER_AUTH_SECRET must contain at least 32 characters');
    if (!/^[0-9a-f]{64}$/.test(env.SOURCE_ENCRYPTION_KEY)) throw Error('SOURCE_ENCRYPTION_KEY must be 32 bytes in hex');
    if (!/^sha256:[0-9a-f]{64}$/.test(env.IMPORT_PREVIEW_IMAGE)) throw Error('IMPORT_PREVIEW_IMAGE must be a pinned local image ID');
  }
  return {profile, production, port, origin, host: production ? (env.BIND_HOST || '0.0.0.0') : '127.0.0.1'};
}

export function requestBoundary(config) {
  const allowedHosts = config.production ? [new URL(config.origin).host] : ['localhost:' + config.port, '127.0.0.1:' + config.port];
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    if (config.production) {
      res.setHeader('Strict-Transport-Security','max-age=31536000');
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    }
    if (!allowedHosts.includes(req.headers.host)) return res.status(403).json({error:'Host rejected'});
    const expectedOrigin = config.production ? config.origin : 'http://' + req.headers.host;
    if (req.headers.origin && req.headers.origin !== expectedOrigin) return res.status(403).json({error:'Cross-origin request denied'});
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin !== expectedOrigin) return res.status(403).json({error:'Same-origin request required'});
    next();
  };
}
