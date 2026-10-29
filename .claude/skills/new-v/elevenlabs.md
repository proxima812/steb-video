# Озвучка ElevenLabs: v4 и v3

Обе модели рабочие. По умолчанию `eleven_v4`, `eleven_v3` - по выбору пользователя или если v4 не подошел (клон звучит иначе, endpoint не принимает модель). Старые ролики 4-6 озвучены на v3, их не переозвучиваем без запроса.

## Общее для v4 и v3

- `model_id` указывать всегда: без него Speech берет `eleven_multilingual_v2`, Dialogue - `eleven_v3`.
- `language_code: "ru"`.
- Audio tags одинаковые: на английском, в квадратных скобках, прямо перед фразой (`[sarcastic] Твой код опять работает только локально.`) или после нее для реакции (`Все работает. [sighs]`). Список открытый: `[curious]`, `[excited]`, `[mischievously]`, `[whispers]`, `[shouts]`, `[laughs]`, `[exhales]`, `[clears throat]`, `[short pause]`, `[long pause]`, `[measured]`, `[deep, cinematic]`, `[Quick, light, playful pace]`. Можно сочетать.
- Ремарка без скобок будет произнесена вслух. Тег иногда превращается в звук вместо подачи - формулируй направление голоса явно. Начинай с малого числа тегов.
- SSML (`<break time="1.5s"/>`) не работает. Паузы - тегами, многоточием (может дать неуверенность), пунктуацией. Точные паузы под монтаж - уже в аудио (ffmpeg).
- КАПС усиливает ударение - точечно.
- Числа, сокращения, символы заранее расписывай словами, как они должны прозвучать. Для сложных терминов - IPA внутри `/.../` (проверяй на голосе) или словари произношения (`pronunciation_dictionary_locators`, до трех).
- `seed` (0-4294967295) помогает повторить дубль, но не гарантирует.
- Формат: `mp3_44100_192` (Creator+) по умолчанию, `wav_48000` если тариф позволяет. PCM - сырые данные, не переименовывать в `.wav`.
- Тайминги: можно сразу `.../with-timestamps` (посимвольные `alignment`, время слова = начало первой буквы - конец последней; `normalized_alignment` - для текста после раскрытия чисел). Либо whisper/Forced Alignment по готовому файлу. После обрезки или вставки пауз тайминги пересчитать.

## v4 (`eleven_v4`)

- Лучше качество, эмоции и выполнение тегов. Клон точнее копирует исходник, поэтому голос может звучать иначе, чем на v3: при сомнениях сделай один и тот же абзац на обеих моделях и дай выбрать.
- Лимит каталога 10 000 символов, но держи запрос в пределах 2000 символов, длинный текст режь по абзацам и склеивай ffmpeg concat.
- Настройки: только `stability` (0.5; ниже - эмоциональнее) и similarity (0.75). **`speed` и `style` нет** - не передавай. Темп - тегами.
- Поле similarity: в Speech `voice_settings.similarity_boost`, в Dialogue `settings.similarity`.
- Endpoint: сначала Speech `POST /v1/text-to-speech/{voice_id}`. Если v4 там не принимается - `POST /v1/text-to-dialogue` с `{"inputs":[{"text":..., "voice_id":...}], "model_id":"eleven_v4", "settings":{"stability":0.5,"similarity":0.75}}`.
- `eleven_v4_turbo` - для живых диалогов, для роликов не используем.
- PVC-голоса может понадобиться дообучить под v4 (My Voices). Voice Design голоса бывают менее выразительными.

```
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_192
{"text": "...", "model_id": "eleven_v4", "language_code": "ru",
 "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}}
```
Файл: `ElevenLabs_<ISO-время>_Alex_v4.mp3`.

## v3 (`eleven_v3`)

- Лимит 5000 символов на запрос.
- Настройки как в роликах 4-6: speed 1.0, stability 0.5, similarity_boost 0.75.

```
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_192
{"text": "...", "model_id": "eleven_v3", "language_code": "ru",
 "voice_settings": {"stability": 0.5, "similarity_boost": 0.75, "speed": 1.0}}
```
Файл: `ElevenLabs_<ISO-время>_Alex_v3.mp3`.
