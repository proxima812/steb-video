#!/bin/zsh
# Яндекс Браузер с портом отладки 9222 (только 127.0.0.1) для скила /post-v.
# Новые Chromium не открывают порт для основного профиля, поэтому отдельный профиль PostV:
# работает рядом с обычным браузером. Вход в Instagram берется из основного профиля (cookies копируются,
# пароль не нужен; ключ шифрования cookies общий у приложения Yandex в Связке ключей).
#   yandex-debug.sh          - открыть окно PostV, если порт еще не открыт
#   yandex-debug.sh --fresh  - закрыть окно PostV, заново скопировать вход из основного браузера и открыть
YA="$HOME/Library/Application Support/Yandex"
PROFILE="$YA/PostV"
MAIN="$YA/YandexBrowser/Default/Cookies"
port() { curl -s --max-time 1 http://127.0.0.1:9222/json/version >/dev/null; }

if [[ "$1" == "--fresh" ]]; then
  pkill -f "user-data-dir=$PROFILE" 2>/dev/null
  for i in {1..20}; do pgrep -f "user-data-dir=$PROFILE" >/dev/null || break; sleep 0.5; done
  [[ -f "$MAIN" ]] || { echo "нет cookies основного профиля: $MAIN"; exit 1; }
  mkdir -p "$PROFILE/Default"
  # .backup читает базу целиком даже при открытом основном браузере
  sqlite3 "file:$MAIN?immutable=1" ".backup '$PROFILE/Default/Cookies'" || { echo "не скопировал cookies"; exit 1; }
  rm -f "$PROFILE/Default/Cookies-journal"
  n=$(sqlite3 "$PROFILE/Default/Cookies" "select count(*) from cookies where host_key like '%instagram.com'")
  echo "вход перенесен из основного браузера (cookies instagram: $n)"
  [[ "$n" -gt 0 ]] || echo "в основном Яндекс Браузере нет входа в Instagram - войди там и повтори"
elif port; then echo "порт 9222 уже открыт"; exit 0; fi

mkdir -p "$PROFILE"
open -n -a Yandex --args --user-data-dir="$PROFILE" --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 --no-first-run "https://www.instagram.com/scheduled_content/"
for i in {1..30}; do port && { echo "готово: порт 9222 открыт"; exit 0; }; sleep 0.5; done
echo "порт не открылся"; exit 1
