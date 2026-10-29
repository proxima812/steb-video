# Структура движка

- `runtime/` - сцены, анимация, камера, переходы и текст.
- `styles/` - оформление, шрифты и палитры.
- `components/` - готовые блоки и Three.js.
- `pipeline/` - сборка, рендер, кеш и общие инструменты.
- `audio/` - озвучка, тайминги слов и сведение звука.
- `checks/` - проверка сцен, планировки и рывков.
- `templates/` - шаблон нового ролика.
- `examples/` - демонстрации.

Команды запускаются из корня проекта, если явно не указано иное.
В корне `engine/` остаются конфигурация пакета, зависимости и эта документация.
Старые плоские пути удалены. В HTML ролика сохраняется `<base href="../../engine/">`;
ресурсы подключаются как `styles/p5-world.css`, `runtime/engine.js` и т.д.

# Сборка и проверка Reels

Зависимости уже используются движком: Node.js 22+, Chrome, FFmpeg и FFprobe.
Установка пакетов при первом запуске: `cd engine && bun install`.
Для объемной графики используется локальный `three@0.186.1` (фиксированная версия).

Команды из корня проекта:

```bash
# Проверка сцен и ресурсов, без рендера
node engine/pipeline/video.mjs 88 --check-only

# Быстрое превью одного интервала
node engine/pipeline/video.mjs 88 --preview --from 12 --to 18

# Превью всего ролика
node engine/pipeline/video.mjs 88 --preview

# Финальная сборка
node engine/pipeline/video.mjs 88

# Повторная сборка всех этапов
node engine/pipeline/video.mjs 88 --force
```

Из `engine/` доступны те же команды через `bun run video 88 ...`.
Номер ищет единственную папку `video/N-*`; вместо номера можно передать путь
к папке, включая папки коллабораций. Сцены и озвучка должны существовать:
конвейер автоматизирует техническую сборку после подготовки сценария и HTML.
Он не вызывает платную генерацию голоса и не переписывает сцены.

## Входные файлы

По умолчанию HTML: `video/N-slug/v.html` (в нем `<base href="../../engine/">`, ссылки на движок считаются от `engine/`). Голос: единственный файл
`ElevenLabs_*.mp3` или `*voice*` с расширением mp3/wav/m4a в папке ролика.
Музыка: единственный аудиофайл в `music/`. При неоднозначности команда
просит явно указать файл, вместо выбора случайного дубля.

```bash
node engine/pipeline/video.mjs 88 --page video/88-t3-orchestration/v.html --voice video/88-t3-orchestration/ElevenLabs_2026-10-22T10_47_15_Alex_v4.mp3 --music none
```

Для постоянных параметров можно сохранить `video.json` в папке ролика:

```json
{
  "page": "v.html",
  "voice": "voice.mp3",
  "music": "music/song.mp3",
  "duration": 60,
  "noSfx": true
}
```

Пути в конфиге считаются от папки ролика, в аргументах команды - от текущей
папки. Все поля необязательны. `music: "none"` отключает музыку;
`--no-sfx` отключает эффекты. Длительность по умолчанию: голос + 1.5 с.
Для коллабораций с более длинной концовкой задайте `duration`.
`words.json` используется, если уже существует; Whisper повторно не запускается.

## Скорость и проверки

Кадры снимаются параллельно: ролик режется по номерам кадров на куски (по умолчанию 4, не больше половины ядер,
`WORKERS=1..8` меняет число), каждый кусок снимает свой Chrome, куски склеиваются без перекодирования
(`pipeline/pipeline-steps.mjs`). Поэтому кадр с середины ролика обязан выглядеть так же, как при проигрывании подряд:
вся анимация от `render(t)`, без накопленного состояния. Перед первым кадром движок ждет все шрифты, включая
иконки `.mi`, которые рисуются через `::before`.

После проверки сцен конвейер запускает `checks/frame-layout.mjs` (нормы планировки) и проверку классов движка в стилях
ролика, после финальной сборки - `checks/motion-check.py` (рывки). Итог - строка `Checks: ...` в консоли и
`output/pipeline-review.md`. Нарушения этих норм - предупреждения, сборку не останавливают.

Тайминги слов для готовой озвучки без `words.json`: `python3 engine/audio/align.py video/N-slug`
(ElevenLabs Forced Alignment), после таймаута `audio/tts.py` - `python3 engine/audio/align.py video/N-slug --from-history`.

## Превью и повторные запуски

