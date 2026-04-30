#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/Users/shypul/Documents/workspace/HDRezka}"
BUILD_DIR="${BUILD_DIR:-/tmp/HDRezka-tizen-build}"
SERVER_DIR="${SERVER_DIR:-$HOME/.tizen-extension-platform/server}"
CONN_FILE="$SERVER_DIR/conn.json"
SDB="${SDB:-$SERVER_DIR/sdktools/data/tools/sdb}"
TZ_CLI="${TZ_CLI:-$SERVER_DIR/sdktools/data/tools/tizen-core/tz}"
SIGN_PROFILE="${SIGN_PROFILE:-hdrezka_samsung}"

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
  require_file "$TZ_CLI"

  log "Готовлю чистую временную копию проекта"
  rm -rf "$BUILD_DIR"
  mkdir -p "$BUILD_DIR"
  rsync -a \
    --exclude='.git' \
    --exclude='Debug' \
    --exclude='*.wgt' \
    --exclude='.DS_Store' \
    --exclude='.idea' \
    --exclude='cache' \
    --exclude='deploy-tv.sh' \
    "$PROJECT_DIR/" "$BUILD_DIR/"

  log "Проверяю профиль подписи $SIGN_PROFILE"
  "$TZ_CLI" security-profiles list | grep -q "^$SIGN_PROFILE$" \
    || fail "Профиль подписи '$SIGN_PROFILE' не найден. Создай/выбери Samsung certificate profile в VS Code."

  log "Собираю проект через tz"
  "$TZ_CLI" build -w "$BUILD_DIR" -s "$SIGN_PROFILE" -b Debug

  log "Подписываю .wgt через tz"
  "$TZ_CLI" pack -w "$BUILD_DIR" -s "$SIGN_PROFILE" -t wgt

  local package_path
  package_path="$(find "$BUILD_DIR/Debug" -maxdepth 1 -type f -name '*.wgt' | head -n 1)"
  [[ -n "$package_path" ]] || fail "tz pack не создал .wgt в $BUILD_DIR/Debug"

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

  case "${1:-deploy}" in
    build)
      build_wgt
      log "Сборка готова без установки на TV"
      return
      ;;
    deploy)
      ;;
    *)
      fail "Неизвестная команда '$1'. Используй: $0 [build|deploy]"
      ;;
  esac

  ensure_tv_connected
  build_wgt
  install_and_run
  log "Готово"
}

main "$@"
