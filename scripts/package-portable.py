"""Package the built Node/SQLite app without node_modules, credentials or databases."""
from pathlib import Path
import argparse
import subprocess
import tempfile
import zipfile

parser=argparse.ArgumentParser()
parser.add_argument('--output',required=True)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
output=Path(args.output).resolve()
client=root/'dist-portable/client'
if not (client/'index.html').is_file():
    raise SystemExit('Run npm run portable:build first.')
files=[]
for directory,pattern in [('dist-portable/client','**/*'),('lib','*.mjs'),('drizzle','*.sql'),('deploy','*')]:
    files.extend(p for p in (root/directory).glob(pattern) if p.is_file())
files.extend(root/p for p in [
    'public/reu-timetable.json',
    'public/reu-groups.json',
    'db/demo-data.json',
    'scripts/portable-server.mjs',
    'scripts/import-homework.mjs',
    'scripts/sqlite-adapter.mjs',
    '.dockerignore',
    'docs/DEPLOYMENT.md',
])
launch_cmd='@echo off\r\nsetlocal\r\npushd "%~dp0"\r\nnode scripts\\portable-server.mjs\r\nif errorlevel 1 pause\r\npopd\r\n'
launch_sh='#!/bin/sh\nset -eu\ncd "$(dirname "$0")"\nexec node scripts/portable-server.mjs\n'
output.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for path in sorted(set(files)):
        name=path.relative_to(root).as_posix()
        if any(part in {'node_modules','.git','data'} for part in path.relative_to(root).parts) or path.suffix in {'.sqlite','.pem'}:
            raise RuntimeError('Unsafe runtime file: '+name)
        archive.write(path,name)
    archive.writestr('start.cmd',launch_cmd)
    info=zipfile.ZipInfo('start.sh');info.external_attr=0o100755 << 16
    archive.writestr(info,launch_sh)
    archive.writestr('deploy/.env.example','ORBIT_DOMAIN=your-domain.example\n')
with zipfile.ZipFile(output) as archive:
    if archive.testzip():raise RuntimeError('Archive CRC failure')
    with tempfile.TemporaryDirectory(prefix='orbita-package-') as unpacked:
        archive.extractall(unpacked)
        subprocess.run(
            ['node', '--input-type=module', '-e', "await import('./scripts/portable-server.mjs')"],
            cwd=unpacked,
            check=True,
        )
    print(f'Portable runtime: {output} ({len(archive.namelist())} files, {output.stat().st_size} bytes)')
