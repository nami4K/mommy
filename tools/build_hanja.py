#!/usr/bin/env python3
"""한자 음 → 한자·훈음 자료 만들기.

원본: libhangul 한자 사전 hanja.txt (Copyright (c) 2005,2006 Choe Hwanjin, BSD-3)
  Debian/Ubuntu 패키지 libhangul-data의 /usr/share/libhangul/hanja/hanja.txt
사용법: python3 tools/build_hanja.py /path/to/hanja.txt > data/hanja.json

한 글자 항목("음:한자:훈음")만 쓰고, 음마다 앞에서부터 TOP개(사전 순서 = 자주 쓰는 순)를 남깁니다.
"""
import json
import sys

TOP = 20


def main(path):
    by_read = {}
    for line in open(path, encoding="utf-8"):
        if line.startswith("#"):
            continue
        parts = line.rstrip("\n").split(":")
        if len(parts) < 3:
            continue
        reading, hanja, hun = parts[0], parts[1], ":".join(parts[2:]).strip()
        if len(reading) == 1 and len(hanja) == 1 and hun:
            lst = by_read.setdefault(reading, [])
            if len(lst) < TOP and all(h != hanja for h, _ in lst):
                lst.append([hanja, hun])
    out = {
        "_source": "libhangul hanja.txt, Copyright (c) 2005,2006 Choe Hwanjin, BSD-3-Clause (data/LICENSE-libhangul-hanja.txt)",
        "r": by_read,
    }
    json.dump(out, sys.stdout, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main(sys.argv[1])
