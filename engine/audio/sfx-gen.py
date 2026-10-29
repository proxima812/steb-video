#!/usr/bin/env python3
"""Мягкие звуки для пресета default: ElevenLabs Sound Effects (POST /v1/sound-generation) -> sfx/p5-*.mp3.
Запуск из корня проекта: python3 engine/audio/sfx-gen.py [имя ...]. Ключ ELEVENLABS_KEY в .env. Не больше 2 запросов параллельно.
Готовые файлы не перезаписываются (удали файл, чтобы сгенерировать заново).
Свой набор: python3 engine/audio/sfx-gen.py путь/sfx-prompts.json [имя ...] - {"имя": ["промпт", секунды]}, файлы в папку sfx/ рядом с json."""
import json,sys,os,urllib.request
from concurrent.futures import ThreadPoolExecutor
SOUNDS={
 'p5-whoosh':('Very soft airy whoosh for a smooth UI screen transition, gentle breath of air, clean, quiet, no bass, no impact',0.8),
 'p5-pop':('Soft gentle UI pop, warm muted bubble, short, quiet, pleasant, no click',0.5),
 'p5-tick':('Soft muted wooden tick, minimal premium UI click, gentle and short',0.5),
 'p5-chime':('Gentle soft marimba note, warm pleasant notification, single note, calm, short decay',1.2),
 'p5-thud':('Soft low muted thump, gentle deep impact, felt mallet on a cushion, calm, no distortion, no reverb tail',0.8),
 'p5-type':('Soft quiet laptop keyboard typing, a few gentle keystrokes, close and clean',1.5),
 'p5-error':('Soft gentle error tone, two low muted descending notes, calm UI alert, not harsh',0.9),
 'p5-swish':('Soft short pen swish, quick gentle stroke on paper, quiet',0.5),
}
key=[l.split('=',1)[1].strip() for l in open('.env') if l.startswith('ELEVENLABS_KEY=')][0]
OUT='sfx'
if len(sys.argv)>1 and sys.argv[1].endswith('.json'):
    SOUNDS={k:tuple(v) for k,v in json.load(open(sys.argv[1])).items()}
    OUT=os.path.join(os.path.dirname(sys.argv[1]),'sfx');sys.argv.pop(1)
def gen(n):
    out=f'{OUT}/{n}.mp3'
    if os.path.exists(out):return f'{n}: уже есть'
    text,d=SOUNDS[n]
    req=urllib.request.Request('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_192',
      data=json.dumps({'text':text,'duration_seconds':d,'prompt_influence':0.6}).encode(),
      headers={'xi-api-key':key,'Content-Type':'application/json'})
    try:open(out,'wb').write(urllib.request.urlopen(req,timeout=120).read());return f'{n}: ok'
    except Exception as e:return f'{n}: ошибка {e}'
names=sys.argv[1:] or list(SOUNDS)
with ThreadPoolExecutor(2) as ex:
    for r in ex.map(gen,names):print(r)