Верстка всегда считается в 1080x1920. Превью снимается в 540x960 при 15 fps,
финал - 1080x1920 при 30 fps. Начало и длина интервала округляются до кадров.
Превью не заменяет финальную проверку читаемости и анимации.

Результаты сохраняются раздельно:

- Финал: `output/video.mp4`, `output/cover.jpg`.
- Превью: `output/preview/video.mp4`.
- Превью интервала: `output/preview-12-18/video.mp4`.
- Интервал в финальном качестве: `output/clip-12-18/video.mp4`.

В каждом варианте сохраняется `silent.mp4`: видеоряд без звука.
Микс всего ролика хранится в `output/.pipeline/mix.wav` и используется всеми
вариантами. Изменение голоса или музыки пересобирает микс и MP4 без повторного
захвата кадров. Изменение HTML, CSS, JS, загруженных картинок или шрифтов
сбрасывает кеш видеоряда. Для звука учитываются cues и файлы библиотеки SFX.

Кеш проверяет содержимое входных и выходных файлов, а не только их даты.
Удаленный или поврежденный результат пересобирается. Успешные этапы сохраняются
после сбоя; следующий запуск продолжает сборку. `--force` игнорирует кеш.
Одновременные сборки одной папки блокируются, чтобы не смешивать результаты.

## Проверки и отчет

Общий валидатор проверяет интервалы сцен, safe zone, ошибки JavaScript,
загрузку ресурсов, порядок таймингов слов и количество слов `data-wd-times`.
Для пресета default добавляет предупреждения `p5gaps(1)`.

Границы контента проверяются через каждые 0.2 с и около переходов. Для текста
измеряются видимые строки, для карточек - весь прямоугольник. Стандартные
классы распознаются автоматически. Свой контейнер помечайте `data-safe`;
декор, который может выходить за safe zone, - `data-safe="ignore"`.
Если подходящих контейнеров нет, отчет предупреждает о неполном покрытии.
Геометрия проверяется по DOM, поэтому сложные маски, перекрытия и смысловые
ошибки требуют просмотра.

После сборки проверяются H.264/AAC, размеры, fps, число кадров, длительность
и пик громкости. Из самого MP4 извлекаются кадры около стыков и в моменты
`data-punch`. Автоматические файлы не заменяют авторское ревью:

- `pipeline-layout-check.json` - ошибки и предупреждения HTML.
- `pipeline-media-check.json` - параметры готового MP4.
- `pipeline-review/` - кадры из MP4.
- `pipeline-review.md` - объем проверки и соответствие кадров таймкодам.
- `pipeline-timings.json` - время этапов и попадания в кеш.
- `silent.mp4.render.json` - время вычисления сцены, захвата кадров и ожидания FFmpeg.

При `--from/--to` геометрия проверяется только в выбранном интервале.
Плавность, читаемость, наложения, совпадение с голосом и ducking проверяйте
просмотром и прослушиванием финального файла. Сценарий, визуальные шутки,
подпись и хештеги остаются частью `/new-v`.

## Переходы dissolve, defocus и whip, уход data-exit

`data-tr="whip"` - обе сцены едут вбок на ширину кадра за 0.6 с, горизонтальный смаз (SVG feGaussianBlur) пропорционален скорости; `data-wipe="right"` - в другую сторону. Не больше раза за ролик. Вход `data-a="blur"` - из размытия 8px со сдвигом 24px. Чат-пузыри `.chat`/`.bub.me|bot`/`.bub-who` - в `styles/p5-world.css`, там же набор компонентов (`.win`, `.tile`, `.kpi`, `.list`, `.tbl`, `.field`, `.seg`, `.btn`, `.tag`, `.kbd`, `.toast`, `.tog`, `.chk`, `.sep`), радиусы `--r`/`--r-in`/`--r-s` и стекло `.glass`; пример - `examples/components.html`.

В мире p5w кроме `down|up|dots|radial|grow|shrink|meme` есть `data-tr="dissolve"` (новая сцена проявляется
поверх старой, 0.9 с) и `data-tr="defocus"` (старая уходит в размытие, новая проявляется из размытия, 1.1 с).
Длительности всех переходов - таблица `TRD` в `runtime/preset-dynamic.js` (`window.P5TR.dur`, `P5TR.of(i)` - переход сцены i):
`down`/`up` 1.2 (вертикальный смаз по скорости до 10px, SVG `#p5vblur`), `dots` .9, `radial`/`grow`/`shrink` 1, `meme` 1.2, `dissolve` .9, `defocus` 1.1, `whip` .6.
Объект уходит мягко с `data-exit="t[,d]"`: прозрачность до 0 и подъем на 24px по smootherstep, все от `t`.
Старые ролики не меняются: новые имена раньше не использовались.

