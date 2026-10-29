#!/usr/bin/env python3
"""Покадровая проверка плавности готового MP4: ищет одиночные скачки кадра (рывки, вспышки, «выпрыгивающие» элементы).
Запуск: python3 engine/checks/motion-check.py video/N-slug/output/video.mp4
Для каждого кадра считается средняя разница с предыдущим (180x320, серый). Рывок - кадр, где разница
больше 0.6 и в 3 раза выше медианы соседних 12 кадров. Плавная шторка дает «колокол» на 0.6-0.9 с, рывок - одиночный пик.
Норма: 0-2 пика на ролик (например, допечатанная строка). Каждый пик посмотреть кадрами и объяснить в review.md."""
import sys, subprocess, numpy as np
src = sys.argv[1]; W, H = 180, 320
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-vf', f'scale={W}:{H},format=gray', '-f', 'rawvideo', '-'], capture_output=True).stdout
f = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.int16)
d = np.abs(np.diff(f, axis=0)).mean(axis=(1, 2))
peaks = []
for i in range(len(d)):
    ctx = np.concatenate([d[max(0, i - 6):i], d[i + 1:i + 7]]); base = np.median(ctx) if len(ctx) else 0
    if d[i] > .6 and d[i] > 3 * base + .3: peaks.append(((i + 1) / 30, float(d[i]), float(base)))
fast = [(i + 1) / 30 for i in range(1, len(d) - 1) if d[i] > 40]   # почти весь кадр сменился за 1/30 с - слишком быстрая смена сцены
print(f'кадров {len(f)}, рывков {len(peaks)}, слишком резких смен {len(fast)}')
for t, v, b in peaks: print(f'  рывок {t:7.3f} c  разница {v:5.2f}  фон {b:4.2f}')
for t in fast: print(f'  резкая смена {t:7.3f} c')
sys.exit(1 if len(peaks) > 2 or fast else 0)
