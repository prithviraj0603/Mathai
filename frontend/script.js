const API_BASE = window.location.hostname === 'localhost' 
  ? `http://localhost:3000`
  : 'https://mathai-s6wb.onrender.com';
const chatBox = document.getElementById('chatBox');
const userInput = document.getElementById('userInput');
const graphContainer = document.getElementById('graphContainer');

function handleKey(event) {
  if (event.key === 'Enter') {
    sendMessage();
  }
}

function addMessage(text, type) {
  const msg = document.createElement('div');
  msg.classList.add('message', type);
  msg.textContent = text;
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
  return msg;
}

function addMessageHTML(html, type) {
  const msg = document.createElement('div');
  msg.classList.add('message', type);
  msg.innerHTML = html;
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
  return msg;
}

function closeGraph() {
  graphContainer.style.display = 'none';
}

function evaluateFunction(func, x) {
  try {
    let expr = func
      .replace(/sin/g, 'Math.sin')
      .replace(/cos/g, 'Math.cos')
      .replace(/tan/g, 'Math.tan')
      .replace(/log/g, 'Math.log10')
      .replace(/ln/g, 'Math.log')
      .replace(/sqrt/g, 'Math.sqrt')
      .replace(/abs/g, 'Math.abs')
      .replace(/pi/g, 'Math.PI')
      .replace(/e/g, 'Math.E')
      .replace(/\^/g, '**');
    return eval(expr.replace(/x/g, `(${x})`));
  } catch (e) {
    return null;
  }
}

function showGraph(graphData) {
  const traces = [];
  const colors = ['#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#3b82f6'];

  // Get function string for detection
  const funcStr = graphData.functions.join(' ').toLowerCase();

  // Validate and fix xMin/xMax - ensure xMin < xMax
  let xMin = parseFloat(graphData.xMin);
  let xMax = parseFloat(graphData.xMax);

  // If values are missing or invalid (xMin >= xMax or NaN), use smart defaults
  if (isNaN(xMin) || isNaN(xMax) || xMin >= xMax) {
    if (funcStr.includes('sin') || funcStr.includes('cos') || funcStr.includes('tan')) {
      xMin = -6.28;  // -2π
      xMax = 6.28;   // 2π
    } else {
      xMin = -10;
      xMax = 10;
    }
  }

  // Ensure xMin < xMax (fix if AI swapped them)
  if (xMin > xMax) {
    [xMin, xMax] = [xMax, xMin];
  }

  graphData.functions.forEach((func, index) => {
    let cleanFunc = func
      .replace(/y\s*=\s*/gi, '')
      .trim();

    const isTrig = cleanFunc.includes('sin') || cleanFunc.includes('cos') || cleanFunc.includes('tan');
    const steps = isTrig ? 2000 : 1000; // More steps for smooth trig graphs
    const xValues = [];
    const yValues = [];
    let lastY = null;

    for (let i = 0; i <= steps; i++) {
      const x = xMin + (i / steps) * (xMax - xMin);
      const y = evaluateFunction(cleanFunc, x);

      // Handle tan(x) asymptotes - break line if jump is too large
      if (y !== null && isFinite(y)) {
        if (lastY !== null && Math.abs(y - lastY) > 20) {
          // Large jump (asymptote), add null to break the line
          xValues.push(null);
          yValues.push(null);
        }
        xValues.push(x);
        yValues.push(y);
        lastY = y;
      } else {
        lastY = null; // Reset after undefined point
      }
    }

    traces.push({
      x: xValues,
      y: yValues,
      type: 'scatter',
      mode: 'lines',
      name: func,
      line: {
        color: colors[index % colors.length],
        width: 2,
        shape: 'spline'
      },
      connectgaps: false
    });
  });

  // Set appropriate y-axis range based on function type
  let yMin = -10, yMax = 10;
  if (funcStr.includes('sin') || funcStr.includes('cos') || funcStr.includes('tan')) {
    yMin = -5;
    yMax = 5;
  } else if (funcStr.includes('tan')) {
    yMin = -10;
    yMax = 10;
  }

  const layout = {
    paper_bgcolor: '#16213e',
    plot_bgcolor: '#0f0f1a',
    font: { color: '#e0e0f0', family: 'Segoe UI' },
    xaxis: {
      range: [xMin, xMax],
      gridcolor: '#2a2a4a',
      zerolinecolor: '#6366f1',
      zerolinewidth: 2,
      color: '#a0a0b0',
      title: 'x'
    },
    yaxis: {
      range: [yMin, yMax],
      gridcolor: '#2a2a4a',
      zerolinecolor: '#6366f1',
      zerolinewidth: 2,
      color: '#a0a0b0',
      title: 'y'
    },
    margin: { t: 20, r: 20, b: 50, l: 50 },
    showlegend: true,
    legend: {
      bgcolor: '#16213e',
      bordercolor: '#2a2a4a',
      borderwidth: 1,
      font: { color: '#e0e0f0' }
    },
    height: 380
  };

  const config = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['toImage', 'sendDataToCloud'],
    displaylogo: false
  };

  Plotly.newPlot('plotlyGraph', traces, layout, config);

  graphContainer.style.display = 'block';
  graphContainer.scrollIntoView({ behavior: 'smooth' });
}

async function checkForGraph(question) {
  try {
    const response = await fetch(API_BASE + '/graph', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });
    const data = await response.json();
    return data;
  } catch (error) {
    return { needsGraph: false, functions: [] };
  }
}

async function sendMessage() {
  const question = userInput.value.trim();
  if (!question) return;

  addMessage(question, 'user');
  userInput.value = '';

  const loadingMsg = addMessage('⏳ Solving your problem...', 'loading');

  try {
    const [solveResponse, graphData] = await Promise.all([
      fetch(API_BASE + '/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question })
      }),
      checkForGraph(question)
    ]);

    const data = await solveResponse.json();
    loadingMsg.remove();

    if (data.answer) {
      let html = data.answer.replace(/\n/g, '<br>');
      if (graphData.needsGraph && graphData.functions.length > 0) {
        html += `<br><button class="graph-btn" onclick="showGraphFromData()">📈 Show Graph</button>`;
      }
      addMessageHTML(html, 'bot');

      if (graphData.needsGraph && graphData.functions.length > 0) {
        window.lastGraphData = graphData;
      }
      

    } else {
      const err = data.details || data.error || data.hint || 'Something went wrong. Try again!';
      addMessage('❌ ' + err, 'bot');
    }

  } catch (error) {
    loadingMsg.remove();
    addMessage('❌ Cannot connect to server. Make sure backend is running!', 'bot');
  }

  if (window.MathJax) {
    MathJax.typesetPromise();
  }
}

function showGraphFromData() {
  if (window.lastGraphData) {
    showGraph(window.lastGraphData);
  }
}