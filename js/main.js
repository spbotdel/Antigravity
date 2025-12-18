import { parseGedcom } from "./gedcomParser.js";
import { buildDescendantsTree } from "./treeBuilder.js";
import { renderTree } from "./treeRenderer.js";

console.log("=== ПОИСК ДОСТУПНЫХ ID ===");

fetch("./3.ged")
  .then(response => response.text())
  .then(text => {
    const data = parseGedcom(text);
    
    console.log("Всего людей:", Object.keys(data.people).length);
    console.log("Всего семей:", Object.keys(data.families).length);
    
    // Выводим ВСЕХ людей с их ID
    console.log("\n=== ПОЛНЫЙ СПИСОК ЛЮДЕЙ ===");
    Object.entries(data.people).forEach(([id, person]) => {
      console.log(`${id}: ${person.name || "Без имени"}`);
    });
    
    // Ищем подходящий rootId (у кого есть семья или дети)
    console.log("\n=== ПОИСК ПОДХОДЯЩЕГО ROOTID ===");
    
    // Вариант 1: Ищем по имени
    const targetNames = ["Леонид", "Егор", "Валентина", "Евангелина"];
    targetNames.forEach(name => {
      const found = Object.entries(data.people).find(([id, p]) => 
        p.name && p.name.includes(name)
      );
      if (found) {
        console.log(`Найден "${name}": ${found[0]} - "${found[1].name}"`);
      }
    });
    
    // Вариант 2: Ищем того, у кого есть дети
    const personWithChildren = Object.entries(data.people).find(([id, p]) => {
      if (!p.familiesAsSpouse || p.familiesAsSpouse.length === 0) return false;
      
      // Проверяем, есть ли у него дети в какой-либо семье
      return p.familiesAsSpouse.some(famId => {
        const fam = data.families[famId];
        return fam && fam.children && fam.children.length > 0;
      });
    });
    
    if (personWithChildren) {
      console.log(`\nНайден человек с детьми: ${personWithChildren[0]} - "${personWithChildren[1].name}"`);
      
      // Строим дерево от этого человека
      const treeData = buildDescendantsTree(personWithChildren[0], data);
      console.log("Построено дерево:", treeData);
      renderTree(treeData);
    } else {
      // Если не нашли человека с детьми, берем первого в списке
      const firstId = Object.keys(data.people)[0];
      if (firstId) {
        console.log(`\nБерем первого в списке: ${firstId}`);
        const treeData = buildDescendantsTree(firstId, data);
        renderTree(treeData);
      } else {
        console.error("Нет данных о людях!");
      }
    }
  })
  .catch(error => {
    console.error("Ошибка:", error);
    document.getElementById("tree").innerHTML = `
      <div style="padding: 20px;">
        <h3>Ошибка</h3>
        <p>${error.message}</p>
      </div>
    `;
  });