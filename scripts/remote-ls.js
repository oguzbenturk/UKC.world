/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import { NodeSSH } from 'node-ssh';

function resolveDeploySettings() {
  const cwd = process.cwd();
  const secretsPath = path.join(cwd, '.deploy.secrets.json');
  if (!fs.existsSync(secretsPath)) {
    throw new Error('Missing .deploy.secrets.json');
  }

  const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'));
  const host = process.env.DEPLOY_HOST || secrets.host;
  const username = process.env.DEPLOY_USER || secrets.user || 'root';
  const password = process.env.DEPLOY_PASSWORD || secrets.password;
  const keyPath = process.env.DEPLOY_KEY_PATH || secrets.keyPath;
  const remotePath = process.env.DEPLOY_PATH || secrets.path || '/root/plannivo';

  if (!host) {
    throw new Error('No host defined');
  }

  const sshConfig = {
    host,
    username,
    password: password || undefined,
    privateKey: keyPath ? fs.readFileSync(keyPath, 'utf-8') : undefined,
    readyTimeout: 20000,
  };

  return { remotePath, sshConfig };
}

async function main() {
  const { remotePath, sshConfig } = resolveDeploySettings();
  const ssh = new NodeSSH();

  try {
    await ssh.connect(sshConfig);
  const nginxErrorCmd = `docker exec plannivo_frontend_1 sh -c 'if [ -f /var/log/nginx/error.log ]; then tail -n 40 /var/log/nginx/error.log; else echo "no error log present"; fi'`;
  const nginxConfCmd = `docker exec plannivo_frontend_1 sh -c 'if [ -f /etc/nginx/conf.d/nginx.conf ]; then cat /etc/nginx/conf.d/nginx.conf; else echo "nginx.conf missing"; fi'`;

    const operations = [
      {
        label: 'Listing remote repo root...',
        command: 'ls',
        onResult: ({ stdout }) => console.log('Remote root listing:', stdout),
      },
      {
        label: 'Inspecting backend uploads...',
        command: 'docker exec plannivo_backend_1 ls -l /app/uploads/avatars | tail',
        stderrLabel: 'backend err',
        onResult: ({ stdout }) => console.log('Backend uploads:', stdout),
      },
      {
        label: 'Inspecting frontend uploads...',
        command: 'docker exec plannivo_frontend_1 ls -l /var/www/uploads/avatars | tail',
        stderrLabel: 'frontend err',
        onResult: ({ stdout }) => console.log('Frontend uploads:', stdout),
      },
      {
        label: 'Checking frontend upload directory perms...',
        command: 'docker exec plannivo_frontend_1 ls -ld /var/www/uploads /var/www/uploads/avatars',
        stderrLabel: 'frontend perms err',
        onResult: ({ stdout }) => console.log('Frontend upload directory perms:\n', stdout),
      },
      {
        label: 'Fetching nginx error log tail...',
        command: nginxErrorCmd,
        stderrLabel: 'nginx error tail err',
        onResult: ({ stdout }) => console.log('Nginx error log tail:\n', stdout),
      },
      {
        label: 'Fetching nginx.conf from container...',
        command: nginxConfCmd,
        stderrLabel: 'nginx.conf err',
        onResult: ({ stdout }) => console.log('Nginx conf in container:\n', stdout),
      },
      {
        label: 'Testing nginx serves sample avatar...',
        command: "docker exec plannivo_frontend_1 curl -sk -o /dev/null -w '%{http_code}\n' https://localhost/uploads/avatars/eb4d7e67-b2ff-4233-a7fd-a9250d87dd59-1759472616427.png",
        stderrLabel: 'nginx curl err',
        onResult: ({ stdout }) => console.log('Nginx local response code:', stdout.trim()),
      },
      {
        label: 'Testing backend static fallback directly...',
        command: "docker exec plannivo_frontend_1 curl -s -o /dev/null -w '%{http_code}\n' http://backend:4000/uploads/avatars/eb4d7e67-b2ff-4233-a7fd-a9250d87dd59-1759472616427.png",
        stderrLabel: 'backend curl err',
        onResult: ({ stdout }) => console.log('Backend direct response code:', stdout.trim()),
      },
      {
        label: 'Validating nginx user can read sample file...',
        command: "docker exec --user nginx plannivo_frontend_1 sh -c 'head -c 16 /var/www/uploads/avatars/eb4d7e67-b2ff-4233-a7fd-a9250d87dd59-1759472616427.png | od -An -t x1'",
        stderrLabel: 'nginx user read err',
        onResult: ({ stdout }) => console.log('Nginx user read sample output:', stdout.trim()),
      },
    ];

    for (const op of operations) {
      console.log(`➡️  ${op.label}`);
      const result = await ssh.execCommand(op.command, { cwd: remotePath });
      if (result.stderr) {
        console.error(`${op.stderrLabel || 'stderr'}:`, result.stderr);
      }
      if (typeof op.onResult === 'function') {
        op.onResult(result);
      }
    }

    console.log('✅ Remote diagnostics complete.');
  } finally {
    ssh.dispose();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
