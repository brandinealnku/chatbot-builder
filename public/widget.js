(() => {
  const existing = document.getElementById("leadloop-widget-root");
  if (existing) return;
  const cfg = window.MyChatbotConfig || {};
  const chatbotId = cfg.chatbotId;
  const projectId = cfg.projectId;
  const functionUrl = cfg.functionUrl || null;
  if (!chatbotId || !projectId) {
    console.error("LeadLoop widget: missing chatbotId or projectId");
    return;
  }

  const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  const state = { bot: null, open: false, messages: [] };

  const style = document.createElement("style");
  style.textContent = `
    #leadloop-widget-root{all:initial;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .ll-launcher{position:fixed;right:20px;bottom:20px;z-index:2147483647;border:none;cursor:pointer;border-radius:999px;padding:14px 18px;color:#fff;font-weight:800;box-shadow:0 20px 40px rgba(0,0,0,.25)}
    .ll-panel{position:fixed;right:20px;bottom:84px;width:min(390px,calc(100vw - 20px));height:590px;background:#fff;border-radius:20px;border:1px solid rgba(15,23,42,.12);overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.24);z-index:2147483647;display:none;color:#0f172a}
    .ll-top{color:#fff;padding:15px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px}
    .ll-title{font-weight:900;font-size:15px}.ll-sub{font-size:12px;opacity:.92}
    .ll-close{border:none;background:rgba(255,255,255,.18);color:#fff;border-radius:999px;width:34px;height:34px;cursor:pointer}
    .ll-messages{height:395px;overflow:auto;padding:14px;background:#f8fafc;display:flex;flex-direction:column;gap:10px}
    .ll-bubble{max-width:84%;padding:11px 13px;border-radius:15px;font-size:14px;line-height:1.4;white-space:pre-wrap}
    .ll-assistant{align-self:flex-start;background:#e2e8f0;color:#0f172a;border-top-left-radius:6px}
    .ll-user{align-self:flex-end;color:#fff;border-top-right-radius:6px}
    .ll-inputbar{display:flex;gap:8px;padding:12px;background:#fff;border-top:1px solid rgba(15,23,42,.08)}
    .ll-input{flex:1;border:1px solid rgba(15,23,42,.14);border-radius:12px;padding:12px;font:inherit;outline:none}
    .ll-send{border:none;color:#fff;border-radius:12px;padding:0 14px;font-weight:800;cursor:pointer}
    .ll-lead{display:none;gap:8px;flex-direction:column;padding:12px;border-top:1px solid rgba(15,23,42,.08);background:#fff}
    .ll-lead input{border:1px solid rgba(15,23,42,.14);border-radius:12px;padding:10px;font:inherit}
    .ll-lead button{border:none;color:#fff;border-radius:12px;padding:11px 12px;font-weight:800;cursor:pointer}
  `;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "leadloop-widget-root";
  const launcher = document.createElement("button");
  launcher.className = "ll-launcher";
  launcher.textContent = "Chat with us";

  const panel = document.createElement("div");
  panel.className = "ll-panel";
  const top = document.createElement("div");
  top.className = "ll-top";
  const titleWrap = document.createElement("div");
  titleWrap.innerHTML = `<div class="ll-title">Website Assistant</div><div class="ll-sub">Ready to help</div>`;
  const close = document.createElement("button");
  close.className = "ll-close";
  close.innerHTML = "&times;";
  top.append(titleWrap, close);

  const messages = document.createElement("div");
  messages.className = "ll-messages";
  const lead = document.createElement("div");
  lead.className = "ll-lead";
  const inputBar = document.createElement("div");
  inputBar.className = "ll-inputbar";
  const input = document.createElement("input");
  input.className = "ll-input";
  input.placeholder = "Type your message...";
  const send = document.createElement("button");
  send.className = "ll-send";
  send.textContent = "Send";
  inputBar.append(input, send);

  panel.append(top, messages, lead, inputBar);
  root.append(launcher, panel);
  document.body.appendChild(root);

  function themeColor() {
    return state.bot?.theme?.primaryColor || "#6d5efc";
  }

  function applyTheme() {
    const c = themeColor();
    launcher.style.background = c;
    send.style.background = c;
    top.style.background = c;
  }

  function addMessage(role, text) {
    const el = document.createElement("div");
    el.className = `ll-bubble ${role === "assistant" ? "ll-assistant" : "ll-user"}`;
    if (role === "user") el.style.background = themeColor();
    el.textContent = text;
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeFirestoreValue(value) {
    if ("stringValue" in value) return value.stringValue;
    if ("integerValue" in value) return Number(value.integerValue);
    if ("doubleValue" in value) return Number(value.doubleValue);
    if ("booleanValue" in value) return value.booleanValue;
    if ("arrayValue" in value) return (value.arrayValue.values || []).map(normalizeFirestoreValue);
    if ("mapValue" in value) {
      const out = {};
      const fields = value.mapValue.fields || {};
      for (const [k, v] of Object.entries(fields)) out[k] = normalizeFirestoreValue(v);
      return out;
    }
    if ("timestampValue" in value) return value.timestampValue;
    return null;
  }

  function fromFirestoreDoc(doc) {
    const fields = doc.fields || {};
    const out = {};
    for (const [k, v] of Object.entries(fields)) out[k] = normalizeFirestoreValue(v);
    return out;
  }

  function toFirestoreFields(obj) {
    const out = {};
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === "string") out[key] = { stringValue: val };
      else if (typeof val === "number") out[key] = { integerValue: String(val) };
      else if (typeof val === "boolean") out[key] = { booleanValue: val };
      else if (Array.isArray(val)) out[key] = { arrayValue: { values: val.map(v => ({ stringValue: String(v) })) } };
      else if (val && typeof val === "object") {
        const mapFields = {};
        for (const [k, v] of Object.entries(val)) mapFields[k] = { stringValue: String(v || "") };
        out[key] = { mapValue: { fields: mapFields } };
      } else out[key] = { stringValue: String(val ?? "") };
    }
    return out;
  }

  async function loadChatbot() {
    const res = await fetch(`${firestoreBase}/publicChatbots/${encodeURIComponent(chatbotId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Failed to load chatbot.");
    state.bot = fromFirestoreDoc(data);

    titleWrap.innerHTML = `<div class="ll-title">${escapeHtml(state.bot.businessName || "Website Assistant")}</div>
      <div class="ll-sub">${escapeHtml(state.bot.primaryGoal || "Ready to help")}</div>`;
    launcher.textContent = state.bot?.theme?.launcherText || "Chat with us";
    applyTheme();
    addMessage("assistant", `Hi! Welcome to ${state.bot.businessName || "our business"}. How can I help today?`);
    renderLeadForm();
  }

  function renderLeadForm() {
    if (!state.bot?.leadCapture?.enabled || !state.bot?.leadCapture?.fields?.length) {
      lead.style.display = "none";
      return;
    }
    lead.innerHTML = "";
    const heading = document.createElement("div");
    heading.style.fontWeight = "900";
    heading.textContent = "Want a follow-up?";
    lead.appendChild(heading);

    const inputs = {};
    state.bot.leadCapture.fields.forEach(field => {
      const el = document.createElement("input");
      el.placeholder = field;
      inputs[field] = el;
      lead.appendChild(el);
    });

    const submit = document.createElement("button");
    submit.textContent = "Submit";
    submit.style.background = themeColor();
    submit.addEventListener("click", async () => {
      const fields = {};
      Object.entries(inputs).forEach(([k, v]) => fields[k] = v.value.trim());

      const leadPayload = {
        ownerId: state.bot.ownerId || "",
        chatbotId,
        businessName: state.bot.businessName || "",
        fields
      };

      try {
        const res = await fetch(`${firestoreBase}/publicLeads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields: toFirestoreFields(leadPayload) })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || "Lead submission failed.");
        addMessage("assistant", "Thanks — your details were submitted.");
        lead.style.display = "none";
      } catch (error) {
        addMessage("assistant", `Sorry — ${error.message}`);
      }
    });

    lead.appendChild(submit);
    lead.style.display = "flex";
  }

  function createMockReply(text) {
    const lower = String(text || "").toLowerCase();
    if (lower.includes("hours")) return state.bot.hours ? `${state.bot.businessName} is open: ${state.bot.hours}.` : "I don’t see business hours listed yet.";
    if (lower.includes("contact")) return state.bot.contact ? `You can contact ${state.bot.businessName} here: ${state.bot.contact}.` : "I don’t have contact info listed yet.";
    if (lower.includes("book")) return state.bot.cta ? `I can help with that. ${state.bot.cta}.` : "Please contact the business to get started.";
    return `Thanks for reaching out to ${state.bot.businessName || "us"}. I’m here to help with ${String(state.bot.primaryGoal || "your needs").toLowerCase()}.`;
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;
    addMessage("user", text);
    state.messages.push({ role: "user", content: text });
    input.value = "";

    if (!functionUrl) {
      const reply = createMockReply(text);
      addMessage("assistant", reply);
      state.messages.push({ role: "assistant", content: reply });
      return;
    }

    try {
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatbotId, messages: state.messages })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Chat failed.");
      addMessage("assistant", data.reply);
      state.messages.push({ role: "assistant", content: data.reply });
    } catch (error) {
      addMessage("assistant", `Sorry — ${error.message}`);
    }
  }

  launcher.addEventListener("click", () => {
    state.open = !state.open;
    panel.style.display = state.open ? "block" : "none";
  });
  close.addEventListener("click", () => {
    state.open = false;
    panel.style.display = "none";
  });
  send.addEventListener("click", sendMessage);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });

  loadChatbot().catch((error) => {
    console.error(error);
    panel.style.display = "block";
    state.open = true;
    addMessage("assistant", `Widget failed to load: ${error.message}`);
  });
})();
