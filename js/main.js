import { parseGedcom } from "./gedcomParser.js";
import { buildDescendantsTree } from "./treeBuilder.js";
import { renderTree } from "./treeRenderer.js";

console.log("=== НАЧАЛО ЗАГРУЗКИ ===");

fetch("./3.ged")
  .then(response => {
    console.log("Статус ответа GEDCOM:", response.status, response.statusText);
    if (!response.ok) {
      throw new Error(`Ошибка HTTP: ${response.status}`);
    }
    return response.text();
  })
  .then(text => {
    console.log("GEDCOM загружен. Длина:", text.length, "символов");
    console.log("Первые 500 символов:\n", text.substring(0, 500));
    
    const data = parseGedcom(text);
    console.log("=== РЕЗУЛЬТАТЫ ПАРСИНГА ===");
    console.log("Найдено людей:", Object.keys(data.people).length);
    console.log("Найдено семей:", Object.keys(data.families).length);
    
    // Выводим первые 10 ID людей для проверки
    console.log("Первые 10 ID людей:", Object.keys(data.people).slice(0, 10));
    
    // Проверяем конкретные ID
    const testIds = ["I1", "I5", "I8", "I36"];
    testIds.forEach(id => {
      const person = data.people[id];
      console.log(`Проверка ${id}:`, person ? `"${person.name}"` : "НЕ НАЙДЕН");
    });
    
    // Пробуем разные rootId
    const rootId = "I1"; // Изменено на I1 - основатель
    console.log(`\nПробуем построить дерево от ${rootId}...`);
    
    const person = data.people[rootId];
    if (!person) {
      console.error(`ОШИБКА: Человек с ID ${rootId} не найден!`);
      console.log("Доступные ID:", Object.keys(data.people));
      return;
    }
    
    console.log(`Найден: ${person.name} (${rootId})`);
    
    const treeData = buildDescendantsTree(rootId, data);
    console.log("Результат buildDescendantsTree:", treeData);
    
    if (!treeData || !treeData.children) {
      console.warn("treeData не содержит детей. Попробуем другой ID...");
      
      // Ищем кого-то с семьей
      const personWithFamily = Object.values(data.people).find(p => 
        p.familiesAsSpouse && p.familiesAsSpouse.length > 0
      );
      
      if (personWithFamily) {
        console.log(`Найден человек с семьей: ${personWithFamily.name} (${personWithFamily.id})`);
        const alternativeTree = buildDescendantsTree(personWithFamily.id, data);
        console.log("Альтернативное дерево:", alternativeTree);
        renderTree(alternativeTree);
      } else {
        console.error("Ни у кого нет семьи!");
        renderTree(null);
      }
    } else {
      renderTree(treeData);
    }
  })
  .catch(error => {
    console.error("КРИТИЧЕСКАЯ ОШИБКА:", error);
    document.getElementById("tree").innerHTML = `
      <div style="padding: 20px; color: red;">
        <h3>Ошибка загрузки</h3>
        <p>${error.message}</p>
        <p>Проверьте консоль для подробностей.</p>
      </div>
    `;
  });