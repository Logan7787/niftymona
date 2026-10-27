// ==============================================================================
// Native Concurrent Development Runner
// Spawns backend (port 4000) and frontend (port 5173) in parallel
// ==============================================================================

import { spawn } from 'child_process';

console.log('\x1b[36m%s\x1b[0m', '>>> Starting NIFTY ATM ANALYZER Full-Stack Development Environment...');

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

// 1. Spawn Backend
const server = spawn(npmCmd, ['run', 'dev', '--workspace=@nifty-atm/server'], {
  stdio: 'inherit',
  shell: true,
});

// 2. Spawn Frontend
const web = spawn(npmCmd, ['run', 'dev', '--workspace=@nifty-atm/web'], {
  stdio: 'inherit',
  shell: true,
});

function cleanup() {
  console.log('\nStopping servers...');
  server.kill('SIGINT');
  web.kill('SIGINT');
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
