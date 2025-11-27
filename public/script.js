// Smooth scrolling
document.querySelectorAll('nav a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute("href"));
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

// Hash routing
window.addEventListener("hashchange", () => {
  const section = document.querySelector(location.hash);
  if (section) section.scrollIntoView({ behavior: "smooth" });
});

// Dynamic assistant
const assistantLines = [
  "Welcome! Use the menu to explore the site.",
  "This project analyzes ChatGPT's efficiency.",
  "Routing, middleware, and WebSockets come in Part 1 & 2.",
  "Scroll down to view datasets and methodology!"
];

let idx = 0;
setInterval(() => {
  idx = (idx + 1) % assistantLines.length;
  document.getElementById("assistant-text").textContent = assistantLines[idx];
}, 4000);

// -------------------------
// WebSocket Client
// -------------------------
let ws;

function connectWebSocket() {
  ws = new WebSocket("ws://localhost:3000");

  ws.onopen = () => {
    document.getElementById("ws-status").textContent = "Connected";
  };

  ws.onmessage = (event) => {
    const log = document.getElementById("ws-log");
    log.innerHTML += `<p>${event.data}</p>`;
  };

  ws.onclose = () => {
    document.getElementById("ws-status").textContent = "Disconnected";
  };
}

connectWebSocket();

// Send message button
function sendWSMessage() {
  const input = document.getElementById("ws-input").value;
  ws.send(input);
}

//Charts

const API_BASE = 'http://localhost:3000';

let accuracyChart, responseTimeChart, summaryChart;

async function loadResults() {
  try {
    const res = await fetch(`${API_BASE}/api/results`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    const labels = data.domains.map((d) => d.domain);
    const accuracies = data.domains.map((d) =>
      Number(d.accuracy.toFixed(2))
    );
    const responseTimes = data.domains.map((d) =>
      Number((d.avgResponseTime || 0).toFixed(2))
    );

    renderAccuracyChart(labels, accuracies);
    renderResponseTimeChart(labels, responseTimes);
    renderSummaryChart(data);
    renderTextSummary(data);
  } catch (err) {
    console.error("Failed to load /api/results:", err);
    const summaryEl = document.getElementById("results-summary");
    if (summaryEl) {
      summaryEl.textContent =
        "Unable to load results from the server. Make sure the Node.js backend is running on http://localhost:3000.";
    }
  }
}

function renderAccuracyChart(labels, values) {
  const canvas = document.getElementById("accuracyChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (accuracyChart) accuracyChart.destroy();

  accuracyChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Accuracy (%)",
          data: values
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          title: {
            display: true,
            text: "Accuracy (%)"
          }
        }
      }
    }
  });
}

function renderResponseTimeChart(labels, values) {
  const canvas = document.getElementById("responseTimeChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (responseTimeChart) responseTimeChart.destroy();

  responseTimeChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Avg Response Time (ms)",
          data: values,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Time (ms)"
          }
        }
      }
    }
  });
}

function renderSummaryChart(data) {
  const canvas = document.getElementById("summaryChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (summaryChart) summaryChart.destroy();

  summaryChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Correct", "Incorrect"],
      datasets: [
        {
          label: "Overall Accuracy",
          data: [
            data.overall.totalCorrect,
            data.overall.totalQuestions - data.overall.totalCorrect
          ]
        }
      ]
    },
    options: {
      responsive: true
    }
  });
}

function renderTextSummary(data) {
  const summaryEl = document.getElementById("results-summary");
  if (!summaryEl) return;

  const domains = [...data.domains];

  const bestDomain = domains
    .filter((d) => d.totalQuestions > 0)
    .sort((a, b) => b.accuracy - a.accuracy)[0];

  const slowestDomain = domains
    .filter((d) => (d.avgResponseTime || 0) > 0)
    .sort((a, b) => (b.avgResponseTime || 0) - (a.avgResponseTime || 0))[0];

  summaryEl.innerHTML = `
    <p><strong>Overall Accuracy:</strong> ${data.overall.accuracy.toFixed(
      1
    )}% across ${data.overall.totalQuestions} questions.</p>
    <p><strong>Overall Avg Response Time:</strong> ${
      data.overall.avgResponseTime
        ? data.overall.avgResponseTime.toFixed(0) + " ms"
        : "N/A"
    }</p>
    ${
      bestDomain
        ? `<p><strong>Best Performing Domain:</strong> ${
            bestDomain.domain
          } (${bestDomain.accuracy.toFixed(1)}% accuracy).</p>`
        : ""
    }
    ${
      slowestDomain
        ? `<p><strong>Slowest Domain:</strong> ${
            slowestDomain.domain
          } (~${(slowestDomain.avgResponseTime || 0).toFixed(
            0
          )} ms average response).</p>`
        : ""
    }
  `;
}

// Load charts when the page is ready
document.addEventListener("DOMContentLoaded", loadResults);