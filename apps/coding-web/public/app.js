const SESSION_KEY = "kairos-coding-web-session-id";

const stateEls = {
  form: document.querySelector("#prompt-form"),
  input: document.querySelector("#prompt-input"),
  runButton: document.querySelector("#run-button"),
  resetButton: document.querySelector("#reset-button"),
  notice: document.querySelector("#notice"),
  status: document.querySelector("#run-status"),
  turn: document.querySelector("#run-turn"),
  count: document.querySelector("#run-count"),
  stop: document.querySelector("#run-stop"),
  todos: document.querySelector("#todo-list"),
  todoCounts: document.querySelector("#todo-counts"),
  transcript: document.querySelector("#transcript"),
  approvalPanel: document.querySelector("#approval-panel"),
  approvalName: document.querySelector("#approval-name"),
  approvalRisk: document.querySelector("#approval-risk"),
  approvalArgs: document.querySelector("#approval-args"),
  approvalPreview: document.querySelector("#approval-preview"),
  approvalAllow: document.querySelector("#approval-allow"),
  approvalDeny: document.querySelector("#approval-deny"),
};

const sessionId = getSessionId();
let busy = false;
let approvalBusy = false;
let currentApproval;

stateEls.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) {
    return;
  }

  const input = stateEls.input.value.trim();
  if (!input) {
    setNotice("Enter a task first.");
    return;
  }

  await runPrompt(input);
});

stateEls.resetButton.addEventListener("click", async () => {
  if (busy) {
    return;
  }

  setBusy(true);
  setNotice("");
  try {
    const response = await fetch("/api/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || "Reset failed.");
    }
    renderState(body.state);
    stateEls.input.value = "";
    clearApproval();
  } catch (error) {
    setNotice(formatError(error));
  } finally {
    setBusy(false);
  }
});

stateEls.approvalAllow.addEventListener("click", () => {
  respondToApproval("allow");
});

stateEls.approvalDeny.addEventListener("click", () => {
  respondToApproval("deny");
});

renderState({
  version: 1,
  status: "idle",
  runId: 0,
  items: [],
});

async function runPrompt(input) {
  setBusy(true);
  setNotice("");
  clearApproval();

  try {
    const response = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, sessionId }),
    });

    if (!response.ok || !response.body) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Run failed.");
    }

    await readSse(response.body, (event) => {
      if (event.type === "state") {
        renderState(event.data);
        return;
      }
      if (event.type === "approval") {
        renderApproval(event.data);
        return;
      }
      if (event.type === "done") {
        renderState(event.data.state);
        clearApproval();
        return;
      }
      if (event.type === "error") {
        renderState(event.data.state);
        clearApproval();
        setNotice(event.data.message);
      }
    });
  } catch (error) {
    setNotice(formatError(error));
  } finally {
    setBusy(false);
  }
}

async function respondToApproval(decision) {
  if (!currentApproval || approvalBusy) {
    return;
  }

  const approval = currentApproval;
  setApprovalBusy(true);
  try {
    const response = await fetch("/api/approval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        approvalId: approval.id,
        decision,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || "Approval failed.");
    }
    if (currentApproval?.id === approval.id) {
      clearApproval();
    }
    setNotice(decision === "allow" ? "Tool approved." : "Tool denied.");
  } catch (error) {
    setNotice(formatError(error));
    setApprovalBusy(false);
  }
}

function renderApproval(approval) {
  currentApproval = approval;
  stateEls.approvalName.textContent = approval.toolName;
  stateEls.approvalRisk.textContent = approval.risk;
  stateEls.approvalRisk.dataset.risk = approval.risk;
  stateEls.approvalArgs.textContent = JSON.stringify(approval.arguments, null, 2);
  stateEls.approvalPreview.textContent = approval.preview || "(no preview)";
  stateEls.approvalPanel.hidden = false;
  setApprovalBusy(false);
}

function clearApproval() {
  currentApproval = undefined;
  stateEls.approvalPanel.hidden = true;
  stateEls.approvalName.textContent = "Tool request";
  stateEls.approvalRisk.textContent = "";
  stateEls.approvalRisk.dataset.risk = "";
  stateEls.approvalArgs.textContent = "";
  stateEls.approvalPreview.textContent = "";
  setApprovalBusy(false);
}