```bash
cd engine
node checks/transition-endpoints.mjs   # демонстрация examples/transitions-new.html: концы переходов, первый кадр, монотонность, нет scale, seek = проигрывание
```

## Готовые блоки пресета default

`components/p5-blocks.js` собирает сцены из данных. Пример с терминалом, сравнением
и графиком: `engine/examples/blocks-dynamic.html`. Старые ролики библиотека не меняет.
Она использует классы, цвета, шрифты и анимации существующего пресета;
отдельного CSS, сборки или новых пакетов нет.

В HTML подключите обычные стили 5P, затем создайте блоки **до** загрузки
анимационных скриптов и `init()`:

```html
<script src="components/p5-blocks.js"></script>
<script>
P5Blocks.mount([
  {
    type: 'terminal', theme: 'black', start: 0, end: 4,
    title: {text: 'Запускаем тесты', times: [0.1, 0.5]},
    lines: [
      {text: 'cargo test', at: 1, duration: 0.8},
      {text: '12 tests passed', at: 2, duration: 1, kind: 'result'}
    ]
  }
]);
</script>
<script src="runtime/engine.js"></script>
<script src="runtime/preset-dynamic.js"></script>
<script src="runtime/preset-minimal.js"></script>
<script>init(); render(0);</script>
```

Общие поля: `type`, `start`, `end`, `title: {text, times}`.
Необязательные: `theme` (black/white), `caption: {text, times}`.
Все таймкоды абсолютные, в секундах. `times` берите из `words.json`: ровно
один таймкод на слово. Библиотека не угадывает синхронизацию с голосом.
По умолчанию темы чередуются black/white.

- `terminal`: `lines` из 1-4 строк `{text, at, duration, kind?}`;
  `kind`: command/result/comment, `label` - подпись окна. Максимум 60 символов
  на строку. Печать детерминирована и работает при произвольной перемотке.
- `comparison`: ровно две `columns` с `{label, value, description, at}`.
  Максимальная длина label/value/description: 24/12/72 символа.
  Вторая колонка выделена акцентом темы.
- `chart`: 1-4 `bars` с `{label, value, at, duration}`, необязательные
  `max` и `unit`. Значения - целые числа 0..1e9. Для дробных величин выберите
  более мелкую единицу, например миллисекунды. Все полосы используют одну
  шкалу от нуля до `max`; автоматически это наибольшее значение, минимум 1.

Заголовок ограничен 48 символами, подпись - 70. Ограничения помогают сохранить
читаемость; длинные слова и плотную верстку все равно проверяйте валидатором.
После создания блоков можно добавлять свои HTML-сцены до загрузки пресетов.
Для генерации HTML вне браузера доступен `P5Blocks.render(specs)`; `mount`
вставляет тот же HTML в body или в переданный вторым аргументом контейнер.
Не вставляйте тайминговые section внутрь другой тайминговой section.

Пример без озвучки можно проверить и отрендерить из `engine/`:

```bash
PAGE=examples/blocks-dynamic.html DUR=12 OUT=blocks-demo/layout-check.json node checks/check.mjs
PAGE=examples/blocks-dynamic.html AUDIO=none DUR=12 PREVIEW=1 OUT=blocks-demo/preview.mp4 node pipeline/render.mjs
```

У примера демонстрационные тайминги, он не вызывает ElevenLabs. Для настоящего
ролика сохраните HTML как `video/N-slug/v.html` (с `<base href="../../engine/">`), подставьте голос и тайминги, затем используйте
`node engine/pipeline/video.mjs N`. Для нестандартной метафоры оставляйте свою HTML-сцену:
готовые блоки нужны для повторяющихся конструкций.

## Объемная графика на Three.js

Блоки `chart3d` и `layers3d` используют настоящий WebGL 2 через Three.js.
Пример: `engine/examples/blocks-three.html`. Пакет установлен локально; загрузки Three.js
с CDN при рендере нет. Общая верстка, заголовки, подписи и тайминги остаются
в HTML и пресете default. Поддерживаются те же темы black/white.

- `chart3d`: те же `bars`, `max`, `unit`, что у `chart`. Объемные столбцы растут
  на общей шкале, числа и легенда остаются четким HTML-текстом.
