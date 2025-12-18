export function renderTree(rootData) {
    console.log("Рендеринг дерева:", rootData);

    const container = d3.select("#tree");
    container.selectAll("*").remove();

    if (!rootData) {
        container.html("<p style='padding:20px;'>Данные дерева отсутствуют.</p>");
        return;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;

    const svg = container
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`);

    const g = svg.append("g")
        .attr("transform", `translate(80, 80)`); // Больше отступ слева

    // Увеличиваем вертикальное расстояние между узлами
    const treeLayout = d3.tree()
        .nodeSize([120, 250]) // [вертикальное, горизонтальное] расстояние
        .separation((a, b) => {
            // Увеличиваем расстояние между узлами с общим родителем
            return a.parent === b.parent ? 1.5 : 2;
        });

    const root = d3.hierarchy(rootData);
    treeLayout(root);

    // Zoom с улучшенными параметрами
    const zoom = d3.zoom()
        .scaleExtent([0.1, 3])
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
        });

    svg.call(zoom);

    // Линии - плавные кривые
    g.selectAll(".link")
        .data(root.links())
        .enter()
        .append("path")
        .attr("class", "link")
        .attr("fill", "none")
        .attr("stroke", "#95a5a6")
        .attr("stroke-width", 2)
        .attr("stroke-opacity", 0.6)
        .attr("d", d3.linkHorizontal()
            .x(d => d.y)
            .y(d => d.x)
            .source(d => d.source)
            .target(d => d.target));

    // Узлы
    const node = g.selectAll(".node")
        .data(root.descendants())
        .enter()
        .append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.y},${d.x})`);

    // Карточки - больше и с тенью
    node.append("rect")
        .attr("x", -90)
        .attr("y", -30)
        .attr("width", 180)
        .attr("height", 60)
        .attr("rx", 10)
        .attr("ry", 10)
        .attr("fill", d => getGenerationColor(d.depth))
        .attr("stroke", "#2c3e50")
        .attr("stroke-width", 1.5)
        .style("filter", "drop-shadow(2px 2px 4px rgba(0,0,0,0.1))")
        .style("cursor", "pointer")
        .on("mouseover", function (event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr("fill", d => lightenColor(getGenerationColor(d.depth)));
        })
        .on("mouseout", function (event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr("fill", d => getGenerationColor(d.depth));
        });

    // Имя - с переносом слов
    node.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "-0.8em")
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .style("fill", "#2c3e50")
        .style("pointer-events", "none")
        .text(d => {
            // Ограничиваем длину имени
            const name = d.data.name;
            return name.length > 20 ? name.substring(0, 20) + "..." : name;
        });

    // Даты рождения/смерти
    node.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.8em")
        .style("font-size", "11px")
        .style("fill", "#7f8c8d")
        .style("pointer-events", "none")
        .text(d => {
            const dates = [];
            if (d.data.birth) dates.push(`род. ${formatDate(d.data.birth)}`);
            if (d.data.death) dates.push(`ум. ${formatDate(d.data.death)}`);
            return dates.join(' / ');
        });

    // ID в углу для отладки
    node.append("text")
        .attr("x", -80)
        .attr("y", -20)
        .style("font-size", "9px")
        .style("fill", "#bdc3c7")
        .style("pointer-events", "none")
        .text(d => d.data.id);

    // Центрируем дерево
    const bounds = g.node().getBBox();
    const dx = width - bounds.width - 160;
    const dy = height - bounds.height - 160;

    svg.call(zoom.transform, d3.zoomIdentity
        .translate(-bounds.x + dx / 2, -bounds.y + dy / 2)
        .scale(0.9));
}

// Цвета для поколений
function getGenerationColor(depth) {
    const colors = [
        "#3498db", // Поколение 0 - синий (основатель)
        "#2ecc71", // Поколение 1 - зеленый (дети)
        "#e74c3c", // Поколение 2 - красный (внуки)
        "#9b59b6", // Поколение 3 - фиолетовый (правнуки)
        "#f39c12", // Поколение 4 - оранжевый
        "#1abc9c", // Поколение 5 - бирюзовый
        "#34495e"  // Поколение 6+ - темный
    ];
    return colors[depth] || colors[colors.length - 1];
}

// Осветление цвета при наведении
function lightenColor(color) {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    return `rgb(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)})`;
}

// Форматирование даты
function formatDate(dateStr) {
    if (!dateStr) return '';
    // Упрощаем дату для отображения
    return dateStr.replace(/(\d{1,2})\s+([A-Z]{3})\s+(\d{4})/, "$1 $2 $3");
}
// Заменяем функцию getGenerationColor на getFamilyLineColor
function getFamilyLineColor(familyLineCode) {
    // Создаем цвет на основе кода семейной линии
    const hue = (familyLineCode * 137) % 360; // Золотое сечение для распределения
    return `hsl(${hue}, 70%, 65%)`;
}

// В рендеринге меняем цвет карточек:
node.append("rect")
    .attr("fill", d => getFamilyLineColor(d.data.familyLine || 0))
// ... остальные атрибуты