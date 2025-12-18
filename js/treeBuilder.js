// treeBuilder.js - УПРОЩЕННАЯ РАБОЧАЯ ВЕРСИЯ
export function buildDescendantsTree(personId, data, visited = new Set()) {
  if (visited.has(personId)) {
    console.warn('Обнаружен цикл, пропускаем:', personId);
    return null;
  }

  visited.add(personId);

  const person = data.people[personId];
  if (!person) {
    console.warn('Человек не найден:', personId);
    return null;
  }

  const node = {
    id: person.id,
    name: person.name || 'Без имени',
    birth: person.birth || '',
    death: person.death || '',
    children: []
  };

  // Добавляем детей из семей, где человек является супругом
  if (person.familiesAsSpouse && person.familiesAsSpouse.length > 0) {
    for (const famId of person.familiesAsSpouse) {
      const family = data.families[famId];
      if (family && family.children) {
        for (const childId of family.children) {
          const childNode = buildDescendantsTree(childId, data, new Set(visited));
          if (childNode) {
            node.children.push(childNode);
          }
        }
      }
    }
  }

  return node;
}