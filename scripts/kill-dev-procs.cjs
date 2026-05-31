const { execFileSync } = require('child_process');

if (process.platform !== 'win32') {
  process.exit(0);
}

const projectPath = process.cwd().toLowerCase();
const currentPid = String(process.pid);

const output = execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    "Get-CimInstance Win32_Process -Filter \"name = 'node.exe'\" | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress",
  ],
  { encoding: 'utf8' },
).trim();

if (!output) {
  process.exit(0);
}

const processes = JSON.parse(output);
const list = Array.isArray(processes) ? processes : [processes];

const devPatterns = [
  'npm-cli.js" run dev',
  'npm-cli.js" run api:dev',
  'npm-cli.js" run web:dev',
  'concurrently',
  'tsx\\dist\\cli.mjs" watch src/api/server.ts',
  'vite\\bin\\vite.js',
];

for (const proc of list) {
  const pid = String(proc.ProcessId || '');
  const commandLine = String(proc.CommandLine || '');
  const lower = commandLine.toLowerCase();

  if (!pid || pid === currentPid) continue;
  if (!lower.includes(projectPath)) continue;
  if (!devPatterns.some((pattern) => lower.includes(pattern.toLowerCase()))) continue;

  console.log(`[kill-dev-procs] Stopping project dev process ${pid}`);
  try {
    execFileSync('taskkill', ['/PID', pid, '/F'], { stdio: 'inherit' });
  } catch {
    // The process may have already exited.
  }
}
