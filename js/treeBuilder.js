export function buildDescendantsTree(personId, data, visited = new Set(), familyLine = 0) {
  if (visited.has(personId)) return null;
  visited.add(personId);

  const person = data.people[personId];
  if (!person) return null;

  const node = {
    id: person.id,
    name: person.name || "Без имени",
    birth: person.birth,
    death: person.death,
    familyLine: familyLine, // Добавляем номер семейной линии
    children: []
  };

  // Определяем семейную линию для детей
  let childLine = familyLine;

  person.familiesAsSpouse.forEach((famId, index) => {
    const fam = data.families[famId];
    if (!fam) return;

    // Для каждой новой семьи создаем новую подлинию
    const subLine = familyLine * 10 + index + 1;

    fam.children.forEach((childId, childIndex) => {
      // Каждый ребенок получает свой вариант линии
      const childFamilyLine = subLine * 10 + childIndex;
      const childNode = buildDescendantsTree(childId, data, visited, childFamilyLine);
      if (childNode) {
        node.children.push(childNode);
      }
    });
  });

  return node;
}