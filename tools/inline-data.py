#!/usr/bin/env python3
"""Копирует data/teas.json внутрь index.html (нужно для открытия через file://).
Запуск из корня проекта: python3 tools/inline-data.py"""
import json, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
data = json.loads((root / 'data/teas.json').read_text(encoding='utf-8'))
compact = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
html_path = root / 'index.html'
html = html_path.read_text(encoding='utf-8')
new, n = re.subn(r'(<script type="application/json" id="teas-data">)(.*?)(</script>)',
                 lambda m: m.group(1) + compact + m.group(3), html, flags=re.S)
assert n == 1, 'не найден блок teas-data'
html_path.write_text(new, encoding='utf-8')
print('teas.json встроен в index.html')
