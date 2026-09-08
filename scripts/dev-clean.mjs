import { execSync, spawn } from 'node:child_process';
import process from 'node:process';

const port = process.env.PORT || '3000';
console.log(`🔍 Verificando processos na porta ${port}...`);

function killZombieProcesses(targetPort) {
  if (process.platform === 'win32') {
    try {
      const output = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
      const lines = output.split('\n');
      const pids = new Set();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[3] === 'LISTENING') {
          const localAddr = parts[1];
          if (localAddr.endsWith(`:${targetPort}`)) {
            const pid = parseInt(parts[4], 10);
            if (pid && pid > 0 && pid !== process.pid) {
              pids.add(pid);
            }
          }
        }
      }
      if (pids.size > 0) {
        for (const pid of pids) {
          console.log(`⚠️ Processo zumbi detectado na porta ${targetPort} (PID: ${pid}). Finalizando...`);
          try {
            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          } catch {}
        }
      } else {
        console.log(`✅ Porta ${targetPort} está livre.`);
      }
    } catch (e) {
      console.warn(`⚠️ Não foi possível verificar portas via netstat: ${e.message}`);
    }
  } else {
    try {
      const pids = execSync(`lsof -t -i:${targetPort}`, { encoding: 'utf8' }).trim();
      if (pids) {
        for (const pid of pids.split('\n')) {
          const cleanPid = pid.trim();
          if (cleanPid) {
            console.log(`⚠️ Processo zumbi detectado na porta ${targetPort} (PID: ${cleanPid}). Finalizando...`);
            try {
              execSync(`kill -9 ${cleanPid}`, { stdio: 'ignore' });
            } catch {}
          }
        }
      } else {
        console.log(`✅ Porta ${targetPort} está livre.`);
      }
    } catch {
      console.log(`✅ Porta ${targetPort} está livre.`);
    }
  }
}

killZombieProcesses(port);

console.log(`🚀 Iniciando servidor de desenvolvimento Next.js na porta ${port}...`);
const nextProcess = spawn('npx', ['next', 'dev', '-p', port], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

nextProcess.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
