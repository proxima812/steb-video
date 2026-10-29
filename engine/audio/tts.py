#!/usr/bin/env python3
"""Озвучка: ElevenLabs v4 /with-timestamps -> mp3 + words.json (тайминги слов без [тегов]).
Запуск из корня проекта: python3 engine/audio/tts.py video/N-slug
Ключ: ELEVENLABS_API_KEY или ELEVENLABS_KEY в окружении или .env. Голос Alex (как в ролике 1), другой - VOICE_ID=.. VOICE_NAME=.. Текст: субтитры.txt в папке ролика (до 2000 символов)."""
import json,sys,re,base64,os,urllib.request,datetime
d=sys.argv[1].rstrip('/')
key=os.environ.get('ELEVENLABS_API_KEY') or os.environ.get('ELEVENLABS_KEY')
if not key and os.path.isfile('.env'):
    with open('.env') as env_file:
        entries=dict(line.strip().split('=',1) for line in env_file if '=' in line and not line.lstrip().startswith('#'))
    key=entries.get('ELEVENLABS_API_KEY') or entries.get('ELEVENLABS_KEY')
    if key:key=key.strip().strip('"\'')
if not key:sys.exit('Укажи ELEVENLABS_API_KEY или ELEVENLABS_KEY в окружении или .env')
text=re.sub(r'\n{2,}','\n\n',open(d+'/субтитры.txt').read().strip())
if len(text)>2000:sys.exit('текст > 2000 символов: режь на части')
req=urllib.request.Request('https://api.elevenlabs.io/v1/text-to-speech/'+os.environ.get('VOICE_ID','yl2ZDV1MzN4HbQJbMihG')+'/with-timestamps?output_format=mp3_44100_192',
  data=json.dumps({"text":text,"model_id":"eleven_v4","language_code":"ru","voice_settings":{"stability":0.5,"similarity_boost":0.75}}).encode(),
  headers={'xi-api-key':key,'Content-Type':'application/json'})
try:r=json.load(urllib.request.urlopen(req,timeout=600))
except Exception as ex:
    # ответ мог не дойти, а генерация на сервере прошла и списала кредиты. НЕ повторять запрос:
    # audio/align.py --from-history скачает аудио из истории (бесплатно) и снимет тайминги без whisper
    sys.exit(f'ElevenLabs не ответил ({ex}). Не повторяй запрос: python3 engine/audio/align.py {d} --from-history')
mp3=f"{d}/ElevenLabs_{datetime.datetime.now():%Y-%m-%dT%H_%M_%S}_{os.environ.get('VOICE_NAME','Alex')}_v4.mp3"
open(mp3,'wb').write(base64.b64decode(r['audio_base64']))
a=r['alignment'];words=[];cur='';s=e=None;tag=False
for c,a0,b0 in zip(a['characters'],a['character_start_times_seconds'],a['character_end_times_seconds']):
    if c=='[':tag=True
    if tag:
        if c==']':tag=False
        continue
    if c.isspace():
        if cur:words.append((cur,s,e));cur=''
        continue
    if not cur:s=a0
    cur+=c;e=b0
if cur:words.append((cur,s,e))
json.dump(words,open(d+'/words.json','w'),ensure_ascii=False)
for w in words:print(f"{w[1]:6.2f} {w[0]}")
print('mp3:',mp3)
