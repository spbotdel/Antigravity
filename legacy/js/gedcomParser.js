// js/gedcomParser.js - Минимальная рабочая версия
export function parseGedcom(text) {
  const people = {};
  const families = {};
  let current = null;
  let inEvent = false;
  let currentEvent = null;

  const lines = text.split(/\r?\n/);

  for (let line of lines) {
    if (!line.trim()) continue;

    const match = line.match(/^\s*(\d+)\s+(@?[A-Za-z0-9_]+@?)(?:\s+(.+))?$/);
    if (!match) continue;

    const level = parseInt(match[1], 10);
    let tag = match[2];
    const value = match[3] || '';

    // Убираем @ из ID
    if (tag.startsWith('@') && tag.endsWith('@')) {
      tag = tag.slice(1, -1);
    }
    const cleanValue = value.replace(/@/g, '');

    // Обработка уровня 0
    if (level === 0) {
      inEvent = false;
      currentEvent = null;

      if (tag.startsWith('I')) {
        current = { type: 'INDI', id: tag };
        people[tag] = {
          id: tag,
          name: '',
          gender: '',
          birth: '',
          death: '',
          familiesAsSpouse: [],
          familiesAsChild: []
        };
        continue;
      } else if (tag.startsWith('F')) {
        current = { type: 'FAM', id: tag };
        families[tag] = {
          id: tag,
          husband: null,
          wife: null,
          children: []
        };
        continue;
      } else {
        current = null;
        continue;
      }
    }

    if (!current) continue;

    // Обработка INDI
    if (current.type === 'INDI') {
      const p = people[current.id];

      if (tag === 'NAME') {
        p.name = cleanValue.replace(/\//g, ' ').trim();
      } else if (tag === 'SEX') {
        p.gender = cleanValue;
      } else if (tag === 'BIRT' || tag === 'DEAT') {
        inEvent = true;
        currentEvent = tag;
      } else if (tag === 'DATE' && inEvent && currentEvent) {
        if (currentEvent === 'BIRT') p.birth = cleanValue;
        if (currentEvent === 'DEAT') p.death = cleanValue;
        inEvent = false;
        currentEvent = null;
      } else if (tag === 'FAMS') {
        if (cleanValue) p.familiesAsSpouse.push(cleanValue);
      } else if (tag === 'FAMC') {
        if (cleanValue) p.familiesAsChild.push(cleanValue);
      }
    }

    // Обработка FAM
    else if (current.type === 'FAM') {
      const f = families[current.id];

      if (tag === 'HUSB') f.husband = cleanValue;
      else if (tag === 'WIFE') f.wife = cleanValue;
      else if (tag === 'CHIL') f.children.push(cleanValue);
    }
  }

  console.log('Парсинг завершен:', Object.keys(people).length, 'людей,', Object.keys(families).length, 'семей');
  return { people, families };
}