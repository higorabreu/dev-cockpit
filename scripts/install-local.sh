#!/usr/bin/env bash
# Constrói o pacote .deb e instala a versão nova no sistema, para o uso do dia a dia.
#
#   pnpm install:local            constrói, instala e reinicia o cockpit (pergunta antes de reiniciar)
#   pnpm install:local --no-restart   instala e deixa a versão nova valer na próxima abertura
#   pnpm install:local --yes      reinicia sem perguntar
#   pnpm install:local --skip-build   instala o .deb que já está em release/
#
# Reiniciar fecha as abas abertas: os terminais pertencem ao processo do app.
set -euo pipefail

cd "$(dirname "$0")/.."

restart=ask
build=yes
for argument in "$@"; do
  case "$argument" in
    --no-restart) restart=no ;;
    --yes) restart=yes ;;
    --skip-build) build=no ;;
    *) echo "opção desconhecida: $argument" >&2; exit 64 ;;
  esac
done

INSTALL_DIR=/opt/dev-cockpit
BINARY="$INSTALL_DIR/dev-cockpit"

if [ "$build" = yes ]; then
  echo "==> Construindo o pacote"
  pnpm package
fi

package=$(ls -t release/dev-cockpit_*.deb 2>/dev/null | head -n 1 || true)
[ -n "$package" ] || { echo "nenhum .deb em release/: rode sem --skip-build" >&2; exit 1; }

# Só os processos do app instalado: o caminho do binário é distinto do de quem roda do repositório
running() { pgrep -f "^$BINARY" >/dev/null 2>&1; }

was_running=no
if running; then was_running=yes; fi

echo "==> Instalando $package"
# --reinstall permite trocar por uma versão de mesmo número durante o desenvolvimento
sudo apt-get install -y --reinstall "./$package"

if [ "$was_running" = no ]; then
  echo "==> Instalado. Abra o Dev Cockpit pelo menu de aplicativos ou com a sua tecla global."
  exit 0
fi

if [ "$restart" = no ]; then
  echo "==> Instalado. O cockpit em execução continua na versão anterior até ser reaberto."
  exit 0
fi

if [ "$restart" = ask ]; then
  echo "O cockpit está aberto. Reiniciar fecha as abas e os comandos que estão rodando nelas."
  read -r -p "Reiniciar agora? [s/N] " answer
  case "$answer" in s|S|sim|y|Y|yes) ;; *) echo "==> Instalado. A versão nova vale na próxima abertura."; exit 0 ;; esac
fi

echo "==> Reiniciando"
pkill -f "^$BINARY" || true
# Espera o app e o daemon terminarem, para o novo subir com o socket livre
for _ in $(seq 1 30); do running || break; sleep 0.2; done
nohup "$BINARY" --no-sandbox >/dev/null 2>&1 &
disown
echo "==> Pronto."
