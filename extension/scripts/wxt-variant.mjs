import { spawn } from 'node:child_process';

const [, , variant, ...args] = process.argv;

if (!['quick-save', 'newtab'].includes(variant)) {
  console.error('Usage: node scripts/wxt-variant.mjs <quick-save|newtab> <wxt args...>');
  process.exit(1);
}

const bin = process.platform === 'win32' ? 'wxt.cmd' : 'wxt';
const child = spawn(bin, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    BB_EXTENSION_VARIANT: variant,
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
