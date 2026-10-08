const messages = document.querySelector("#chat-messages");
const form = document.querySelector("#chat-form");
const input = document.querySelector("#chat-input");
const toast = document.querySelector("#toast");
const scheduleModal = document.querySelector("#schedule-modal");
const scheduleForm = document.querySelector("#schedule-form");
const modelStatus = document.querySelector("#model-status");
const modelStatusText = document.querySelector("#model-status-text");
const sendButton = form.querySelector('button[type="submit"]');
const modelName = "qwen2.5:3b";
const ollamaEndpoint = "/api/ollama";
const chatHistory = [{
  role: "system",
  content: `You are Sprout, a friendly, practical gardening assistant. Help with identifying possible plant problems, plant recommendations, watering, sunlight, soil, fertilizer, common pests and diseases, and personalized plant-care schedules. Give simple, actionable steps, ask a clarifying question when the plant or symptoms are unclear, and explain uncertainty rather than claiming a definitive diagnosis from limited information. For pesticides or other treatments, advise correct identification, label directions, and testing safely; don't recommend mixing chemicals or unsafe remedies. Remind users that watering depends on soil and plant conditions rather than a fixed calendar. Keep answers concise, kind, and easy for a beginner to follow.`
}];
let isResponding = false;
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3000);
}

function addMessage(text, type, timeLabel) {
  const row = document.createElement("div");
  row.className = `message ${type}-message`;
  const avatar = document.createElement("span");
  avatar.className = "message-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = type === "assistant" ? "✿" : "J";
  const content = document.createElement("div");
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = text;
  const time = document.createElement("span");
  time.className = "message-time";
  time.textContent = `${type === "assistant" ? "Sprout" : "You"} · ${timeLabel}`;
  content.append(bubble, time);
  row.append(avatar, content);
  messages.append(row);
  messages.scrollTop = messages.scrollHeight;
  return bubble;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function renderMarkdown(text) {
  return escapeHtml(text.trim())
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|\n)[*-] /g, "$1• ")
    .replace(/\n/g, "<br>");
}

function addAssistantReply(text) {
  const row = document.createElement("div");
  row.className = "message assistant-message";
  const avatar = document.createElement("span");
  avatar.className = "message-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = "✿";
  const content = document.createElement("div");
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.innerHTML = renderMarkdown(text);
  const time = document.createElement("span");
  time.className = "message-time";
  time.textContent = `Sprout · ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  content.append(bubble, time);
  row.append(avatar, content);
  messages.append(row);
  messages.scrollTop = messages.scrollHeight;
}

function setModelStatus(state, text) {
  modelStatus.classList.toggle("model-offline", state === "offline");
  modelStatus.classList.toggle("model-ready", state === "ready");
  modelStatusText.textContent = text;
}

async function checkModel() {
  try {
    const response = await fetch(`${ollamaEndpoint}/tags`);
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}.`);
    const data = await response.json();
    const installedModels = Array.isArray(data.models) ? data.models : [];
    const modelInstalled = installedModels.some((model) => model.name === modelName || model.name.startsWith(`${modelName}-`));
    if (modelInstalled) {
      setModelStatus("ready", `${modelName} · running locally`);
    } else {
      setModelStatus("offline", `${modelName} not found · run ollama pull ${modelName}`);
    }
  } catch {
    setModelStatus("offline", "Local model unavailable · start the Sprout server and Ollama");
  }
}

