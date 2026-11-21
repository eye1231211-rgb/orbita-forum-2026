/* Подборка «Вайб Плехановки»: опись и файлы должны совпадать.
   Галерея читает public/vibe-gallery.json и подставляет пути к файлам, поэтому
   расхождение описи и папки видно только в браузере — этот тест ловит его раньше. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

test('опись подборки кампуса совпадает с файлами и разделами', () => {
  const album = JSON.parse(readFileSync('public/vibe-gallery.json', 'utf8'));
  const files = new Set(readdirSync('public/vibe'));
  const groups = new Set(album.groups.map(group => group.id));

  assert.ok(album.photos.length >= 40, 'подборка должна быть заметной');
  assert.match(album.note, /с их согласия/, 'в описи сказано, что люди на снимках дали согласие');

  const seen = new Set();
  for (const photo of album.photos) {
    assert.match(photo.id, /^[a-z0-9-]+$/, `имя кадра без лишних символов: ${photo.id}`);
    assert.equal(seen.has(photo.id), false, `кадр не повторяется: ${photo.id}`);
    seen.add(photo.id);
    assert.ok(files.has(`${photo.id}.webp`), `есть крупный кадр: ${photo.id}`);
    assert.ok(files.has(`${photo.id}-thumb.webp`), `есть плитка: ${photo.id}`);
    assert.ok(groups.has(photo.group), `раздел известен: ${photo.group}`);
    assert.ok(photo.caption.length > 5 && photo.caption.length < 80, `подпись по делу: ${photo.id}`);
    assert.ok(photo.width > 0 && photo.height > 0, `размеры заполнены: ${photo.id}`);
    assert.equal(photo.shape, photo.width >= photo.height ? 'wide' : 'tall', `форма совпадает с размерами: ${photo.id}`);
  }

  // Лишние файлы тоже ошибка: они попадут в сборку, но не покажутся студенту.
  for (const file of files) {
    const id = file.replace(/(-thumb)?\.webp$/, '');
    assert.ok(seen.has(id), `файл ${file} описан в подборке`);
  }
  // Каждый раздел должен быть непустым, иначе в фильтрах появится мёртвая кнопка.
  for (const group of album.groups) {
    assert.ok(album.photos.some(photo => photo.group === group.id), `в разделе «${group.title}» есть кадры`);
  }
});
