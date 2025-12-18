export function parseGedcom(text) {
  const lines = text.split(/\r?\n/);
  const people = {};
  const families = {};
  let current = null;
  let lastTag = null;

  for (let line of lines) {
    if (!line.trim()) continue;

    const match = line.match(/^(\d+)\s+(@?)(\S+)(@?)(?:\s+(.+))?$/);
    if (!match) continue;

    const level = parseInt(match[1]);
    const tag = match[3]; // Берем тег без @
    const value = match[5] || '';

    // Очищаем ID от всех символов @
    const cleanValue = value.replace(/@/g, '');

    // Новый объект (INDI или FAM)
    if (level === 0) {
      lastTag = null;
      
      // Проверяем, начинается ли тег с I (человек) или F (семья)
      if (tag && (tag.startsWith('I') || tag.startsWith('@I'))) {
        // Извлекаем чистый ID (без @)
        const cleanId = tag.replace(/@/g, '');
        current = { type: 'INDI', id: cleanId };
        people[cleanId] = {
          id: cleanId,
          name: '',
          gender: '',
          birth: '',
          death: '',
          familiesAsSpouse: [],
          familiesAsChild: []
        };
        continue;
      } else if (tag && (tag.startsWith('F') || tag.startsWith('@F'))) {
        const cleanId = tag.replace(/@/g, '');
        current = { type: 'FAM', id: cleanId };
        families[cleanId] = {
          id: cleanId,
          husband: null,
          wife: null,
          children: []
        };
        continue;
      }
    }

    if (!current) continue;

    // --- PERSON ---
    if (current.type === 'INDI') {
      const p = people[current.id];

      if (tag === 'NAME') {
        p.name = cleanValue.replace(/\//g, '').trim();
      } else if (tag === 'SEX') {
        p.gender = cleanValue;
      } else if (tag === 'BIRT' || tag === 'DEAT') {
        lastTag = tag;
      } else if (tag === 'DATE' && lastTag) {
        if (lastTag === 'BIRT') p.birth = cleanValue;
        if (lastTag === 'DEAT') p.death = cleanValue;
        lastTag = null;
      } else if (tag === 'FAMS') {
        const cleanFamId = cleanValue;
        if (cleanFamId) p.familiesAsSpouse.push(cleanFamId);
      } else if (tag === 'FAMC') {
        const cleanFamId = cleanValue;
        if (cleanFamId) p.familiesAsChild.push(cleanFamId);
      }
    }

    // --- FAMILY ---
    if (current.type === 'FAM') {
      const f = families[current.id];
      if (tag === 'HUSB') {
        const cleanPersonId = cleanValue;
        if (cleanPersonId) f.husband = cleanPersonId;
      } else if (tag === 'WIFE') {
        const cleanPersonId = cleanValue;
        if (cleanPersonId) f.wife = cleanPersonId;
      } else if (tag === 'CHIL') {
        const cleanPersonId = cleanValue;
        if (cleanPersonId) f.children.push(cleanPersonId);
      }
    }
  }

  // Дополнительная проверка связей
  console.log("Парсинг завершен. Статистика:");
  console.log("- Уникальных людей:", Object.keys(people).length);
  console.log("- Уникальных семей:", Object.keys(families).length);
  
  // Проверяем несколько случайных записей
  const sampleIds = Object.keys(people).slice(0, 3);
  sampleIds.forEach(id => {
    const p = people[id];
    console.log(`Пример ${id}: "${p.name}", семьи: ${p.familiesAsSpouse.length}`);
  });

  return { people, families };
}