import { parseGedcom } from "./gedcomParser.js";
import { buildDescendantsTree } from "./treeBuilder.js";
import { renderTree } from "./treeRenderer.js";

console.log("=== ЗАГРУЗКА GEDCOM ===");

fetch("./3.ged")
  .then(response => response.text())
  .then(text => {
    // Проверяем первые символы файла
    console.log("Первые 200 символов файла:");
    console.log(text.substring(0, 200));
    
    const data = parseGedcom(text);
    
    // Выводим ВСЕХ людей
    console.log("\n=== ВСЕ ЛЮДИ В ФАЙЛЕ ===");
    Object.entries(data.people).forEach(([id, person]) => {
      console.log(`${id}: "${person.name || 'Без имени'}"`);
    });
    
    // Пробуем найти Леонида
    const leonidId = Object.keys(data.people).find(id => {
      const person = data.people[id];
      return person.name && person.name.includes('Леонид');
    });
    
    if (leonidId) {
      console.log(`\nНайден Леонид: ${leonidId}`);
      const treeData = buildDescendantsTree(leonidId, data);
      renderTree(treeData);
    } else {
      // Берем первого человека с детьми
      const personWithFamily = Object.entries(data.people).find(([id, p]) => 
        p.familiesAsSpouse && p.familiesAsSpouse.length > 0
      );
      
      if (personWithFamily) {
        console.log(`\nБерем человека с семьей: ${personWithFamily[0]} - "${personWithFamily[1].name}"`);
        const treeData = buildDescendantsTree(personWithFamily[0], data);
        renderTree(treeData);
      } else if (Object.keys(data.people).length > 0) {
        // Берем просто первого человека
        const firstId = Object.keys(data.people)[0];
        console.log(`\nБерем первого человека: ${firstId}`);
        const treeData = buildDescendantsTree(firstId, data);
        renderTree(treeData);
      } else {
        console.error("Нет данных о людях!");
      }
    }
  })
  .catch(error => {
    console.error("Ошибка загрузки:", error);
  });