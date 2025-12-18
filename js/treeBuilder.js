export function buildDescendantsTree(personId, data, visited = new Set()) {
  if (visited.has(personId)) return null;
  visited.add(personId);

  const person = data.people[personId];
  if (!person) return null;

  const node = {
    id: person.id,
    name: person.name,
    birth: person.birth,
    death: person.death,
    children: []
  };

  person.familiesAsSpouse.forEach(famId => {
    const fam = data.families[famId];
    if (!fam) return;

    fam.children.forEach(childId => {
      const childNode = buildDescendantsTree(childId, data, visited);
      if (childNode) node.children.push(childNode);
    });
  });

  return node;
}
