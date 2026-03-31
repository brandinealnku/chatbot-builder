(() => {
  const CONFIG = window.MyChatbotConfig || {};
  const CHATBOT_ID = CONFIG.chatbotId || "";
  const PROJECT_ID = CONFIG.projectId || "";
  const MODE = CONFIG.mode || "webai";

  if (!CHATBOT_ID || !PROJECT_ID) {
    console.warn("LeadLoop widget: Missing chatbotId or projectId.");
    return;
  }

  const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const PUBLIC_CHATBOT_URL = `${FIRESTORE_BASE}/publicChatbots/${CHATBOT_ID}`;

  let chatbotConfig = null;
  let widgetOpen = false;
  let messages = [];
  let webllmEngine = null;
  let webllmReady = false;
  let webllmLoading = false;
  const WEBLLM_MODEL = "Llama-3.2-1B-Instruct-q4f32_1-MLC";
  const state = { mounted: false, awaitingLeadCapture: false };

  init();

  async function init() {
    try {
      chatbotConfig = await loadChatbotConfig();
    } catch (error) {
      console.error("LeadLoop widget: failed to load chatbot config", error);
      chatbotConfig = getFallbackConfig();
    }
    buildWidget();
    state.mounted = true;
  }

  async function loadChatbotConfig() {
    const response = await fetch(PUBLIC_CHATBOT_URL);
    if (!response.ok) throw new Error(`Failed to fetch chatbot config (${response.status})`);
    return parseFirestoreDocument(await response.json());
  }

  function parseFirestoreDocument(doc) {
    const fields = doc.fields || {};
    const parsed = {
      id: CHATBOT_ID,
      name: readString(fields.name),
      businessName: readString(fields.businessName),
      websiteUrl: readString(fields.websiteUrl),
      industry: readString(fields.industry),
      tone: readString(fields.tone),
      primaryGoal: readString(fields.primaryGoal),
      businessDescription: readString(fields.businessDescription),
      hours: readString(fields.hours),
      contact: readString(fields.contact),
      serviceAreas: readString(fields.serviceAreas),
      cta: readString(fields.cta),
      status: readString(fields.status) || "live",
      systemPrompt: readString(fields.systemPrompt),
      faqSeeds: readArray(fields.faqSeeds),
      theme: readMap(fields.theme),
      leadCapture: readMap(fields.leadCapture)
    };
    parsed.theme = {
      primaryColor: parsed.theme?.primaryColor || "#2563eb",
      launcherText: parsed.theme?.launcherText || "Chat with us",
      position: parsed.theme?.position || "bottom-right"
    };
    parsed.leadCapture = {
      enabled: parsed.leadCapture?.enabled === true || parsed.primaryGoal === "Capture leads" || parsed.primaryGoal === "Book appointments",
      fields: Array.isArray(parsed.leadCapture?.fields) ? parsed.leadCapture.fields : []
    };
    return parsed;
  }

  function readString(field) { return field?.stringValue ?? ""; }
  function readArray(field) { return field?.arrayValue?.values ? field.arrayValue.values.map(v => v.stringValue || "") : []; }
  function readMap(field) {
    if (!field?.mapValue?.fields) return {};
    const result = {};
    Object.entries(field.mapValue.fields).forEach(([key, value]) => {
      if (value.stringValue !== undefined) result[key] = value.stringValue;
      else if (value.booleanValue !== undefined) result[key] = value.booleanValue;
      else if (value.arrayValue !== undefined) result[key] = readArray(value);
      else if (value.mapValue !== undefined) result[key] = readMap(value);
    });
    return result;
  }

  function getFallbackConfig() {
    return {
      id: CHATBOT_ID,
      name: "Website Assistant",
      businessName: "LeadLoop Assistant",
      websiteUrl: "",
      industry: "General",
      tone: "Friendly and helpful",
      primaryGoal: "Answer customer questions",
      businessDescription: "I help answer questions and guide visitors to the next step.",
      faqSeeds: [],
      hours: "",
      contact: "",
      serviceAreas: "",
      cta: "Contact us to get started",
      status: "live",
      theme: { primaryColor: "#2563eb", launcherText: "Chat with us", position: "bottom-right" },
      leadCapture: { enabled: false, fields: [] },
      systemPrompt: ""
    };
  }

  function buildWidget() {
    document.documentElement.style.setProperty("--leadloop-primary", chatbotConfig.theme?.primaryColor || "#2563eb");
    const root = document.createElement("div");
    root.id = "leadloop-widget-root";
    root.innerHTML = `
      <button id="leadloop-launcher" aria-label="Open chat widget">
        <span class="leadloop-launcher-dot"></span>
        <span class="leadloop-launcher-text">${escapeHtml(chatbotConfig.theme?.launcherText || "Chat with us")}</span>
      </button>
      <section id="leadloop-panel" class="leadloop-hidden" aria-live="polite" aria-label="Chat widget">
        <div class="leadloop-header">
          <div class="leadloop-header-copy">
            <div class="leadloop-title">${escapeHtml(chatbotConfig.businessName || chatbotConfig.name || "Assistant")}</div>
            <div class="leadloop-subtitle">${escapeHtml(getSubtitle())}</div>
          </div>
          <button id="leadloop-close" aria-label="Close chat">×</button>
        </div>
        <div id="leadloop-messages" class="leadloop-messages"></div>
        <div id="leadloop-suggestions" class="leadloop-suggestions"></div>
        <form id="leadloop-input-form" class="leadloop-input-wrap">
          <input id="leadloop-input" type="text" placeholder="${escapeHtml(getInputPlaceholder())}" />
          <button type="submit" id="leadloop-send">Send</button>
        </form>
      </section>`;
    document.body.appendChild(root);
    if (chatbotConfig.theme?.position === "bottom-left") root.classList.add("leadloop-left");
    document.getElementById("leadloop-launcher").addEventListener("click", () => toggleWidget(true));
    document.getElementById("leadloop-close").addEventListener("click", () => toggleWidget(false));
    document.getElementById("leadloop-input-form").addEventListener("submit", onSubmitMessage);
    renderWelcome();
    renderSuggestions();
  }

  function toggleWidget(open) {
    widgetOpen = open;
    const panel = document.getElementById("leadloop-panel");
    if (open) {
      panel.classList.remove("leadloop-hidden");
      setTimeout(() => document.getElementById("leadloop-input")?.focus(), 80);
    } else {
      panel.classList.add("leadloop-hidden");
    }
  }

  function renderWelcome() {
    appendMessage("assistant", `Hi! Welcome to ${chatbotConfig.businessName || "our site"}. ${getWelcomeLine()}`);
  }
  function getWelcomeLine() {
    return (chatbotConfig.industry || "").toLowerCase() === "education"
      ? "I can help answer questions about course materials, policies, deadlines, and next steps."
      : "I can help answer questions and point you toward the next step.";
  }
  function getSubtitle() { return `${chatbotConfig.primaryGoal || "Answer customer questions"} • ${chatbotConfig.tone || "Friendly and helpful"}`; }
  function getInputPlaceholder() { return (chatbotConfig.industry || "").toLowerCase() === "education" ? "Ask about the course, policies, or assignments..." : "Ask a question..."; }
  function renderSuggestions() {
    const wrap = document.getElementById("leadloop-suggestions");
    const suggestions = (chatbotConfig.industry || "").toLowerCase() === "education"
      ? ["What is the attendance policy?", "When are office hours?", "What assignments are due?", "How can I contact the instructor?"]
      : ["What services do you offer?", "What are your hours?", "How can I contact you?", "How do I get started?"];
    wrap.innerHTML = "";
    suggestions.forEach(text => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "leadloop-chip";
      btn.textContent = text;
      btn.addEventListener("click", () => {
        const input = document.getElementById("leadloop-input");
        input.value = text;
        input.focus();
      });
      wrap.appendChild(btn);
    });
  }

  async function onSubmitMessage(event) {
    event.preventDefault();
    const input = document.getElementById("leadloop-input");
    const text = (input.value || "").trim();
    if (!text) return;
    appendMessage("user", text);
    messages.push({ role: "user", content: text });
    input.value = "";
    const typingId = appendTyping();
    try {
      let reply = "";
      if (MODE === "webai") {
        try { reply = await generateWebAIReply(text); }
        catch (error) { console.warn("LeadLoop widget: WebAI unavailable, using fallback", error); reply = generateMockReply(text, chatbotConfig); }
      } else {
        reply = generateMockReply(text, chatbotConfig);
      }
      removeTyping(typingId);
      appendMessage("assistant", reply);
      messages.push({ role: "assistant", content: reply });
      if (shouldPromptLeadCapture(text)) {
        const leadPrompt = buildLeadPrompt();
        appendMessage("assistant", leadPrompt);
        messages.push({ role: "assistant", content: leadPrompt });
        state.awaitingLeadCapture = true;
      }
    } catch (error) {
      console.error(error);
      removeTyping(typingId);
      appendMessage("assistant", "Sorry — I’m having trouble responding right now. Please try again in a moment.");
    }
  }

  async function ensureWebLLMReady() {
    if (webllmReady && webllmEngine) return webllmEngine;
    if (webllmLoading) {
      while (webllmLoading) await wait(250);
      return webllmEngine;
    }
    if (!("gpu" in navigator)) throw new Error("WebGPU is not available in this browser.");
    webllmLoading = true;
    try {
      const webllm = await import("https://esm.run/@mlc-ai/web-llm");
      webllmEngine = await webllm.CreateMLCEngine(WEBLLM_MODEL, {
        initProgressCallback: (progress) => console.log("LeadLoop widget WebAI loading:", progress?.text || "", progress?.progress || "")
      });
      webllmReady = true;
      return webllmEngine;
    } finally {
      webllmLoading = false;
    }
  }

  async function generateWebAIReply(userText) {
    const engine = await ensureWebLLMReady();
    const completion = await engine.chat.completions.create({
      messages: [{ role: "system", content: chatbotConfig.systemPrompt || buildSystemPrompt(chatbotConfig) }, ...messages],
      temperature: 0.4
    });
    return completion?.choices?.[0]?.message?.content?.trim() || generateMockReply(userText, chatbotConfig);
  }

  function buildSystemPrompt(config) {
    return `You are the website chatbot for ${config.businessName || "this organization"}.\n\nBusiness type: ${config.industry || "General"}\nTone: ${config.tone || "Friendly and helpful"}\nPrimary goal: ${config.primaryGoal || "Answer customer questions"}\n\nBusiness description:\n${config.businessDescription || "No description provided."}\n\nBusiness hours:\n${config.hours || "Not provided."}\n\nContact info:\n${config.contact || "Not provided."}\n\nCall to action:\n${config.cta || "Contact the organization."}\n\nService areas:\n${config.serviceAreas || "Not provided."}\n\nFrequently asked questions:\n${Array.isArray(config.faqSeeds) && config.faqSeeds.length ? config.faqSeeds.map((q, i) => `${i + 1}. ${q}`).join("\n") : "No FAQs provided."}\n\nInstructions:\n- Be concise, friendly, and helpful.\n- Match the selected tone.\n- Use only the information provided.\n- Do not invent pricing, deadlines, policies, or hours.\n- If unsure, say so and direct the visitor to the contact information.\n- Encourage the CTA when appropriate.`;
  }

  function generateMockReply(message, config) {
    const text = String(message || "").trim();
    const lower = text.toLowerCase();
    const businessName = config.businessName || "our business";
    const tone = String(config.tone || "Friendly and helpful").toLowerCase();
    const goal = String(config.primaryGoal || "Answer customer questions").toLowerCase();
    const hours = config.hours || "";
    const contact = config.contact || "";
    const serviceAreas = config.serviceAreas || "";
    const cta = config.cta || "Contact us to get started";
    const description = config.businessDescription || "";
    const faqs = Array.isArray(config.faqSeeds) ? config.faqSeeds : [];
    const leadFields = config?.leadCapture?.fields || [];
    const include = (words) => words.some(word => lower.includes(word));
    const format = (content) => tone.includes("professional") ? content : tone.includes("warm") ? `Absolutely — ${content}` : tone.includes("confident") ? `Certainly. ${content}` : content;
    const leadPrompt = () => leadFields.length ? `If you'd like, I can help you get started. Please share your ${leadFields.join(", ")}.` : `The best next step is: ${cta}.`;
    if (!text) return format(`Hi! Welcome to ${businessName}. How can I help today?`);
    if (include(["hi","hello","hey","good morning","good afternoon","good evening"])) return format(`Hi! Welcome to ${businessName}. I can help with questions, policies, contact details, and next steps.`);
    if (include(["thanks","thank you","thx"])) return format(`You’re welcome. ${cta ? `If you're ready, ${cta}.` : `Let me know how else I can help.`}`);
    if (include(["hours","open","close","availability","office hours"])) return format(hours ? `${businessName} hours are ${hours}.` : `I don’t see hours listed yet.${contact ? ` You can reach us here: ${contact}.` : ""}`);
    if (include(["contact","phone","email","reach","call","instructor"])) return format(contact ? `You can reach ${businessName} here: ${contact}.` : `I don’t have contact details listed yet, but I can still help with general questions.`);
    if (include(["where","location","located","service area","serve"])) return format(serviceAreas ? `${businessName} serves or focuses on: ${serviceAreas}.` : `I don’t see a location or focus area listed yet.`);
    if (include(["services","offer","what do you do","help with","assignment","course"])) return format(description ? `${businessName} overview: ${description}` : `The owner has not added more detail yet, but I can still help point you in the right direction.`);
    if (include(["price","pricing","cost","how much","quote","rates"])) return format(`I don’t want to invent pricing if it hasn’t been provided.${contact ? ` For exact pricing, please contact us at ${contact}.` : ""} ${leadPrompt()}`);
    if (include(["book","appointment","schedule","reserve","consultation","demo"])) return format(`${cta ? `${cta}.` : "We’d be happy to help you get started."} ${leadPrompt()}`);
    if (include(["interested","get started","sign up","contact me","email me"])) return format(`It sounds like you're interested in the next step. ${leadPrompt()}`);
    const matchedFaq = matchFaq(lower, faqs, description); if (matchedFaq) return format(matchedFaq);
    if (goal.includes("capture leads")) return format(`I’m here to answer questions and help you get started. ${leadPrompt()}`);
    if (goal.includes("book")) return format(`I can help with appointments and next steps. ${cta ? `${cta}.` : leadPrompt()}`);
    return format(`Thanks for reaching out to ${businessName}. I’m here to help with ${goal}.${description ? ` Here’s a quick overview: ${description}` : ""}${cta ? ` Next step: ${cta}.` : ""}`);
  }

  function matchFaq(lower, faqs, description) {
    if (!faqs.length) return null;
    for (const faq of faqs) {
      const faqWords = faq.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const matches = faqWords.filter(w => lower.includes(w));
      if (matches.length >= 2) return `A common question we receive is: "${faq}"${description ? ` Based on our information: ${description}` : ""}`;
    }
    return null;
  }
  function shouldPromptLeadCapture(userText) {
    if (!chatbotConfig.leadCapture?.enabled || state.awaitingLeadCapture) return false;
    return ["price","pricing","cost","quote","book","appointment","consultation","demo","contact","interested","get started"].some(word => userText.toLowerCase().includes(word));
  }
  function buildLeadPrompt() {
    const fields = chatbotConfig.leadCapture?.fields || [];
    return fields.length ? `If you'd like to continue, please share your ${fields.join(", ")}.` : chatbotConfig.cta ? `If you'd like to move forward, ${chatbotConfig.cta}.` : "If you'd like to move forward, please contact us directly.";
  }
  function appendTyping() {
    const id = `typing-${Date.now()}`;
    const wrap = document.getElementById("leadloop-messages");
    const div = document.createElement("div");
    div.className = "leadloop-message assistant";
    div.dataset.typingId = id;
    div.innerHTML = `<div class="leadloop-bubble leadloop-typing"><span></span><span></span><span></span></div>`;
    wrap.appendChild(div);
    wrap.scrollTop = wrap.scrollHeight;
    return id;
  }
  function removeTyping(id) { const el = document.querySelector(`[data-typing-id="${id}"]`); if (el) el.remove(); }
  function appendMessage(role, text) {
    const wrap = document.getElementById("leadloop-messages");
    const div = document.createElement("div");
    div.className = `leadloop-message ${role}`;
    div.innerHTML = `<div class="leadloop-bubble">${escapeHtml(text)}</div>`;
    wrap.appendChild(div);
    wrap.scrollTop = wrap.scrollHeight;
  }
  function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  function escapeHtml(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
  }
})();
