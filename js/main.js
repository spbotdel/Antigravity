import { parseGedcom } from "./gedcomParser.js";
import { buildDescendantsTree } from "./treeBuilder.js";
import { renderTree } from "./treeRenderer.js";

// Путь теперь ведет к файлу в корне
fetch("./3.ged")
    .then(r => r.text())
    .then(text => {
        const data = parseGedcom(text);
        // Поменяйте rootId на "I1" для просмотра с самого начала
        const rootId = "I36"; // Или "I1" для самого старшего
        const treeData = buildDescendantsTree(rootId, data);
        renderTree(treeData);
    })
    .catch(error => {
        console.error("Ошибка загрузки или обработки файла:", error);
        document.getElementById("tree").innerHTML = 
            "<p style='padding:20px;'>Ошибка загрузки дерева. Проверьте консоль.</p>";
    });