- `layers3d`: `layers` из 2-5 подписей (до 24 символов), `at` и `duration`.
  Плоская стопка плавно разделяется на уровни без вращений и отскоков.

Создайте сцены через `P5Blocks.mount`, подключите скрипты пресета и вызовите
`init()`. Затем подключите модуль:

```html
<script>
window.VIDEO_READY = import('./components/p5-three.mjs').then(async ({attachThree}) => {
  window.P5_THREE = await attachThree();
  render(0);
});
</script>
```

`attachThree()` вызывается один раз после создания сцен. Он готовит шейдеры
и подключает отрисовку к `p5hook`, сохраняя ранее установленный обработчик.
Анимация вычисляется только от `render(t)`: собственного requestAnimationFrame,
таймеров движения и случайной физики нет. `VIDEO_READY` ожидается общим
конвейером до проверки и захвата; тайм-аут готовности - 60 с.

Для освобождения ресурсов используется `P5_THREE.dispose()` (также при уходе
со страницы): геометрия, материалы и WebGL-контексты освобождаются. Сцены
без 3D не подключают модуль и не создают WebGL-контексты.

Команды из `engine/`:

```bash
PAGE=examples/blocks-three.html DUR=8 OUT=three-demo/layout-check.json node checks/check.mjs
PAGE=examples/blocks-three.html AUDIO=none DUR=8 PREVIEW=1 OUT=three-demo/preview.mp4 node pipeline/render.mjs
PAGE=examples/blocks-three.html AUDIO=none DUR=8 OUT=three-demo/demo.mp4 node pipeline/render.mjs
```

Пример использует демонстрационные данные и тайминги, озвучки нет. Для
нового ролика подставьте сценарий и `words.json`, сохраните страницу как
`video/N-slug/v.html` и запускайте обычный конвейер. Локальные JS-модули Three.js входят
в зависимости кеша, поэтому их изменение пересобирает видеоряд.

Для ручного просмотра HTML запускайте локальный HTTP-сервер из `engine/`:
`python3 -m http.server 8817 --bind 127.0.0.1`, затем откройте
`http://127.0.0.1:8817/examples/blocks-three.html`. Наш рендер работает и с file://
через существующий флаг Chrome; обычное двойное нажатие на HTML может
блокировать ES-модули. Требуется WebGL 2; ошибка его инициализации останавливает
сборку, чтобы не получить пустой 3D-кадр.

## Совместимость и диагностика

Старые команды продолжают работать из `engine/`:

```bash
PAGE=../video/88-t3-orchestration/v.html SP=../video/88-t3-orchestration/work/stills/s node pipeline/render.mjs stills 12 14
PAGE=../video/88-t3-orchestration/v.html AUDIO=../video/88-t3-orchestration/ElevenLabs_2026-10-22T10_47_15_Alex_v4.mp3 DUR=60 OUT=raw.mp4 node pipeline/render.mjs
PAGE=../video/88-t3-orchestration/v.html AUDIO=none DUR=60 PREVIEW=1 FROM=12 TO=18 OUT=preview.mp4 node pipeline/render.mjs
PAGE=../video/88-t3-orchestration/v.html DUR=60 WORDS=../video/88-t3-orchestration/words.json OUT=check.json node checks/check.mjs
```

`CHROME` задает путь к Chrome. `DISABLE_GPU=1` отключает GPU для диагностики.
`SETTLE_FRAMES=1` или `2` добавляет ожидание кадров браузера после установки
времени, если конкретной композиции это требуется. По умолчанию - 0.
Сравнивайте режимы на одинаковом интервале по `silent.mp4.render.json`.

Проверка инструментов без платных API и полного рендера:

```bash
cd engine
bun run test
```

## Роллер, курсор, перецентровка (p5-motion)

`runtime/p5-motion.js` подключается после `p5-lines.js`, до `engine.js` (есть в шаблоне). Все от `render(t)`, события попадают в `window.p5gaps()`. Пример: `examples/motion-demo.html`.

```bash
PAGE=examples/motion-demo.html AUDIO=none DUR=15 PREVIEW=1 OUT=motion-demo/preview.mp4 node pipeline/render.mjs
```

