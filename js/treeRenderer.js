export function renderTree(rootData) {
    console.log("Рендеринг дерева:", rootData);

    // Очищаем контейнер
    const container = d3.select("#tree");
    container.selectAll("*").remove();

    // Если данных нет
    if (!rootData || !rootData.children) {
        container.html("<p style='padding:20px;'>Данные дерева отсутствуют или rootId указан неверно.</p>");
        return;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;

    const svg = container
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const g = svg.append("g")
        .attr("transform", `translate(${width / 2}, 50)`);

    // Zoom + Pan
    svg.call(
        d3.zoom()
            .scaleExtent([0.1, 4])
            .on("zoom", (event) => {
                g.attr("transform", event.transform);
            })
    );

    // Создаем иерархию
    const root = d3.hierarchy(rootData);
    const treeLayout = d3.tree().size([width - 100, height - 200]);

    treeLayout(root);

    // Рисуем линии
    g.selectAll(".link")
        .data(root.links())
        .enter()
        .append("path")
        .attr("class", "link")
        .attr("fill", "none")
        .attr("stroke", "#999")
        .attr("stroke-width", 1.5)
        .attr("d", d3.linkHorizontal()
            .x(d => d.y)
            .y(d => d.x)
        );

    // Создаем узлы
    const node = g.selectAll(".node")
        .data(root.descendants())
        .enter()
        .append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.y},${d.x})`);

    // Карточка
    node.append("rect")
        .attr("x", -80)
        .attr("y", -25)
        .attr("width", 160)
        .attr("height", 50)
        .attr("rx", 6)
        .attr("fill", "#fff")
        .attr("stroke", "#333")
        .attr("stroke-width", 1);

    // Имя
    node.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "-0.5em")
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .text(d => d.data.name);

    // Даты (если есть)
    node.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "1.2em")
        .style("font-size", "11px")
        .style("fill", "#666")
        .text(d => {
            const dates = [];
            if (d.data.birth) dates.push(`род. ${d.data.birth}`);
            if (d.data.death) dates.push(`ум. ${d.data.death}`);
            return dates.join(' / ');
        });
}