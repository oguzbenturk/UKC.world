import { spawn } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('Starting Plannivo application via root dev script...');

// Run the main development script from the root package.json
// This script (npm run dev) should use concurrently to start both backend (with nodemon) and frontend.
const devProcess = spawn('npm', ['run', 'dev'], {
  cwd: __dirname, // Run from the root directory
  shell: true,
  stdio: 'inherit'
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('Shutting down dev process...');
  // Concurrently should handle shutting down its child processes (nodemon and vite)
  // Sending SIGINT to devProcess (which is concurrently) should be enough.
  devProcess.kill('SIGINT');
  // Allow time for graceful shutdown before exiting the main script
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

console.log('\nStarted main dev process using "npm run dev"! Use Ctrl+C to stop.\n');