export function parseGedcom(text) {
    const lines = text.split(/\r?\n/);
    const people = {};
    const families = {};
    let current = null;
    let lastTag = null;

    for (let line of lines) {
        if (!line.trim()) continue;

        const match = line.match(/^(\d+)\s+(\S+)(?:\s+(.+))?$/);
        if (!match) continue;

        const level = parseInt(match[1]);
        const tag = match[2];
        const value = match[3] || '';

        // Очистка ID от символов @
        const cleanValue = value.replace(/@/g, '');

        // Новый объект
        if (level === 0) {
            lastTag = null;
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
                p.familiesAsSpouse.push(cleanValue);
            } else if (tag === 'FAMC') {
                p.familiesAsChild.push(cleanValue);
            }
        }

        // --- FAMILY ---
        if (current.type === 'FAM') {
            const f = families[current.id];
            if (tag === 'HUSB') {
                f.husband = cleanValue;
            } else if (tag === 'WIFE') {
                f.wife = cleanValue;
            } else if (tag === 'CHIL') {
                f.children.push(cleanValue);
            }
        }
    }

    return { people, families };
}