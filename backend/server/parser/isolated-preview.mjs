import {execFile, spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {promisify} from 'node:util';

const docker = promisify(execFile);
const deadlineMs = 30000;
const maxOutputBytes = 8 * 1024 * 1024;
const imageId = /^sha256:[0-9a-f]{64}$/;
const unavailable = {code: 'PREVIEW_RUNTIME_UNAVAILABLE', message: 'Isolated preview is unavailable'};

export function previewConfigured() {
  return imageId.test(process.env.IMPORT_PREVIEW_IMAGE ?? '');
}

export async function runIsolatedPreview(bytes, options) {
  const image = process.env.IMPORT_PREVIEW_IMAGE;
  if (!imageId.test(image ?? '')) return {error: unavailable};

  const name = 'mizan-preview-' + randomUUID();
  const cli = ['--context', 'default'];
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => /^(PATH|SystemRoot|WINDIR|HOME|USERPROFILE)$/i.test(key)));
  const processOptions = {env, windowsHide: true};
  try {
    await docker('docker', [...cli, 'create', '--pull=never', '--name', name,
      '--interactive', '--network=none', '--read-only', '--user=65532:65532',
      '--cap-drop=ALL', '--security-opt=no-new-privileges:true', '--log-driver=none',
      '--memory=768m', '--memory-swap=768m', '--cpus=1', '--pids-limit=32', image],
    {...processOptions, timeout: 5000, maxBuffer: 4096});
    return await new Promise(resolve => {
      const child = spawn('docker', [...cli, 'start', '--attach', '--interactive', name],
        {...processOptions, stdio: ['pipe', 'pipe', 'ignore']});
      const chunks = [];
      let size = 0;
      let failure;
      const timer = setTimeout(() => {
        failure = {code: 'PREVIEW_TIME_LIMIT', message: 'The preview exceeded its time limit'};
        child.kill();
      }, deadlineMs);
      child.stdin.on('error', () => {});
      child.on('error', () => { failure = unavailable; });
      child.stdout.on('data', chunk => {
        if (failure) return;
        size += chunk.length;
        if (size > maxOutputBytes) {
          failure = {code: 'PREVIEW_OUTPUT_LIMIT', message: 'Choose fewer rows for the preview'};
          child.kill();
          return;
        }
        chunks.push(chunk);
      });
      child.on('close', code => {
        clearTimeout(timer);
        if (failure || code !== 0) return resolve({error: failure ?? unavailable});
        try {
          const reply = JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
          if (reply.data && typeof reply.data === 'object') return resolve({data: reply.data});
          if (/^[A-Z0-9_]{3,80}$/.test(reply.error?.code) && typeof reply.error?.message === 'string') {
            return resolve({error: {code: reply.error.code, message: reply.error.message.slice(0, 500)}});
          }
        } catch {
          // Treat malformed or truncated worker output as a runtime failure.
        }
        resolve({error: unavailable});
      });
      child.stdin.write(JSON.stringify(options) + '\n');
      child.stdin.end(bytes);
    });
  } catch {
    return {error: unavailable};
  } finally {
    await docker('docker', [...cli, 'rm', '--force', name],
      {...processOptions, timeout: 5000, maxBuffer: 4096}).catch(() => {});
  }
}