- `data-roll="t0,t1,to[,from]"` - слот-роллер числа: барабан на каждую цифру, smootherstep, вертикальный смаз по скорости (SVG feGaussianBlur), разряды встают слева направо, последний к t1. `class="roll cells"` - цифры в ячейках.
- `data-cur="ключ; ..."` у сцены - курсор. Ключ `t цель [click | drag #slot] [d]` или `t hide`; цель - `#id` (кончик стрелки правее и ниже центра) или `x,y`. Путь по дуге за d (.75 с, кривая камеры). Клик: пауза наведения .12 с, сжатие курсора до .92; цель получает `--hover`, `--press`, `--done` (плавно за .35 с), класс `.cur-done`. Drag: захват, перенос чипа свойством `translate` с тенью (`--lift`), слот `.cur-slot` до drop пунктирный и подсвечивается при подлете, после - `.cur-full`. Не совмещать с `data-float` на чипе.
- `data-link="#from[,t0[,d]]"` у карточки (несколько источников через пробел: `"#a #b #c"`) - пунктирная кривая (цвет `--mut`) от `#from` к карточке рисуется за d (.45 с) с t0 (по умолчанию `data-in` карточки минус .4). Цель ниже - кривая сверху вниз, сбоку - слева направо. Концы пересчитываются каждый кадр с учетом `data-grow`; SVG лежит под контентом сцены.
- `data-grow="y|x|xy"` у контейнера - перецентровка: видимые дети стоят по центру места всей группы, при появлении ребенка группа съезжает за .6 с (свойство `translate`). Время ребенка - `data-at`, `data-in` или самый ранний `data-in`/`data-t0` внутри.

## UI-компоненты (p5-ui)

`styles/p5-ui.css` - компоненты из внешних примеров с префиксом `.ui-<имя>`, адаптированные под p5w (цвета из переменных, без scale и filter на тексте). `components/p5-ui.js` - их анимация от времени кадра через `window.hook`: `data-press="t[,t2]"` задает `--lift` и `--press`. Оба файла есть в шаблоне; в старые `v.html` студия добавляет их при вставке. Карточки каталога - `studio/src/editor/catalog-ui.ts`.

## Scene IR и композиционная режиссура

Новый слой подключается явно и не мигрирует старые ролики. Контракт -
`components/p5-direction.d.ts`, реализация - `components/p5-direction.js`.
В HTML разместите JSON в `script#scene-direction[type="application/json"]` и обычную
разметку объектов с уникальными id. До всех анимационных скриптов:

```html
<script src="runtime/p5-camera.js"></script>
<script src="components/p5-direction.js"></script>
<script>
P5Direction.apply(JSON.parse(document.getElementById('scene-direction').textContent));
</script>
```

`apply` проверяет ссылки до изменения DOM, переносит времена и действия в существующие
`data-*`; `checkVideo` затем обнаруживает расхождение HTML с IR. `timing:"narration"`
требует wordIndex у каждого движения и words.json при проверке. `timing:"demo"`
явно обозначает тест без речевой синхронизации. Указание purpose обязательно, но его
смысл оценивает режиссер, а не валидатор.

Подключаемый отдельно `styles/scene-compositions.css` содержит пять компоновок:
hero, diagram, interface, data, cinematic. Оформление остается у стандартных
`.tile/.win/.field/.btn`; остальные семь названий composition - словарь ручной постановки.
`cameraFit:"safe"` включает solver, `data-camera-keep` защищает важный текст с id.
Решаются конечные положения, затем интерполируются; ограничение не обрывает путь
на середине. Проверяются также покрытие всего холста и существующие punch.

```bash
# Контракт до открытия браузера (второй аргумент для narration - words.json)
node engine/checks/scene-direction.mjs video/12-motion-direction-demo/v.html
# Unit + browser + pixel seek + покадровая камера
node --test engine/checks/tests/*.test.mjs
# Демо без голоса, через те же checker / parallel renderer / media checker
node video/12-motion-direction-demo/work/render.mjs
```

Демо: `video/12-motion-direction-demo/v.html`, результат `output/video.mp4` в его папке.
`work/build.py` воспроизводит демо из его авторского исходника; это не универсальный
генератор. Обычный `video.mjs N` сохраняет требование голосового файла.

Расширенный frame-layout пишет `quality`: камера на пути, контраст известных
непрозрачных поверхностей, мелкий и обрезанный текст. `contrastUnknown` означает,
что обои/стекло/фильтры требуют просмотра, а не что контраст прошел проверку.
Полная постановка и ограничения: `../output/design-system.md`, `motion-system.md`,
`camera-system.md`; аудит и результаты - `design-audit.md`, `visual-review.md` там же.
