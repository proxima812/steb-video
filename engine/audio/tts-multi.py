#!/usr/bin/env python3
"""Озвучка несколькими голосами: ElevenLabs v4 /with-timestamps по репликам -> один mp3 + words.json.
Запуск из корня: python3 engine/audio/tts-multi.py video/N-slug
Реплики: voices.json в папке ролика: {"voices": {"Alex": "<voice_id>", ...}, "gap": 0.3,
  "lines": [{"voice": "Alex", "text": "[deep] ..."}, ...]}
Каждая реплика - отдельный запрос (до 2000 символов). Куски склеиваются с паузой gap,
тайминги слов сдвигаются на начало куска. В words.json у слова 4-е поле - имя голоса."""
import json, sys, base64, os, urllib.request, datetime, subprocess, tempfile
d = sys.argv[1].rstrip('/')
key = os.environ.get('ELEVENLABS_API_KEY') or os.environ.get('ELEVENLABS_KEY')
if not key and os.path.isfile('.env'):
    with open('.env') as f:
        e = dict(l.strip().split('=', 1) for l in f if '=' in l and not l.lstrip().startswith('#'))
    key = (e.get('ELEVENLABS_API_KEY') or e.get('ELEVENLABS_KEY') or '').strip().strip('"\'')
if not key: sys.exit('Укажи ELEVENLABS_API_KEY или ELEVENLABS_KEY')
cfg = json.load(open(d + '/voices.json'))
gap = cfg.get('gap', 0.3)
tmp = tempfile.mkdtemp()
cache = d + '/tts-parts'; os.makedirs(cache, exist_ok=True)

def words_of(a, off):
    out = []; cur = ''; s = e = None; tag = False
    for c, a0, b0 in zip(a['characters'], a['character_start_times_seconds'], a['character_end_times_seconds']):
        if c == '[': tag = True
        if tag:
            if c == ']': tag = False
            continue
        if c.isspace():
            if cur: out.append([cur, round(s + off, 3), round(e + off, 3)]); cur = ''
            continue
        if not cur: s = a0
        cur += c; e = b0
    if cur: out.append([cur, round(s + off, 3), round(e + off, 3)])
    return out

words = []; files = []; off = 0.0
sil = f'{tmp}/sil.mp3'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', str(gap), '-b:a', '192k', sil], check=True)
for i, ln in enumerate(cfg['lines']):
    part = f'{cache}/{i:02d}-{ln["voice"]}.json'
    if not os.path.isfile(part):  # кеш: повторный запуск не тратит кредиты
        req = urllib.request.Request(
            'https://api.elevenlabs.io/v1/text-to-speech/' + cfg['voices'][ln['voice']] + '/with-timestamps?output_format=mp3_44100_192',
            data=json.dumps({"text": ln['text'], "model_id": "eleven_v4", "language_code": "ru",
                             "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}}).encode(),
            headers={'xi-api-key': key, 'Content-Type': 'application/json'})
        try: r = json.load(urllib.request.urlopen(req, timeout=600))
        except Exception as ex: sys.exit(f'реплика {i}: ElevenLabs не ответил ({ex}). Проверь /v1/history перед повтором')
        json.dump(r, open(part, 'w'))
    r = json.load(open(part))
    mp3 = f'{tmp}/{i:02d}.mp3'; open(mp3, 'wb').write(base64.b64decode(r['audio_base64']))
    dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3]))
    words += [w + [ln['voice']] for w in words_of(r['alignment'], off)]
    files += [mp3, sil]; off += dur + gap
lst = f'{tmp}/list.txt'
open(lst, 'w').write(''.join(f"file '{f}'\n" for f in files[:-1]))
out = f"{d}/ElevenLabs_{datetime.datetime.now():%Y-%m-%dT%H_%M_%S}_{'-'.join(cfg['voices'])}_v4.mp3"
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-ar', '44100', '-ac', '1', '-b:a', '192k', out], check=True)
json.dump(words, open(d + '/words.json', 'w'), ensure_ascii=False)
for w in words: print(f'{w[1]:6.2f} {w[3]:6} {w[0]}')
print('mp3:', out)
