export function buildDescendantsTree(personId, data, visited = new Set()) {
    if (visited.has(personId)) {
        console.warn("Обнаружен цикл для ID:", personId);
        return null;
    }
    visited.add(personId);

    const person = data.people[personId];
    if (!person) {
        console.warn("Не найден человек с ID:", personId);
        return null;
    }

    // Для отладки
    console.log("Обрабатываем:", personId, person.name);

    const node = {
        id: person.id,
        name: person.name || "Без имени",
        birth: person.birth,
        death: person.death,
        children: []
    };

    // Обрабатываем только первую семью для простоты
    if (person.familiesAsSpouse.length > 0) {
        const famId = person.familiesAsSpouse[0];
        const fam = data.families[famId];
        
        if (fam && fam.children) {
            console.log("Найдены дети в семье", famId, ":", fam.children);
            
            fam.children.forEach(childId => {
                const childNode = buildDescendantsTree(childId, data, visited);
                if (childNode) {
                    node.children.push(childNode);
                }
            });
        }
    } else {
        console.log("Нет семьи для", personId);
    }

    return node;
}