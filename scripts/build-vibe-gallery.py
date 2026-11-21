"""Готовит фотографии раздела «Вайб Плехановки».

Исходники — снимки автора проекта (папка задаётся аргументом, в коде путей нет).
Скрипт отбирает кадры по списку ниже, разворачивает их по EXIF-ориентации,
полностью удаляет метаданные (в том числе координаты съёмки), уменьшает до
двух размеров и складывает в public/vibe вместе с описью public/vibe-gallery.json.

Запуск:
    python scripts/build-vibe-gallery.py "<папка с исходниками>"

Повторный запуск перезаписывает файлы и опись: исходники не меняются.
Кадры с людьми собраны в тему «Люди»: согласие людей на снимках
подтвердил владелец проекта 15 ноября 2026 года.
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageOps

FULL = 1400       # длинная сторона большого кадра, px
THUMB = 560       # длинная сторона плитки, px
FULL_QUALITY = 72
THUMB_QUALITY = 68

# Подборка: номер исходного кадра -> раздел, подпись, имя файла.
PICKS = [
    (2, "vecher", "Главный корпус в подсветке", "glavnyi-korpus-vecherom"),
    (3, "vecher", "Колоннада под вечерним небом", "kolonnada-vecherom"),
    (1, "vecher", "Новый корпус после занятий", "novyi-korpus-vecherom"),
    (56, "vecher", "Фасад с вывеской РЭУ.РФ ночью", "fasad-noch"),
    (55, "vecher", "Золотые буквы на фасаде", "bukvy-fasad"),
    (59, "vecher", "Герб и название над входом", "gerb-nad-vhodom"),
    (13, "prazdniki", "Ёлка у главного корпуса", "elka-u-korpusa"),
    (14, "prazdniki", "Гирлянды и подсвеченный фасад", "girlyandy-fasad"),
    (29, "prazdniki", "Ёлка у входа в декабре", "elka-vhod"),
    (61, "prazdniki", "Первый снег во дворе", "pervyi-sneg"),
    (63, "prazdniki", "Новогодние огни на Стремянном", "novogodnie-ogni"),
    (37, "prazdniki", "120 лет университету", "120-let"),
    (31, "zal", "Исторический актовый зал", "aktovyi-zal"),
    (32, "zal", "Люстры и своды зала", "lyustry-zala"),
    (74, "zal", "Зал перед конференцией", "zal-pered-konferenciei"),
    (77, "zal", "Балконы и стеклянный пол", "balkony-zala"),
    (71, "zal", "Колонны и ряды столов", "kolonny-stoly"),
    (73, "zal", "Часы и герб под сводом", "chasy-i-gerb"),
    (16, "uchebnoe", "Пустая поточная аудитория", "potochnaya-auditoriya"),
    (12, "uchebnoe", "Полный зал на мероприятии", "polnyi-zal"),
    (27, "uchebnoe", "Сцена студенческого концерта", "scena-koncerta"),
    (34, "uchebnoe", "Спираль лестницы в атриуме", "spiral-lestnicy"),
    (38, "uchebnoe", "Шахматный пол во внутреннем дворе", "shahmatnyi-pol"),
    (64, "uchebnoe", "Холл нового корпуса", "holl-korpusa"),
    (67, "uchebnoe", "Переговорная с видом на город", "peregovornaya"),
    (66, "uchebnoe", "Защита курсовой в зале", "zashchita-kursovoi"),
    (60, "uchebnoe", "Курсовая работа и герб университета", "kursovaya-rabota"),
    (4, "dvor", "Футбольное поле во дворе", "futbolnoe-pole"),
    (5, "dvor", "Двор-колодец с полем", "dvor-kolodec"),
    (26, "dvor", "Баскетбольная площадка у корпуса", "basketbolnaya-ploshchadka"),
    (25, "dvor", "Аллея между корпусами", "alleya"),
    (21, "dvor", "Университетский сквер осенью", "skver-osenyu"),
    (51, "dvor", "Тень деревьев в парке", "ten-derevev"),
    (8, "fasady", "Колоннада днём", "kolonnada-dnem"),
    (9, "fasady", "Вывеска крупным планом", "vyveska-krupno"),
    (10, "fasady", "Корпус на фоне синего неба", "korpus-nebo"),
    (18, "fasady", "Исторический фасад с гербом", "istoricheskii-fasad"),
    (22, "fasady", "Вечерний свет в окнах", "svet-v-oknah"),
    (23, "fasady", "Колонны в сумерках", "kolonny-sumerki"),
    (33, "fasady", "«Университет талантливых людей»", "universitet-talantlivyh"),
    (35, "fasady", "Стеклянные ярусы нового корпуса", "steklyannye-yarusy"),
    (36, "fasady", "Переход между корпусами", "perehod-mezhdu-korpusami"),
    (17, "fasady", "Отражения в стекле", "otrazheniya-v-stekle"),
    (20, "fasady", "Цветная подсветка этажей", "cvetnaya-podsvetka"),
    (62, "fasady", "Старое здание с фонарями", "staroe-zdanie"),
    (68, "fasady", "Вывеска сквозь листву", "vyveska-skvoz-listvu"),
    (30, "detali", "Купол храма рядом с кампусом", "kupol-ryadom"),
    (72, "detali", "Храм у Стремянного переулка", "hram-u-stremyannogo"),
    (43, "detali", "Капитель колонны", "kapitel"),
    (44, "detali", "Линии корпуса крупным планом", "linii-korpusa"),
    (69, "detali", "Лепнина над окнами", "lepnina"),
    (53, "detali", "Указатель метро с названием университета", "ukazatel-metro"),
    (57, "detali", "Пролёт лестницы", "prolet-lestnicy"),
    (58, "detali", "Закат за окнами корпуса", "zakat-za-oknami"),
    (6, "detali", "Свет в окне поздним вечером", "svet-v-okne"),
    (39, "detali", "Жёлтый свет в коридоре", "zheltyi-svet"),
    (40, "detali", "Двери старого корпуса", "dveri-korpusa"),
    (52, "detali", "Корпус в чёрно-белом", "korpus-cherno-beloe"),
    (15, "lyudi", "Кофе перед парами", "kofe-pered-parami"),
    (70, "lyudi", "Выпускница в актовом зале", "vypusknica-v-zale"),
    (75, "lyudi", "Диплом в руках", "diplom-v-rukah"),
    (76, "lyudi", "У памятника в холле", "u-pamyatnika"),
    (78, "lyudi", "На балконе исторического зала", "na-balkone-zala"),
    (47, "lyudi", "Лестница между парами", "lestnica-mezhdu-parami"),
    (42, "lyudi", "Весна во дворе университета", "vesna-vo-dvore"),
    (45, "lyudi", "Портрет у перил", "portret-u-peril"),
    (46, "lyudi", "Портрет в тёплом свете", "portret-v-svete"),
    (48, "lyudi", "Отражение в стекле аудитории", "otrazhenie-v-stekle-auditorii"),
    (65, "lyudi", "Лекция из последнего ряда", "lekciya-iz-ryada"),
]

GROUPS = [
    ("vecher", "Вечерние корпуса"),
    ("fasady", "Фасады"),
    ("zal", "Исторический зал"),
    ("uchebnoe", "Учебные будни"),
    ("dvor", "Двор и спорт"),
    ("prazdniki", "Праздники"),
    ("detali", "Детали"),
    ("lyudi", "Люди"),
]


def sources(folder: Path) -> dict[int, Path]:
    found: dict[int, Path] = {}
    for path in folder.iterdir():
        match = re.fullmatch(r"photo_(\d+)_.*\.jpe?g", path.name, re.IGNORECASE)
        if match:
            found[int(match.group(1))] = path
    return found


def save(image: Image.Image, target: Path, longest: int, quality: int) -> tuple[int, int]:
    frame = image.copy()
    frame.thumbnail((longest, longest), Image.LANCZOS)
    # Сохраняем без профилей и EXIF: в метаданных телефона остаются координаты.
    frame.save(target, "WEBP", quality=quality, method=5)
    return frame.size


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    folder = Path(sys.argv[1]).expanduser()
    if not folder.is_dir():
        print(f"Папка не найдена: {folder}")
        return 2
    root = Path(__file__).resolve().parent.parent
    out = root / "public" / "vibe"
    out.mkdir(parents=True, exist_ok=True)
    available = sources(folder)

    photos = []
    missing = []
    for number, group, caption, name in PICKS:
        origin = available.get(number)
        if origin is None:
            missing.append(number)
            continue
        image = ImageOps.exif_transpose(Image.open(origin)).convert("RGB")
        wide = image.width >= image.height
        full_size = save(image, out / f"{name}.webp", FULL, FULL_QUALITY)
        save(image, out / f"{name}-thumb.webp", THUMB, THUMB_QUALITY)
        photos.append({
            "id": name,
            "group": group,
            "caption": caption,
            "width": full_size[0],
            "height": full_size[1],
            "shape": "wide" if wide else "tall",
        })

    manifest = {
        "title": "Вайб Плехановки",
        "note": "Съёмка автора проекта. Люди на снимках — с их согласия.",
        "groups": [{"id": key, "title": title} for key, title in GROUPS],
        "photos": photos,
    }
    (root / "public" / "vibe-gallery.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")

    weight = sum(path.stat().st_size for path in out.glob("*.webp"))
    print(f"кадров: {len(photos)}, файлов: {len(list(out.glob('*.webp')))}, вес: {weight / 1048576:.1f} МБ")
    if missing:
        print("не найдены исходники:", ", ".join(map(str, missing)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
