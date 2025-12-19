// treeRenderer.js - ИСПРАВЛЕННАЯ ВЕРСИЯ
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

export function renderTree(rootData) {
    console.log("Начинаем рендеринг дерева...");

    const container = d3.select("#tree");
    if (container.empty()) {
        console.error("Контейнер #tree не найден!");
        return;
    }

    container.selectAll("*").remove();

    if (!rootData || !rootData.children) {
        container.html(`
      <div style="padding: 40px; text-align: center; color: #666;">
        <h3>Данные дерева отсутствуют или некорректны</h3>
        <p>Проверьте, что GEDCOM-файл содержит корректные данные</p>
      </div>
    `);
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
        .attr("transform", `translate(100, 100)`);

    // Создаем иерархию и дерево
    const root = d3.hierarchy(rootData);
    const treeLayout = d3.tree()
        .nodeSize([100, 250])
        .separation((a, b) => a.parent === b.parent ? 1.2 : 1.5);

    treeLayout(root);

    // Zoom функция
    let currentTransform = d3.zoomIdentity;
    const zoom = d3.zoom()
        .scaleExtent([0.1, 3])
        .on("zoom", (event) => {
            currentTransform = event.transform;
            g.attr("transform", event.transform);
        });

    svg.call(zoom);

    // Рисуем линии
    const link = g.selectAll(".link")
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
            .y(d => d.x));

    // Рисуем узлы
    const node = g.selectAll(".node")
        .data(root.descendants())
        .enter()
        .append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.y},${d.x})`);

    // Карточки с переносом текста
    node.append("rect")
        .attr("x", -100)
        .attr("y", -35)
        .attr("width", 200)
        .attr("height", 70)
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
                .attr("fill", lightenColor(getGenerationColor(d.depth)));

            // Показываем всплывающую подсказку
            showTooltip(event, d.data);
        })
        .on("mouseout", function (event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr("fill", getGenerationColor(d.depth));

            hideTooltip();
        });

    // Имя с переносом - используем foreignObject для HTML
    node.each(function (d) {
        const nodeGroup = d3.select(this);

        // Создаем foreignObject для HTML-контента
        const foreign = nodeGroup.append("foreignObject")
            .attr("x", -95)
            .attr("y", -30)
            .attr("width", 190)
            .attr("height", 30);

        foreign.append("xhtml:div")
            .style("width", "100%")
            .style("height", "100%")
            .style("display", "flex")
            .style("align-items", "center")
            .style("justify-content", "center")
            .style("font-size", "14px")
            .style("font-weight", "bold")
            .style("color", "#2c3e50")
            .style("text-align", "center")
            .style("word-break", "break-word")
            .style("overflow", "hidden")
            .style("padding", "0 5px")
            .html(`<div style="max-width: 100%;">${d.data.name}</div>`);

        // Даты рождения/смерти
        const datesForeign = nodeGroup.append("foreignObject")
            .attr("x", -95)
            .attr("y", 0)
            .attr("width", 190)
            .attr("height", 20);

        datesForeign.append("xhtml:div")
            .style("width", "100%")
            .style("height", "100%")
            .style("display", "flex")
            .style("align-items", "center")
            .style("justify-content", "center")
            .style("font-size", "11px")
            .style("color", "#7f8c8d")
            .style("text-align", "center")
            .html(() => {
                const dates = [];
                if (d.data.birth) dates.push(`род. ${formatDate(d.data.birth)}`);
                if (d.data.death) dates.push(`ум. ${formatDate(d.data.death)}`);
                return dates.join(' / ');
            });
    });

    // Центрируем дерево
    const bounds = g.node().getBBox();
    const initialScale = Math.min(
        (width - 200) / bounds.width,
        (height - 200) / bounds.height,
        0.9
    );

    const tx = (width - bounds.width * initialScale) / 2 - bounds.x * initialScale;
    const ty = (height - bounds.height * initialScale) / 2 - bounds.y * initialScale;

    currentTransform = d3.zoomIdentity.translate(tx, ty).scale(initialScale);
    svg.call(zoom.transform, currentTransform);

    // Сохраняем ссылки для кнопок управления
    window.treeControls = {
        zoomIn: () => {
            currentTransform = currentTransform.scale(1.2);
            svg.transition().duration(300).call(zoom.transform, currentTransform);
        },
        zoomOut: () => {
            currentTransform = currentTransform.scale(0.8);
            svg.transition().duration(300).call(zoom.transform, currentTransform);
        },
        resetView: () => {
            currentTransform = d3.zoomIdentity.translate(tx, ty).scale(initialScale);
            svg.transition().duration(500).call(zoom.transform, currentTransform);
        },
        exportPNG: () => exportTreeAsPNG(svg.node())
    };

    console.log("Рендеринг завершен успешно");
}

// Вспомогательные функции
// treeRenderer.js - функция getGenerationColor (заменить)
function getGenerationColor(depth) {
    // Приглушенная пастельная палитра
    const colors = [
        "#5D6D7E",    // Серо-синий (основатель) - спокойный, авторитетный
        "#7D8A8E",    // Серо-зеленый (дети)
        "#95A5A6",    // Серый (внуки)
        "#AEB6BF",    // Светло-серый (правнуки)
        "#D5DBDB",    // Очень светлый серый
        "#EAEDED"     // Почти белый
    ];

    // Или альтернативная теплая палитра:
    const warmColors = [
        "#8B7355",    // Коричневый (основатель)
        "#A67C52",    // Коричнево-бежевый (дети)
        "#C19A6B",    // Бежевый (внуки)
        "#D4B483",    // Светло-бежевый (правнуки)
        "#E6D5B8",    // Очень светлый бежевый
        "#F5EBDC"     // Кремовый
    ];

    // Или холодная синяя палитра:
    const blueColors = [
        "#2C3E50",    // Темно-синий (основатель)
        "#34495E",    // Синий (дети)
        "#5D6D7E",    // Серо-синий (внуки)
        "#7F8C8D",    // Серый (правнуки)
        "#BDC3C7",    // Светло-серый
        "#ECF0F1"     // Почти белый
    ];

    // Выберите палитру (меняйте на warmColors или blueColors по желанию)
    const palette = colors; // ← ИЗМЕНИТЕ ЗДЕСЬ НА warmColors ИЛИ blueColors

    return palette[Math.min(depth, palette.length - 1)];
}

// Также обновите lightenColor для более мягкого эффекта
function lightenColor(color) {
    const d3color = d3.color(color);
    if (!d3color) return color;
    return d3color.brighter(0.3); // Меньше осветление
}
function formatDate(dateStr) {
    if (!dateStr) return '';
    const months = {
        'JAN': 'янв', 'FEB': 'фев', 'MAR': 'мар',
        'APR': 'апр', 'MAY': 'май', 'JUN': 'июн',
        'JUL': 'июл', 'AUG': 'авг', 'SEP': 'сен',
        'OCT': 'окт', 'NOV': 'ноя', 'DEC': 'дек'
    };

    const match = dateStr.match(/(\d{1,2})\s+([A-Z]{3})\s+(\d{4})/);
    if (match) {
        const [, day, month, year] = match;
        return `${day} ${months[month] || month} ${year}`;
    }
    return dateStr;
}

function showTooltip(event, data) {
    const tooltip = d3.select("body")
        .append("div")
        .attr("class", "tree-tooltip")
        .style("position", "absolute")
        .style("background", "rgba(255, 255, 255, 0.95)")
        .style("border", "1px solid #ddd")
        .style("border-radius", "8px")
        .style("padding", "12px")
        .style("box-shadow", "0 4px 12px rgba(0,0,0,0.15)")
        .style("z-index", "1000")
        .style("pointer-events", "none")
        .style("max-width", "300px");

    let html = `<strong>${data.name}</strong><br>`;
    if (data.birth) html += `Родился: ${formatDate(data.birth)}<br>`;
    if (data.death) html += `Умер: ${formatDate(data.death)}<br>`;
    if (data.id) html += `<small style="color: #999;">ID: ${data.id}</small>`;

    tooltip.html(html);

    // Позиционируем подсказку
    const x = event.pageX + 15;
    const y = event.pageY - 15;
    tooltip.style("left", x + "px").style("top", y + "px");
}

function hideTooltip() {
    d3.selectAll(".tree-tooltip").remove();
}

function exportTreeAsPNG(svgElement) {
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgElement);

    // Создаем canvas для рендеринга
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const img = new Image();
    img.onload = function () {
        canvas.width = svgElement.clientWidth;
        canvas.height = svgElement.clientHeight;
        ctx.drawImage(img, 0, 0);

        // Создаем ссылку для скачивания
        const link = document.createElement('a');
        link.download = 'семейное-древо-русяйкиных.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(
        '<?xml version="1.0" standalone="no"?>\r\n' +
        '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\r\n' +
        source
    );
}