async function readSse(stream, onEvent) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = parseSseEvent(raw);
      if (event) {
        onEvent(event);
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
}

function parseSseEvent(raw) {
  const lines = raw.split("\n");
  const eventLine = lines.find((line) => line.startsWith("event: "));
  const dataLine = lines.find((line) => line.startsWith("data: "));
  if (!eventLine || !dataLine) {
    return undefined;
  }

  return {
    type: eventLine.slice("event: ".length),
    data: JSON.parse(dataLine.slice("data: ".length)),
  };
}

function renderState(state) {
  stateEls.status.textContent = state.status;
  stateEls.status.dataset.status = state.status;
  stateEls.turn.textContent = state.currentTurn ? String(state.currentTurn) : "-";
  stateEls.count.textContent = String(state.runId);
  stateEls.stop.textContent = state.result?.stopReason || "-";

  renderTodos(state.todos);
  renderTranscript(state.items);
}

function renderTodos(todos) {
  stateEls.todos.replaceChildren();
  if (!todos || todos.items.length === 0) {
    const empty = document.createElement("li");
    empty.className = "todo-empty";
    empty.textContent = "No todos";
    stateEls.todos.append(empty);
    stateEls.todoCounts.textContent = "0 / 0 / 0";
    return;
  }

  stateEls.todoCounts.textContent = [
    todos.pendingCount,
    todos.inProgressCount,
    todos.completedCount,
  ].join(" / ");

  for (const item of todos.items) {
    const row = document.createElement("li");
    row.className = `todo-item todo-${item.status}`;

    const status = document.createElement("span");
    status.className = "todo-status";
    status.textContent = item.status.replace("_", " ");

    const content = document.createElement("span");
    content.className = "todo-content";
    content.textContent = item.content;

    row.append(status, content);
    stateEls.todos.append(row);
  }
}

function renderTranscript(items) {
  stateEls.transcript.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No messages yet.";
    stateEls.transcript.append(empty);
    return;
  }

  for (const item of items) {
    if (item.kind === "user") {
      stateEls.transcript.append(renderTextItem("user", "You", item.text));
      continue;
    }
    if (item.kind === "assistant") {
      stateEls.transcript.append(
        renderTextItem("assistant", item.streaming ? "Kairos streaming" : "Kairos", item.text),
      );
      continue;
    }
    if (item.kind === "tool") {
      stateEls.transcript.append(renderToolItem(item));
    }
  }
}

function renderTextItem(kind, label, text) {
  const article = document.createElement("article");
  article.className = `message message-${kind}`;

  const meta = document.createElement("p");
  meta.className = "message-meta";
  meta.textContent = label;

  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = text || "";

  article.append(meta, body);
  return article;
}

function renderToolItem(item) {
  const details = document.createElement("details");
  details.className = `tool-call tool-${item.status}`;
  details.open = item.status === "running" || item.status === "error";

  const summary = document.createElement("summary");
  const name = document.createElement("span");
  name.textContent = item.toolCall.name;
  const status = document.createElement("strong");
  status.textContent = item.status;
  summary.append(name, status);

  const args = document.createElement("pre");
  args.className = "tool-json";
  args.textContent = JSON.stringify(item.toolCall.arguments, null, 2);

  const output = document.createElement("pre");
  output.className = "tool-output";
  output.textContent = item.content || "(no output)";

  details.append(summary, args, output);
  return details;
}

function setBusy(nextBusy) {
  busy = nextBusy;
  stateEls.input.disabled = nextBusy;
  stateEls.runButton.disabled = nextBusy;
  stateEls.resetButton.disabled = nextBusy;
  stateEls.runButton.textContent = nextBusy ? "Running" : "Run";
}

function setApprovalBusy(nextBusy) {
  approvalBusy = nextBusy;
  stateEls.approvalAllow.disabled = nextBusy;
  stateEls.approvalDeny.disabled = nextBusy;
  stateEls.approvalAllow.textContent = nextBusy ? "Sending" : "Allow once";
}

function setNotice(message) {
  stateEls.notice.textContent = message;
}

function getSessionId() {
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) {
    return existing;
  }

  const next = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, next);
  return next;
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
