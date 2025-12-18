<<<<<<< HEAD
export function renderTree(rootData) {
  const width = window.innerWidth;
  const height = window.innerHeight;

  d3.select("#tree").selectAll("*").remove();

  const svg = d3.select("#tree")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const g = svg.append("g");

  // Zoom + Pan
  svg.call(
    d3.zoom()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      })
  );

  const treeLayout = d3.tree()
    .size([width - 200, height - 200]);

  const root = d3.hierarchy(rootData);
  treeLayout(root);

  // Линии
  g.selectAll(".link")
    .data(root.links())
    .enter()
    .append("path")
    .attr("class", "link")
    .attr("fill", "none")
    .attr("stroke", "#999")
    .attr("stroke-width", 1.5)
    .attr("d", d3.linkVertical()
      .x(d => d.x)
      .y(d => d.y)
    );

  // Узлы
  const node = g.selectAll(".node")
    .data(root.descendants())
    .enter()
    .append("g")
    .attr("class", "node")
    .attr("transform", d => `translate(${d.x},${d.y})`);

  // Карточка
  node.append("rect")
    .attr("x", -70)
    .attr("y", -20)
    .attr("width", 140)
    .attr("height", 40)
    .attr("rx", 8)
    .attr("fill", "#fff")
    .attr("stroke", "#333");

  // Имя
  node.append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .text(d => d.data.name);
}
=======
export function renderTree(rootData) {
  const width = window.innerWidth;
  const height = window.innerHeight;

  d3.select("#tree").selectAll("*").remove();

  const svg = d3.select("#tree")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const g = svg.append("g");

  // Zoom + Pan
  svg.call(
    d3.zoom()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      })
  );

  const treeLayout = d3.tree()
    .size([width - 200, height - 200]);

  const root = d3.hierarchy(rootData);
  treeLayout(root);

  // Линии
  g.selectAll(".link")
    .data(root.links())
    .enter()
    .append("path")
    .attr("class", "link")
    .attr("fill", "none")
    .attr("stroke", "#999")
    .attr("stroke-width", 1.5)
    .attr("d", d3.linkVertical()
      .x(d => d.x)
      .y(d => d.y)
    );

  // Узлы
  const node = g.selectAll(".node")
    .data(root.descendants())
    .enter()
    .append("g")
    .attr("class", "node")
    .attr("transform", d => `translate(${d.x},${d.y})`);

  // Карточка
  node.append("rect")
    .attr("x", -70)
    .attr("y", -20)
    .attr("width", 140)
    .attr("height", 40)
    .attr("rx", 8)
    .attr("fill", "#fff")
    .attr("stroke", "#333");

  // Имя
  node.append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .text(d => d.data.name);
}
>>>>>>> 5bd2c9a43160ac9887d568ed67f000bb761d87c9
