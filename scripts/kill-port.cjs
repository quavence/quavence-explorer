const { execFileSync } = require('child_process');

const port = Number(process.argv[2] || process.env.PORT || 3039);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`[kill-port] Invalid port: ${process.argv[2] || process.env.PORT}`);
  process.exit(1);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function killWindowsPort() {
  const output = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
  const pids = [];

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('LISTENING')) continue;

    const parts = trimmed.split(/\s+/);
    const localAddress = parts[1] || '';
    const pid = parts[parts.length - 1];

    if (localAddress.endsWith(`:${port}`)) {
      pids.push(pid);
    }
  }

  for (const pid of unique(pids)) {
    if (pid === String(process.pid)) continue;
    console.log(`[kill-port] Stopping process ${pid} on port ${port}`);
    execFileSync('taskkill', ['/PID', pid, '/F'], { stdio: 'inherit' });
  }

  if (pids.length === 0) {
    console.log(`[kill-port] Port ${port} is free`);
  }
}

function killUnixPort() {
  let output = '';
  try {
    output = execFileSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf8' });
  } catch {
    console.log(`[kill-port] Port ${port} is free`);
    return;
  }

  const pids = unique(output.split(/\s+/));
  for (const pid of pids) {
    if (pid === String(process.pid)) continue;
    console.log(`[kill-port] Stopping process ${pid} on port ${port}`);
    execFileSync('kill', ['-9', pid], { stdio: 'inherit' });
  }
}

if (process.platform === 'win32') {
  killWindowsPort();
} else {
  killUnixPort();
}
