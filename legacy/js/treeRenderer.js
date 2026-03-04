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
            .y(d => d.x));

    // Рисуем узлы
    const node = g.selectAll(".node")
        .data(root.descendants())
        .enter()
        .append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.y},${d.x})`)
        .attr("data-depth", d => d.depth);

    // Функция для определения цвета фона
    function getGenerationColor(depth) {
        const palette = [
            '#2C3E50', // Темно-синий - поколение 0
            '#34495E', // Синий - поколение 1
            '#5D6D7E', // Серо-синий - поколение 2
            '#7F8C8D', // Серый - поколение 3
            '#95A5A6', // Светло-серый
            '#BDC3C7'  // Очень светлый серый
        ];
        return palette[Math.min(depth, palette.length - 1)];
    }

    // Функция для определения цвета текста
    function getTextColor(bgColor) {
        const darkColors = ['#2C3E50', '#34495E', '#5D6D7E'];
        return darkColors.includes(bgColor) ? '#FFFFFF' : '#2C3E50';
    }

    // Карточки
    node.append("rect")
        .attr("x", -100)
        .attr("y", -40)  // Немного увеличили высоту
        .attr("width", 200)
        .attr("height", 80)  // Увеличили высоту карточки с 70 до 80
        .attr("rx", 10)
        .attr("ry", 10)
        .attr("fill", d => getGenerationColor(d.depth))
        .attr("stroke", "#2c3e50")
        .attr("stroke-width", 1.5)
        .style("filter", "drop-shadow(2px 2px 4px rgba(0,0,0,0.1))")
        .style("cursor", "pointer")
        .on("mouseover", function (event, d) {
            const currentColor = d3.select(this).attr("fill");
            d3.select(this)
                .transition()
                .duration(200)
                .attr("fill", d3.color(currentColor).brighter(0.3));

            showTooltip(event, d.data);
        })
        .on("mouseout", function (event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr("fill", getGenerationColor(d.depth));

            hideTooltip();
        });

    // Имя и даты - ИСПРАВЛЕННАЯ ВЕРСИЯ
    node.each(function (d) {
        const nodeGroup = d3.select(this);
        const bgColor = getGenerationColor(d.depth);
        const textColor = getTextColor(bgColor);

        // ОДИН ЕДИНЫЙ foreignObject для всего текста
        const infoForeign = nodeGroup.append("foreignObject")
            .attr("x", -95)
            .attr("y", -35)    // Позиция
            .attr("width", 190)
            .attr("height", 75); // Достаточная высота для 3 строк

        infoForeign.append("xhtml:div")
            .style("width", "100%")
            .style("height", "100%")
            .style("display", "flex")
            .style("flex-direction", "column")
            .style("justify-content", "center")
            .style("align-items", "center")
            .style("font-family", "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif")
            .style("padding", "8px 5px")
            .html(() => {
                // Имя с нормальным межстрочным интервалом
                const nameHtml = `
                    <div style="
                        font-weight: bold; 
                        font-size: 14px; 
                        text-align: center;
                        line-height: 1.3;
                        margin-bottom: 4px;
                        word-break: break-word;
                        overflow: hidden;
                        display: -webkit-box;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                    ">
                        ${d.data.name}
                    </div>
                `;

                // Даты
                const dates = [];
                if (d.data.birth) dates.push(`род. ${formatDate(d.data.birth)}`);
                if (d.data.death) dates.push(`ум. ${formatDate(d.data.death)}`);

                const datesHtml = dates.length ?
                    `<div style="
                        font-size: 11px; 
                        color: ${textColor};
                        opacity: 0.9;
                        text-align: center;
                        line-height: 1.2;
                    ">${dates.join(' / ')}</div>` : '';

                return nameHtml + datesHtml;
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
        exportPNG: exportTreeAsPNG
    };

    console.log("Рендеринг завершен успешно");
}

// Вспомогательные функции
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

    const x = event.pageX + 15;
    const y = event.pageY - 15;
    tooltip.style("left", x + "px").style("top", y + "px");
}

function hideTooltip() {
    d3.selectAll(".tree-tooltip").remove();
}

function exportTreeAsPNG() {
    try {
        const svgElement = document.querySelector('#tree svg');
        if (!svgElement) {
            alert('SVG элемент не найден!');
            return;
        }

        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svgElement);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        const scale = 2;
        canvas.width = svgElement.clientWidth * scale;
        canvas.height = svgElement.clientHeight * scale;

        img.onload = function () {
            ctx.scale(scale, scale);
            ctx.drawImage(img, 0, 0);

            const link = document.createElement('a');
            const timestamp = new Date().toISOString().slice(0, 10);
            link.download = `семейное-древо-русяйкиных-${timestamp}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        };

        img.src = 'data:image/svg+xml;base64,' + btoa(
            '<?xml version="1.0" encoding="UTF-8" standalone="no"?>' +
            '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">' +
            svgString
        );

    } catch (error) {
        console.error('Ошибка экспорта PNG:', error);
        alert('Ошибка при сохранении: ' + error.message);
    }
}