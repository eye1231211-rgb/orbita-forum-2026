"""Collect actual upstream notices; canonical document is stored in Obsidian."""
from pathlib import Path
import json, os, urllib.request

root=Path(__file__).resolve().parents[1]
vault=Path(r'C:\Users\serge\OneDrive\Desktop\Brain\01 Projects\Цифровой деканат')
parts=['---\ntags:\n  - Codex/generated\n  - проект/цифровой-деканат\ncreated: 2026-11-10\nsource: Codex\n---\n# Материалы и лицензии Орбиты\n\n[[Как создавалась Орбита]] · [[Запуск и устройство Орбиты]]\n\nДата проверки: 2026-11-10. В интерфейсе нет внешних изображений или логотипа вуза. Знак и орбиты созданы кодом. Интерфейс использует системные шрифты; PDF использует DejaVu Sans. Ниже сохранены исходные тексты лицензий основных распространяемых библиотек и шрифта. Полный набор зависимостей закреплён package-lock.json; лицензии остальных прямых пакетов перечислены из установленных package.json.\n']
for package in ['react','react-dom','lucide-react','vinext','vite']:
    directory=root/'node_modules'/package
    meta=json.loads((directory/'package.json').read_text('utf-8'))
    license_file=next(iter(sorted(directory.glob('LICENSE*'))),None)
    if not license_file:raise RuntimeError(f'Missing license: {package}')
    notice=license_file.read_text('utf-8')
    parts.append(f'\n## {package} {meta["version"]}\n\nЛицензия: {meta.get("license","см. текст")}. Источник: установленный npm-пакет, {package}/{license_file.name}.\n\n```text\n{notice}\n```\n')
for title,url in [
 ('Drizzle ORM - Apache 2.0','https://raw.githubusercontent.com/drizzle-team/drizzle-orm/main/LICENSE'),
 ('DejaVu fonts - исходная лицензия','https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/master/LICENSE')
]:
    request=urllib.request.Request(url,headers={'User-Agent':'Orbit-competition-notices/1.0'})
    with urllib.request.urlopen(request,timeout=30) as response:
        notice=response.read().decode('utf-8')
    parts.append(f'\n## {title}\n\nОфициальный источник: {url}\n\n```text\n{notice}\n```\n')
parts.append('\n## Прямые зависимости исходников\n\nПакет | Установленная версия | Объявленная лицензия\n---|---|---\n')
manifest=json.loads((root/'package.json').read_text('utf-8'))
for name in sorted(set(manifest.get('dependencies',{}))|set(manifest.get('devDependencies',{}))):
    package=root/'node_modules'/name/'package.json'
    if not package.exists():raise RuntimeError(f'Missing package metadata: {name}')
    meta=json.loads(package.read_text('utf-8'))
    parts.append(f'{name} | {meta.get("version","")} | {meta.get("license","Не объявлена - проверить отдельно")}\n')
parts.append('\n## Инструменты\n\nPython, ReportLab, Poppler, Wrangler и npm использованы как средства сборки и проверки. Их исполняемые файлы в комплект исходников не включаются. Изображения интерфейса - настоящие снимки собственного прототипа. Утверждение о полном юридическом аудите транзитивных зависимостей не делается.\n')
vault.mkdir(parents=True,exist_ok=True)
canonical=vault/'Материалы и лицензии Орбиты.md'
if canonical.exists() and 'source: Codex' not in canonical.read_text('utf-8')[:500]:raise RuntimeError('User note must not be overwritten')
canonical.write_text(''.join(parts),encoding='utf-8')
for relative in ['docs/THIRD_PARTY_NOTICES.md','public/third-party-notices.txt']:
    target=root/relative;target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists():
        if os.path.samefile(target,canonical):continue
        raise RuntimeError(f'Unexpected existing file: {target}')
    os.link(canonical,target)
print('Saved verified upstream notices and direct dependency inventory.')
