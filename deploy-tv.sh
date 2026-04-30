#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/Users/shypul/Documents/workspace/HDRezka}"
BUILD_DIR="${BUILD_DIR:-/tmp/HDRezka-tizen-build}"
SERVER_DIR="${SERVER_DIR:-$HOME/.tizen-extension-platform/server}"
CONN_FILE="$SERVER_DIR/conn.json"
SDB="${SDB:-$SERVER_DIR/sdktools/data/tools/sdb}"

DEVICE_IP="${DEVICE_IP:-10.0.0.241}"
DEVICE="${DEVICE:-$DEVICE_IP:26101}"
APPID="${APPID:-8YVtxGKgrM.HDRezka}"
TMP_DIR="${TMP_DIR:-/home/owner/share/tmp/sdk_tools/tmp/}"
WGT="$PROJECT_DIR/HDRezka.wgt"

log() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf '\nERROR: %s\n' "$1" >&2
  exit 1
}

require_file() {
  [[ -e "$1" ]] || fail "Не найден файл: $1"
}

json_value() {
  python3 - "$1" "$2" <<'PY'
import json
import sys

path, key = sys.argv[1], sys.argv[2]
with open(path, "r", encoding="utf-8") as f:
    print(json.load(f)[key])
PY
}

server_port() {
  json_value "$CONN_FILE" port
}

server_token() {
  json_value "$CONN_FILE" token
}

tizen_api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local port token

  port="$(server_port)"
  token="$(server_token)"

  if [[ -n "$body" ]]; then
    curl -sS -X "$method" \
      -H "Authorization: Bearer $token" \
      -H 'Content-Type: application/json' \
      -d "$body" \
      "http://127.0.0.1:$port$path"
  else
    curl -sS -X "$method" \
      -H "Authorization: Bearer $token" \
      "http://127.0.0.1:$port$path"
  fi
}

server_is_healthy() {
  [[ -f "$CONN_FILE" ]] || return 1
  local port token
  port="$(server_port)"
  token="$(server_token)"
  curl -fsS -H "Authorization: Bearer $token" \
    "http://127.0.0.1:$port/api/v1/health" >/dev/null 2>&1
}

ensure_tizen_server() {
  require_file "$SERVER_DIR/run.sh"

  if server_is_healthy; then
    log "Tizen server уже запущен"
    return
  fi

  log "Запускаю Tizen server"
  nohup env TIZEN_SERVER_PORT=0 "$SERVER_DIR/run.sh" \
    >/tmp/hdrezka-tizen-server.log 2>&1 &

  for _ in {1..40}; do
    if server_is_healthy; then
      log "Tizen server готов"
      return
    fi
    sleep 1
  done

  fail "Tizen server не запустился. Лог: /tmp/hdrezka-tizen-server.log"
}

ensure_tv_connected() {
  require_file "$SDB"

  log "Проверяю подключение к телевизору $DEVICE"
  "$SDB" connect "$DEVICE_IP" >/dev/null 2>&1 || true

  if ! "$SDB" devices | grep -q "$DEVICE"; then
    "$SDB" devices
    fail "Телевизор не подключен. Проверь Developer Mode, IP телевизора и одну Wi-Fi сеть."
  fi
}

reconnect_tv() {
  "$SDB" connect "$DEVICE_IP" >/dev/null 2>&1 || true
}

build_wgt() {
  log "Готовлю чистую временную копию проекта"
  rm -rf "$BUILD_DIR"
  mkdir -p "$BUILD_DIR"
  rsync -a \
    --exclude='.git' \
    --exclude='Debug' \
    --exclude='*.wgt' \
    --exclude='.DS_Store' \
    "$PROJECT_DIR/" "$BUILD_DIR/"

  log "Собираю и подписываю .wgt"
  local response response_file package_path
  response="$(tizen_api POST /api/v1/project/build "{\"projectDir\":\"$BUILD_DIR\"}")"
  response_file="$(mktemp)"
  printf '%s' "$response" > "$response_file"
  package_path="$(python3 - "$response_file" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as f:
    data = json.load(f)
if data.get("status") != "success":
    raise SystemExit(data.get("message", "Build failed"))
print(data["packagePath"])
PY
)"
  rm -f "$response_file"

  cp "$package_path" "$WGT"
  log "Готов пакет: $WGT"
}

install_and_run() {
  log "Устанавливаю приложение на телевизор"
  if ! "$SDB" -s "$DEVICE" push "$WGT" "$TMP_DIR"; then
    log "Соединение с TV сбросилось, переподключаюсь"
    reconnect_tv
    "$SDB" -s "$DEVICE" push "$WGT" "$TMP_DIR"
  fi
  "$SDB" -s "$DEVICE" shell 0 vd_appuninstall "$APPID" >/dev/null 2>&1 || true
  "$SDB" -s "$DEVICE" shell 0 vd_appinstall "$APPID" "${TMP_DIR}$(basename "$WGT")"

  log "Запускаю приложение"
  "$SDB" -s "$DEVICE" shell 0 execute "$APPID"
}

main() {
  require_file "$PROJECT_DIR/config.xml"
  ensure_tizen_server
  ensure_tv_connected
  build_wgt
  install_and_run
  log "Готово"
}

main "$@"
