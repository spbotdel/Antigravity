export function buildDescendantsTree(personId, data, depth = 0, visited = new Set()) {
  console.log(`${"  ".repeat(depth)}> buildDescendantsTree(${personId}, depth=${depth})`);
  
  if (visited.has(personId)) {
    console.warn(`${"  ".repeat(depth)}Обнаружен цикл для ID: ${personId}`);
    return null;
  }
  visited.add(personId);

  const person = data.people[personId];
  if (!person) {
    console.error(`${"  ".repeat(depth)}Человек с ID ${personId} не найден!`);
    return null;
  }

  console.log(`${"  ".repeat(depth)}Обрабатываем: ${person.name || "Без имени"} (${personId})`);
  console.log(`${"  ".repeat(depth)}Семьи как супруг:`, person.familiesAsSpouse);
  console.log(`${"  ".repeat(depth)}Семьи как ребенок:`, person.familiesAsChild);

  const node = {
    id: person.id,
    name: person.name || "Без имени",
    birth: person.birth || "",
    death: person.death || "",
    children: []
  };

  // Ищем семьи, где этот человек является родителем
  if (person.familiesAsSpouse && person.familiesAsSpouse.length > 0) {
    console.log(`${"  ".repeat(depth)}Найдено семей как супруг:`, person.familiesAsSpouse.length);
    
    for (const famId of person.familiesAsSpouse) {
      console.log(`${"  ".repeat(depth)}Анализируем семью ${famId}...`);
      const fam = data.families[famId];
      
      if (fam) {
        console.log(`${"  ".repeat(depth)}Семья найдена. Дети:`, fam.children);
        
        if (fam.children && fam.children.length > 0) {
          console.log(`${"  ".repeat(depth)}Обрабатываем ${fam.children.length} детей:`);
          
          for (const childId of fam.children) {
            console.log(`${"  ".repeat(depth)}- Ребенок ${childId}`);
            const childNode = buildDescendantsTree(childId, data, depth + 1, new Set(visited));
            
            if (childNode) {
              node.children.push(childNode);
              console.log(`${"  ".repeat(depth)}  Ребенок ${childId} добавлен`);
            } else {
              console.log(`${"  ".repeat(depth)}  Ребенок ${childId} не добавлен (null)`);
            }
          }
        } else {
          console.log(`${"  ".repeat(depth)}В семье ${famId} нет детей`);
        }
      } else {
        console.warn(`${"  ".repeat(depth)}Семья ${famId} не найдена в данных!`);
      }
    }
  } else {
    console.log(`${"  ".repeat(depth)}У человека нет семей как супруг`);
  }

  console.log(`${"  ".repeat(depth)}< Возвращаем узел для ${personId} с ${node.children.length} детьми`);
  return node;
}