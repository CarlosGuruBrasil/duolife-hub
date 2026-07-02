#!/bin/bash
# scripts/dev-clean.sh
# Inicializa o servidor de desenvolvimento limpando processos zumbis anteriores.

PORT=3000
echo "🔍 Verificando processos na porta $PORT..."

# Encontra PIDs escutando na porta 3000
PIDS=$(lsof -t -i:$PORT)

if [ ! -z "$PIDS" ]; then
  for PID in $PIDS; do
    echo "⚠️ Processo zumbi detectado na porta $PORT (PID: $PID). Finalizando..."
    kill -9 $PID 2>/dev/null
  done
  sleep 1
else
  echo "✅ Porta $PORT está livre."
fi

# Garante que estamos na raiz do projeto (um nível acima da pasta scripts)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.." || exit

echo "🚀 Iniciando servidor de desenvolvimento Next.js na pasta: $(pwd)"
npx next dev
