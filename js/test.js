// Тестовый скрипт для проверки данных
fetch("./3.ged")
  .then(r => r.text())
  .then(text => {
    const lines = text.split('\n').slice(0, 50);
    console.log("=== ПЕРВЫЕ 50 СТРОК GEDCOM ===");
    lines.forEach((line, i) => console.log(i, line));
    
    // Ищем все ID
    const allIds = [];
    text.split('\n').forEach(line => {
      const match = line.match(/^0\s+(@?I\d+)@?\s+INDI/);
      if (match) allIds.push(match[1].replace(/@/g, ''));
    });
    
    console.log("\n=== ВСЕ ID ЛЮДЕЙ В ФАЙЛЕ ===");
    console.log(allIds);
    console.log("Всего:", allIds.length);
    
    // Проверяем формат ID
    console.log("\n=== ПРОВЕРКА ФОРМАТА ID ===");
    console.log("Пример первого ID:", allIds[0]);
    console.log("Содержит @?", allIds[0].includes('@'));
  });