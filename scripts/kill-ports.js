import { execSync } from 'child_process';

const PORTS = [3000, 3001, 4000];

console.log('Killing processes on ports:', PORTS.join(', '));

for (const port of PORTS) {
  try {
    const result = execSync(
      `netstat -ano | findstr :${port} | findstr LISTENING`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );

    const pids = new Set();
    for (const line of result.trim().split('\n')) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && pid !== '0') pids.add(pid);
    }

    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe' });
        console.log(`  Port ${port}: killed PID ${pid}`);
      } catch {
        // already dead
      }
    }

    if (pids.size === 0) {
      console.log(`  Port ${port}: free`);
    }
  } catch {
    console.log(`  Port ${port}: free`);
  }
}

console.log('Done!');
