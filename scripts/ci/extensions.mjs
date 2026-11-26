import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = fileURLToPath(new URL('../../', import.meta.url));
const npm = process.env.npm_execpath;
assert.ok(npm, 'Run this check with npm run ci:extensions');

// Start each build with OS/tool paths and the public settings for that extension.
const systemKeys = new Set([
  'PATH', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SYSTEMROOT',
  'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL',
]);
const systemEnv = Object.fromEntries(Object.entries(process.env)
  .filter(([key]) => systemKeys.has(key.toUpperCase())));

for (const extension of ['quicksave', 'newtab']) {
  const cwd = join(root, extension);
  const overrides = readdirSync(cwd).filter(name =>
    (name === '.env' || name.startsWith('.env.')) &&
    !['.env.production', '.env.example'].includes(name));
  assert.equal(overrides.length, 0, `Use a clean ${extension} checkout without dotenv overrides`);

  const production = parseEnv(readFileSync(join(cwd, '.env.production'), 'utf8'));
  const keys = ['VITE_CLERK_PUBLISHABLE_KEY', 'VITE_CLERK_FRONTEND_API', 'VITE_CLERK_SYNC_HOST'];
  if (extension === 'quicksave') keys.push('CRX_PUBLIC_KEY');
  const env = { ...systemEnv, CI: '1' };
  for (const key of keys) {
    assert.ok(production[key], `Missing ${key} in ${extension}/.env.production`);
    env[key] = production[key];
  }

  const run = (...args) => execFileSync(process.execPath, [npm, ...args], { cwd, env, stdio: 'inherit' });
  run('ci');
  for (const [build, output, version] of [
    ['build', 'chrome-mv3', 3],
    ['build:firefox', 'firefox-mv2', 2],
  ]) {
    run('run', build);
    const manifest = JSON.parse(readFileSync(join(cwd, '.output', output, 'manifest.json'), 'utf8'));
    assert.equal(manifest.manifest_version, version);
    if (version === 3) {
      assert.ok(manifest.permissions.includes('cookies'), 'Missing cookies permission');
      for (const key of ['VITE_CLERK_FRONTEND_API', 'VITE_CLERK_SYNC_HOST']) {
        const permission = `${new URL(env[key]).origin}/*`;
        assert.ok(manifest.host_permissions.includes(permission), `Missing ${permission}`);
      }
    }
    console.log(`Verified ${manifest.name} (${output})`);
  }
}