async function askSprout(question) {
  const cleaned = question.trim();
  if (!cleaned || isResponding) return;

  addMessage(cleaned, "user", new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  chatHistory.push({ role: "user", content: cleaned });
  const typing = document.createElement("div");
  typing.className = "message assistant-message";
  typing.innerHTML = '<span class="message-avatar" aria-hidden="true">✿</span><div><div class="message-bubble thinking"><span class="thinking-dots" aria-label="Sprout is thinking"><i></i><i></i><i></i></span></div></div>';
  messages.append(typing);
  messages.scrollTop = messages.scrollHeight;
  isResponding = true;
  input.disabled = true;
  sendButton.disabled = true;

  try {
    const response = await fetch(`${ollamaEndpoint}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        messages: [chatHistory[0], ...chatHistory.slice(1).slice(-12)],
        stream: false
      }),
      signal: AbortSignal.timeout(180000)
    });
    const data = await response.json();
    if (!response.ok) {
      const detail = data.error || `Ollama returned HTTP ${response.status}.`;
      throw new Error(detail);
    }
    const answer = data.message && typeof data.message.content === "string"
      ? data.message.content.trim()
      : "";
    if (!answer) throw new Error("Qwen returned an empty reply. Please try asking again.");
    chatHistory.push({ role: "assistant", content: answer });
    addAssistantReply(answer);
    setModelStatus("ready", `${modelName} · running locally`);
  } catch (error) {
    const errorMessage = error.name === "TimeoutError"
      ? "The local model took too long to reply. Please try again."
      : error.name === "TypeError"
        ? "Could not reach the local model. Make sure Ollama and the Sprout server are running."
        : error.message;
    addAssistantReply(`I couldn't get a reply from ${modelName}: ${errorMessage}`);
    setModelStatus("offline", "Local model connection needs attention");
  } finally {
    typing.remove();
    isResponding = false;
    input.disabled = false;
    sendButton.disabled = false;
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = input.value;
  if (!question.trim()) {
    input.focus();
    return;
  }
  input.value = "";
  askSprout(question);
});

document.addEventListener("click", (event) => {
  if (event.target === scheduleModal || event.target.closest("#close-schedule")) {
    closeScheduleBuilder();
    return;
  }

  const promptButton = event.target.closest("[data-prompt]");
  if (promptButton) {
    askSprout(promptButton.dataset.prompt);
    return;
  }

  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    const view = viewButton.dataset.view;
    if (view === "schedule") {
      openScheduleBuilder();
      document.querySelector("#page-label").textContent = "Care schedule";
    } else if (view === "plants") {
      document.querySelector(".plants-card").scrollIntoView({ behavior: "smooth", block: "center" });
      document.querySelector("#page-label").textContent = "My plants";
      showToast("Your plant shelf is just getting started. Ask Sprout for care tips or a new plant idea.");
    } else {
      document.querySelector("#page-label").textContent = "Overview";
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    document.querySelectorAll(".nav-item[data-view]").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  }
});

function openScheduleBuilder() {
  scheduleModal.hidden = false;
  document.querySelector("#schedule-plants").focus();
}

function closeScheduleBuilder() {
  scheduleModal.hidden = true;
  document.querySelector(".schedule-link").focus();
}

function makeTask(title, detail, icon) {
  const label = document.createElement("label");
  label.className = "task-row";
  const checkbox = document.createElement("input");
  checkbox.className = "task-checkbox";
  checkbox.type = "checkbox";
  const customCheckbox = document.createElement("span");
  customCheckbox.className = "custom-checkbox";
  const copy = document.createElement("span");
  copy.className = "task-copy";
  const taskTitle = document.createElement("strong");
  taskTitle.textContent = title;
  const taskDetail = document.createElement("small");
  taskDetail.textContent = detail;
  copy.append(taskTitle, taskDetail);
  const taskIcon = document.createElement("span");
  taskIcon.className = "task-icon";
  taskIcon.setAttribute("aria-hidden", "true");
  taskIcon.textContent = icon;
  label.append(checkbox, customCheckbox, copy, taskIcon);
  return label;
}

scheduleForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (isResponding) {
    showToast("Let Sprout finish the current answer before building another care plan.");
    return;
  }
  const plants = document.querySelector("#schedule-plants").value
    .split(",")
    .map((plant) => plant.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (plants.length === 0) {
    document.querySelector("#schedule-plants").focus();
    return;
  }

  const light = document.querySelector("#schedule-light").value;
  const plantNames = plants.join(", ");
  const soilTitle = plants.length === 1 ? `Check ${plants[0]} soil` : "Check your plants’ soil";
  const soilDetail = plants.length === 1
    ? "Water only if the top inch feels dry"
    : "Check each pot; water only if its soil is dry";
  const lightAdvice = light === "low"
    ? "Check for stretched growth; move closer to a window if needed"
    : light === "direct"
      ? "Check soil more often in the warm, sunny spot"
      : "Give plants a quarter-turn for even light";
  document.querySelector("#schedule-tasks").replaceChildren(
    makeTask(soilTitle, soilDetail, "💧"),
    makeTask("Check leaves and stems", `Inspect ${plantNames} for yellowing or pests`, "🔎"),
    makeTask("Check your light spot", lightAdvice, "☀️"),
    makeTask("Review feeding needs", "In the growing season, follow the plant's fertilizer label", "🌱")
  );
  document.querySelector("#schedule-date-label").textContent = "YOUR WEEKLY CHECK-IN";
  closeScheduleBuilder();
  showToast(`Your care checklist for ${plantNames} is ready.`);
  askSprout(`Make me a care schedule for ${plantNames} in ${light} light.`);
});

document.querySelector("#notifications-button").addEventListener("click", () => {
  showToast("You’re all caught up. Check today’s care reminders on your garden overview.");
});

const now = new Date();
const dateOptions = { weekday: "short", month: "short", day: "numeric" };
document.querySelector("#today-date").textContent = now.toLocaleDateString([], dateOptions);
document.querySelector("#schedule-date-label").textContent = `TODAY, ${now.toLocaleDateString([], { day: "numeric", month: "short" }).toUpperCase()}`;
checkModel();
