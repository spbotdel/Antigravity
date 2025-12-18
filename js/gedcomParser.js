export function parseGedcom(text) {
  const lines = text.split(/\r?\n/);

  const people = {};
  const families = {};

  let current = null;

  for (let line of lines) {
    if (!line.trim()) continue;

    const parts = line.split(' ');
    const level = parts[0];
    const tag = parts[1];
    const value = parts.slice(2).join(' ').replace(/@/g, '');

    // Новый объект
    if (level === '0' && tag.startsWith('I')) {
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
    }

    if (level === '0' && tag.startsWith('F')) {
      current = { type: 'FAM', id: tag };
      families[tag] = {
        id: tag,
        husband: null,
        wife: null,
        children: []
      };
      continue;
    }

    if (!current) continue;

    // --- PERSON ---
    if (current.type === 'INDI') {
      const p = people[current.id];

      if (tag === 'NAME') p.name = value.replace(/\//g, '');
      if (tag === 'SEX') p.gender = value;
      if (tag === 'BIRT') current.last = 'BIRT';
      if (tag === 'DEAT') current.last = 'DEAT';
      if (tag === 'DATE' && current.last === 'BIRT') p.birth = value;
      if (tag === 'DATE' && current.last === 'DEAT') p.death = value;
      if (tag === 'FAMS') p.familiesAsSpouse.push(value);
      if (tag === 'FAMC') p.familiesAsChild.push(value);
    }

    // --- FAMILY ---
    if (current.type === 'FAM') {
      const f = families[current.id];
      if (tag === 'HUSB') f.husband = value;
      if (tag === 'WIFE') f.wife = value;
      if (tag === 'CHIL') f.children.push(value);
    }
  }

  return { people, families };
}
