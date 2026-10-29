#!/usr/bin/env python3
"""Тайминги слов для готовой озвучки: ElevenLabs Forced Alignment (аудио + известный текст) -> words.json.
Быстрее и точнее whisper: текст не распознается заново, а только раскладывается по времени.
Запуск из корня проекта:
  python3 engine/audio/align.py video/N-slug                  # озвучка ElevenLabs_*.mp3 / *voice*.mp3 из папки ролика
  python3 engine/audio/align.py video/N-slug path/to/voice.mp3
  python3 engine/audio/align.py video/N-slug --from-history   # audio/tts.py упал по таймауту: скачать последнюю генерацию
                                                        # этого текста из истории (бесплатно) и снять тайминги
Ключ: ELEVENLABS_API_KEY или ELEVENLABS_KEY в окружении или .env. Текст: субтитры.txt без [тегов]."""
import json, sys, re, os, glob, uuid, datetime, urllib.request, urllib.parse

API = 'https://api.elevenlabs.io/v1'

def api_key():
    key = os.environ.get('ELEVENLABS_API_KEY') or os.environ.get('ELEVENLABS_KEY')
    if not key and os.path.isfile('.env'):
        with open('.env') as env_file:
            entries = dict(line.strip().split('=', 1) for line in env_file if '=' in line and not line.lstrip().startswith('#'))
        key = (entries.get('ELEVENLABS_API_KEY') or entries.get('ELEVENLABS_KEY') or '').strip().strip('"\'')
    if not key: sys.exit('Укажи ELEVENLABS_API_KEY или ELEVENLABS_KEY в окружении или .env')
    return key

def plain(text):
    """Текст, который звучит: без [тегов] ElevenLabs и лишних пробелов."""
    return re.sub(r'\s+', ' ', re.sub(r'\[[^\]]*\]', ' ', text)).strip()

def words_from_alignment(response):
    return [[w['text'].strip(), round(w['start'], 3), round(w['end'], 3)] for w in response['words'] if w['text'].strip()]

def request(url, key, data=None, headers=None, timeout=120):
    req = urllib.request.Request(url, data=data, headers={'xi-api-key': key, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r: return r.read()

def from_history(folder, key, script):
    items = json.loads(request(f'{API}/history?page_size=20&source=TTS', key))['history']
    target = plain(script)
    for item in items:
        if plain(item.get('text', '')) == target:
            when = datetime.datetime.fromtimestamp(item['date_unix'])
            mp3 = f"{folder}/ElevenLabs_{when:%Y-%m-%dT%H_%M_%S}_{item.get('voice_name', 'voice').split(' ')[0]}_history.mp3"
            open(mp3, 'wb').write(request(f"{API}/history/{item['history_item_id']}/audio", key))
            print('скачано из истории:', mp3)
            return mp3
    sys.exit('В последних 20 генерациях нет этого текста: озвучка не создавалась, запускай audio/tts.py заново')

def find_voice(folder):
    files = [f for f in glob.glob(f'{folder}/*') if re.search(r'/(ElevenLabs_[^/]*|[^/]*voice[^/]*)\.(mp3|wav|m4a)$', f, re.I)]
    if len(files) != 1: sys.exit(f'Озвучек в папке: {len(files)}. Укажи файл вторым аргументом')
    return files[0]

def align(voice, text, key):
    boundary = uuid.uuid4().hex
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="text"\r\n\r\n{text}\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{os.path.basename(voice)}"\r\n'
            f'Content-Type: application/octet-stream\r\n\r\n').encode() + open(voice, 'rb').read() + f'\r\n--{boundary}--\r\n'.encode()
    return json.loads(request(f'{API}/forced-alignment', key, body, {'Content-Type': f'multipart/form-data; boundary={boundary}'}, timeout=300))

def main(argv):
    if not argv or argv[0].startswith('-'): sys.exit(__doc__)
    folder = argv[0].rstrip('/')
    script = open(f'{folder}/субтитры.txt').read()
    key = api_key()
    voice = from_history(folder, key, script) if '--from-history' in argv else (argv[1] if len(argv) > 1 else find_voice(folder))
    response = align(voice, plain(script), key)
    words = words_from_alignment(response)
    json.dump(words, open(f'{folder}/words.json', 'w'), ensure_ascii=False)
    print(f"слов {len(words)}, средняя ошибка выравнивания {response.get('loss', 0):.3f}")
    for w in words[:5]: print(f'{w[1]:6.2f} {w[0]}')
    print('words.json:', f'{folder}/words.json')

if __name__ == '__main__': main(sys.argv[1:])
