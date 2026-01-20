import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile } from 'fs/promises';

const execAsync = promisify(exec);

const SSH_CONFIG = {
  host: process.env.SSH_HOST || 'your-server-ip',
  user: process.env.SSH_USER || 'root',
  port: process.env.SSH_PORT || '22',
};

const REMOTE_PATH = '/root/plannivo';

async function executeSSH(command) {
  const sshCommand = `ssh -p ${SSH_CONFIG.port} ${SSH_CONFIG.user}@${SSH_CONFIG.host} "${command}"`;
  console.log(`Executing: ${command}`);
  try {
    const { stdout, stderr } = await execAsync(sshCommand);
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    return { success: true, stdout, stderr };
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function enableMaintenanceMode() {
  console.log('\n🔧 ENABLING MAINTENANCE MODE...\n');

  const commands = [
    // Backup current nginx config
    `cp ${REMOTE_PATH}/nginx.conf ${REMOTE_PATH}/nginx.conf.backup`,
    
    // Create maintenance HTML page
    `cat > ${REMOTE_PATH}/maintenance.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Plannivo - Scheduled Maintenance</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            padding: 20px;
        }
        .container {
            text-align: center;
            max-width: 600px;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 60px 40px;
            box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
        }
        .icon {
            font-size: 80px;
            margin-bottom: 30px;
            animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.1); opacity: 0.8; }
        }
        h1 {
            font-size: 2.5em;
            margin-bottom: 20px;
            font-weight: 700;
        }
        p {
            font-size: 1.2em;
            line-height: 1.6;
            margin-bottom: 15px;
            opacity: 0.95;
        }
        .time {
            font-size: 1em;
            opacity: 0.85;
            margin-top: 30px;
            padding: 15px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
        }
        .contact {
            margin-top: 40px;
            font-size: 0.95em;
            opacity: 0.9;
        }
        a {
            color: #fff;
            text-decoration: none;
            border-bottom: 2px solid rgba(255, 255, 255, 0.5);
            transition: border-color 0.3s;
        }
        a:hover {
            border-bottom-color: #fff;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">🔧</div>
        <h1>Scheduled Maintenance</h1>
        <p>We're currently performing scheduled maintenance to improve your experience.</p>
        <p>Our services will be back online shortly.</p>
        <div class="time">
            <strong>Maintenance Window:</strong> 2-4 hours<br>
            <small>We appreciate your patience!</small>
        </div>
        <div class="contact">
            <p>For urgent matters, please contact us at<br>
            <a href="mailto:support@plannivo.com">support@plannivo.com</a></p>
        </div>
    </div>
    <script>
        // Auto-refresh every 5 minutes to check if service is back
        setTimeout(() => window.location.reload(), 300000);
    </script>
</body>
</html>
EOF`,

    // Create maintenance nginx config
    `cat > ${REMOTE_PATH}/nginx.maintenance.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Maintenance mode - serve static page
    server {
        listen 80;
        listen [::]:80;
        server_name _;

        root /root/plannivo;
        
        location / {
            return 503;
        }

        error_page 503 @maintenance;
        
        location @maintenance {
            rewrite ^(.*)$ /maintenance.html break;
            internal;
        }
    }

    server {
        listen 443 ssl http2;
        listen [::]:443 ssl http2;
        server_name _;

        ssl_certificate /root/plannivo/SSL/certificate.crt;
        ssl_certificate_key /root/plannivo/SSL/private.key;
        ssl_protocols TLSv1.2 TLSv1.3;

        root /root/plannivo;

        location / {
            return 503;
        }

        error_page 503 @maintenance;
        
        location @maintenance {
            rewrite ^(.*)$ /maintenance.html break;
            internal;
        }
    }
}
EOF`,

    // Stop the application containers (keeping infrastructure)
    `cd ${REMOTE_PATH} && docker-compose stop web backend`,

    // Apply maintenance nginx config
    `docker cp ${REMOTE_PATH}/nginx.maintenance.conf plannivo-nginx-1:/etc/nginx/nginx.conf`,
    
    // Reload nginx
    `docker exec plannivo-nginx-1 nginx -s reload`,
  ];

  console.log('📋 Executing maintenance mode steps...\n');

  for (const command of commands) {
    const result = await executeSSH(command);
    if (!result.success) {
      console.error(`\n❌ Failed to execute: ${command}`);
      console.error('You may need to manually restore the system.');
      return false;
    }
  }

  console.log('\n✅ MAINTENANCE MODE ENABLED');
  console.log('🌐 Your servers are now showing the maintenance page');
  console.log('💾 Backup saved as nginx.conf.backup\n');
  return true;
}

async function disableMaintenanceMode() {
  console.log('\n🚀 RESTORING SERVICES...\n');

  const commands = [
    // Restore original nginx config
    `docker cp ${REMOTE_PATH}/nginx.conf.backup plannivo-nginx-1:/etc/nginx/nginx.conf || docker cp ${REMOTE_PATH}/nginx.conf plannivo-nginx-1:/etc/nginx/nginx.conf`,

    // Start application containers
    `cd ${REMOTE_PATH} && docker-compose start web backend`,

    // Wait for containers to be healthy
    `sleep 5`,

    // Reload nginx with restored config
    `docker exec plannivo-nginx-1 nginx -s reload`,

    // Verify containers are running
    `cd ${REMOTE_PATH} && docker-compose ps`,
  ];

  console.log('📋 Executing restoration steps...\n');

  for (const command of commands) {
    const result = await executeSSH(command);
    if (!result.success && !command.includes('||')) {
      console.error(`\n⚠️ Warning: ${command} had issues`);
    }
  }

  console.log('\n✅ SERVICES RESTORED');
  console.log('🌐 Your servers are now back online');
  console.log('🔍 Check the docker-compose ps output above to verify all containers are running\n');
  return true;
}

async function checkStatus() {
  console.log('\n📊 CHECKING MAINTENANCE STATUS...\n');

  const commands = [
    `docker exec plannivo-nginx-1 cat /etc/nginx/nginx.conf | grep -q "maintenance" && echo "MAINTENANCE_MODE_ACTIVE" || echo "NORMAL_MODE_ACTIVE"`,
    `cd ${REMOTE_PATH} && docker-compose ps`,
  ];

  for (const command of commands) {
    await executeSSH(command);
  }
  console.log();
}

// Main execution
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'enable':
  case 'on':
    await enableMaintenanceMode();
    break;

  case 'disable':
  case 'off':
    await disableMaintenanceMode();
    break;

  case 'status':
    await checkStatus();
    break;

  default:
    console.log(`
🔧 Plannivo Maintenance Mode Manager

Usage:
  node maintenance-mode.js [command]

Commands:
  enable | on       Put servers in maintenance mode
  disable | off     Restore normal operations
  status           Check current maintenance status

Examples:
  node maintenance-mode.js enable
  node maintenance-mode.js off
  node maintenance-mode.js status

Environment Variables:
  SSH_HOST          Server hostname/IP
  SSH_USER          SSH username (default: root)
  SSH_PORT          SSH port (default: 22)

Note: Make sure your SSH key is configured and you have access to the production server.
    `);
    process.exit(1);
}
