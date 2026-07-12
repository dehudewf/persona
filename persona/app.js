const STORAGE_KEY = "persona-notes-v1";

const samplePeople = [
  {
    id: "lin-xia",
    name: "林夏",
    relation: "合作伙伴",
    knownFor: "1 年 8 个月",
    mbti: "INFJ",
    zodiac: "天秤座",
    traits: ["细致", "有同理心", "先观察后表达", "重视完整性"],
    cares: ["提前了解安排", "承诺被认真对待", "有独处整理的时间"],
    communication: "先交代背景和目的，再给出可以讨论的具体选项。重要决定不适合临时催促。",
    boundaries: "避免公开施压，也不要把沉默直接理解为拒绝。给她一点整理想法的时间。",
    observations: [
      { text: "讨论活动方案时，她先询问参与者是否都能适应时间安排，之后才谈自己的偏好。", date: "2026-07-06", source: "共同策划活动" },
      { text: "面对两个都不错的方案，她更愿意选择后续维护成本更低、对大家影响更稳定的那个。", date: "2026-06-18", source: "项目复盘" }
    ],
    color: "#3d7771"
  },
  {
    id: "zhou-yan",
    name: "周言",
    relation: "同学",
    knownFor: "3 年",
    mbti: "ENTP",
    zodiac: "双子座",
    traits: ["反应快", "好奇", "喜欢讨论", "讨厌重复"],
    cares: ["想法有新意", "保留选择空间", "交流直接高效"],
    communication: "可以先抛出有趣的问题，再谈执行细节。表达结论时最好同时说明思考过程。",
    boundaries: "不要用单一标签概括他，也尽量避免把探索性的想法当作最终承诺。",
    observations: [
      { text: "小组陷入僵局时，他会主动提出一个完全不同的方向，让大家重新开始讨论。", date: "2026-07-01", source: "小组讨论" }
    ],
    color: "#c55743"
  },
  {
    id: "an-ran",
    name: "安然",
    relation: "朋友",
    knownFor: "4 年",
    mbti: "ISFP",
    zodiac: "金牛座",
    traits: ["安静", "务实", "审美敏锐", "重视体验"],
    cares: ["被尊重节奏", "环境是否舒服", "行动比空话重要"],
    communication: "用简单自然的方式说明邀请，给出时间、地点等实际信息，并留出轻松拒绝的空间。",
    boundaries: "不喜欢被追问私人细节。没有立即回应时，通常需要更多时间，而不是态度消极。",
    observations: [
      { text: "她很少直接评价方案，但会通过调整细节让现场更舒服，也会记住别人无意中提过的小偏好。", date: "2026-06-28", source: "朋友聚会" }
    ],
    color: "#5977ad"
  }
];

const state = {
  people: [],
  selectedId: null,
  activeTab: "overview",
  search: "",
  loading: true,
  currentDecisionId: null
};

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
const splitValues = (value) => value.split(/[,，]/).map(item => item.trim()).filter(Boolean);
const getSelected = () => state.people.find(person => person.id === state.selectedId);
const formatDate = (date) => new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(date));

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `请求失败 (${response.status})`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function loadPeople(preferredId = state.selectedId) {
  const { people } = await api("/api/people");
  state.people = people;
  state.selectedId = people.some(person => person.id === preferredId) ? preferredId : people[0]?.id || null;
  state.loading = false;
  return people;
}

function initials(name) {
  return [...name].slice(-2).join("");
}

function personConfidence(person) {
  const observations = person.observations?.length || 0;
  return Math.min(92, 52 + observations * 12 + Math.min(person.traits.length, 4) * 4);
}

function renderPeopleList() {
  const query = state.search.toLowerCase();
  const filtered = state.people.filter(person => [person.name, person.relation, person.mbti, person.zodiac, ...person.traits].join(" ").toLowerCase().includes(query));
  $("#peopleCount").textContent = filtered.length;
  $("#peopleList").innerHTML = filtered.length ? filtered.map(person => `
    <button class="person-list-item ${person.id === state.selectedId ? "active" : ""}" data-person-id="${escapeHtml(person.id)}">
      <span class="mini-avatar" style="background:${escapeHtml(person.color)}">${escapeHtml(initials(person.name))}</span>
      <span class="person-list-copy">
        <strong>${escapeHtml(person.name)}</strong>
        <span>${escapeHtml(person.relation || "未设置关系")} · ${escapeHtml(person.mbti)}</span>
      </span>
      <small>${person.observations?.length || 0} 条</small>
    </button>
  `).join("") : `<div class="decision-empty"><p>没有找到匹配的人物档案。</p></div>`;

  document.querySelectorAll("[data-person-id]").forEach(button => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.personId;
      state.activeTab = "overview";
      render();
      $(".sidebar").classList.remove("open");
    });
  });
}

function traitScores(person) {
  const labels = person.traits.slice(0, 4);
  const values = [84, 76, 68, 61];
  return labels.map((label, index) => ({ label, value: values[index] || 58 }));
}

function overviewTemplate(person) {
  const lead = person.traits.slice(0, 3).join("、") || "仍在慢慢了解中";
  return `
    <div class="overview-grid">
      <div>
        <section class="section-block">
          <div class="section-title"><h3>当前理解</h3><span>创意性格摘要</span></div>
          <blockquote class="summary-quote">“${escapeHtml(person.name)}给人的整体印象是${escapeHtml(lead)}。做决定时，更值得关注的是具体情境和真实表达。”</blockquote>
        </section>
        <section class="section-block">
          <div class="section-title"><h3>观察到的特点</h3><span>不是心理测量结果</span></div>
          ${traitScores(person).map(item => `
            <div class="trait-row">
              <span>${escapeHtml(item.label)}</span>
              <div class="trait-track"><div class="trait-fill" style="width:${item.value}%"></div></div>
              <small>${item.value}</small>
            </div>
          `).join("") || "<p>还没有记录性格特点。</p>"}
        </section>
        <section class="section-block">
          <div class="section-title"><h3>具体观察</h3><span>${person.observations?.length || 0} 条记录</span></div>
          ${(person.observations || []).slice(0, 2).map(item => `
            <div class="observation">
              <span class="observation-dot"></span>
              <div><p>${escapeHtml(item.text)}</p><small>${escapeHtml(item.source)} · ${formatDate(item.date)}</small></div>
            </div>
          `).join("") || "<p>还没有具体观察记录。</p>"}
        </section>
      </div>
      <div>
        <section class="section-block">
          <div class="section-title"><h3>在意的事情</h3><span>优先确认</span></div>
          <div class="chips">${person.cares.map(item => `<span class="care-chip">${escapeHtml(item)}</span>`).join("") || "尚未记录"}</div>
        </section>
        <section class="section-block">
          <div class="section-title"><h3>相处提示</h3><span>基于已有记录</span></div>
          <div class="info-list">
            <div class="info-item"><strong>沟通方式</strong><p>${escapeHtml(person.communication || "尚未记录")}</p></div>
            <div class="info-item"><strong>边界与注意</strong><p>${escapeHtml(person.boundaries || "尚未记录")}</p></div>
            <div class="info-item"><strong>需要继续确认</strong><p>MBTI 和星座只能提供表达线索，重要决定仍应直接询问本人。</p></div>
          </div>
        </section>
      </div>
    </div>`;
}

function timelineTemplate(person) {
  return `<div class="timeline">${(person.observations || []).map((item, index) => `
    <article class="timeline-item">
      <time>${formatDate(item.date)}</time>
      <h3>${escapeHtml(item.context || item.source || `观察 ${index + 1}`)}</h3>
      <p>${escapeHtml(item.fact || item.text)}</p>
      ${item.interpretation ? `<p class="interpretation"><strong>我的理解：</strong>${escapeHtml(item.interpretation)}</p>` : ""}
      <div class="evidence-meta">
        <span>${item.evidenceType === "self_report" ? "本人表达" : item.evidenceType === "inferred" ? "个人推测" : "亲自观察"}</span>
        <span>可信度 ${Number(item.confidence ?? 60)}%</span>
        <button class="text-button compact" data-edit-observation="${escapeHtml(item.id)}">编辑</button>
        <button class="danger-text compact" data-delete-observation="${escapeHtml(item.id)}">删除</button>
      </div>
    </article>
  `).join("") || "<p>编辑档案，加入第一条具体观察。</p>"}</div>`;
}

function visualTemplate(person) {
  const keywords = [...person.traits.slice(0, 2), ...person.cares.slice(0, 1)].join("、");
  const latest = person.images?.[0];
  const stage = latest?.imageUrl
    ? `<img class="generated-portrait" src="${escapeHtml(latest.imageUrl)}" alt="${escapeHtml(person.name)}的虚构人物形象概念" />`
    : `<span class="visual-monogram">${escapeHtml(initials(person.name))}</span>`;
  return `
    <div class="visual-board">
      <div class="visual-stage" style="background:${escapeHtml(person.color)}">${stage}</div>
      <div class="visual-copy">
        <span class="eyebrow coral">CHARACTER DIRECTION</span>
        <h3>${escapeHtml(person.name)}的形象方向</h3>
        <p>这不是对外貌的推断，而是把“${escapeHtml(keywords)}”转译成颜色、场景和象征物，方便以后生成创意人物形象。</p>
        <div class="visual-spec">
          <div><strong>画面风格</strong><span>现代编辑插画</span></div>
          <div><strong>情绪氛围</strong><span>沉静、清楚、有余地</span></div>
          <div><strong>场景建议</strong><span>自然光工作室与纸质笔记</span></div>
          <div><strong>象征元素</strong><span>便签、路径、未完成的圆</span></div>
        </div>
        ${latest?.prompt ? `<details class="prompt-details"><summary>查看生成提示词</summary><p>${escapeHtml(latest.prompt)}</p></details>` : ""}
        <button class="primary-button visual-generate-button" id="generateImageButton">${latest ? "重新生成形象" : "生成形象方案"}</button>
      </div>
    </div>`;
}

function evidenceTemplate(person) {
  const categoryName = { trait: "性格特点", care: "在意事项", communication: "沟通方式", boundary: "边界" };
  return `
    <div class="evidence-layout">
      <section class="evidence-compose">
        <span class="eyebrow coral">EVIDENCE PROFILE</span>
        <h3>建立有依据的画像结论</h3>
        <p>先写暂时结论，再选择支持它的具体观察。结论可以随着新证据被修改或删除。</p>
        <form id="claimForm">
          <label class="field"><span>画像结论</span><input id="claimLabel" required placeholder="例如：在群体决定中重视公平" /></label>
          <div class="claim-fields">
            <label class="field"><span>分类</span><select id="claimCategory"><option value="trait">性格特点</option><option value="care">在意事项</option><option value="communication">沟通方式</option><option value="boundary">边界</option></select></label>
            <label class="field"><span>可信度：<output id="claimConfidenceOutput">60</output>%</span><input id="claimConfidence" type="range" min="0" max="100" value="60" /></label>
          </div>
          <label class="field"><span>补充说明</span><textarea id="claimNotes" rows="2" placeholder="什么情况下这个结论可能不成立？"></textarea></label>
          <fieldset class="evidence-picker"><legend>关联观察证据</legend>
            ${(person.observations || []).map(item => `<label><input type="checkbox" name="claimEvidence" value="${escapeHtml(item.id)}" /><span>${escapeHtml(item.fact || item.text)}</span></label>`).join("") || "<p>先添加一条观察记录，再建立证据关联。</p>"}
          </fieldset>
          <button class="primary-button" type="submit">保存画像结论</button>
        </form>
      </section>
      <section class="claim-list">
        <div class="section-title"><h3>已有结论</h3><span>${person.claims?.length || 0} 条</span></div>
        ${(person.claims || []).map(claim => `
          <article class="claim-card">
            <div class="claim-card-top"><span class="tag accent">${categoryName[claim.category] || "画像"}</span><strong>${escapeHtml(claim.label)}</strong><button class="danger-text compact" data-delete-claim="${escapeHtml(claim.id)}">删除</button></div>
            <div class="claim-meter"><i style="width:${Number(claim.confidence)}%"></i></div>
            <small>可信度 ${Number(claim.confidence)}% · ${claim.evidence.length} 条证据</small>
            ${claim.notes ? `<p>${escapeHtml(claim.notes)}</p>` : ""}
            ${claim.evidence.length ? `<ul>${claim.evidence.map(item => `<li>${escapeHtml(item.fact)}</li>`).join("")}</ul>` : `<p class="weak-note">尚未关联具体证据，建议谨慎使用。</p>`}
          </article>
        `).join("") || `<div class="decision-empty"><p>还没有证据化画像结论。</p></div>`}
      </section>
    </div>`;
}

function historyTemplate(person) {
  return `
    <div class="history-grid">
      <section>
        <div class="section-title"><h3>档案修改历史</h3><span>${person.history?.length || 0} 个版本</span></div>
        ${(person.history || []).map(item => `
          <article class="history-row">
            <time>${formatDate(item.createdAt)}</time>
            <div><strong>${escapeHtml(item.snapshot.name || person.name)}的旧版本</strong><p>${(item.snapshot.traits || []).map(escapeHtml).join("、") || "当时尚未记录性格标签"}</p></div>
          </article>
        `).join("") || `<div class="decision-empty"><p>修改人物基本档案后，这里会保留之前的版本。</p></div>`}
      </section>
      <section>
        <div class="section-title"><h3>决策与反馈</h3><span>${person.decisions?.length || 0} 次</span></div>
        ${(person.decisions || []).map(item => `
          <article class="decision-history-item">
            <time>${formatDate(item.createdAt)}</time><strong>${escapeHtml(item.scenario)}</strong>
            <p>${escapeHtml(item.result?.suggestedOption || "")}</p>
            <span class="feedback-status ${item.outcome || "pending"}">${item.outcome === "helpful" ? "有帮助" : item.outcome === "mixed" ? "部分适用" : item.outcome === "missed" ? "出现偏差" : "等待反馈"}</span>
            ${item.outcomeNotes ? `<small>${escapeHtml(item.outcomeNotes)}</small>` : ""}
          </article>
        `).join("") || `<div class="decision-empty"><p>使用决策镜后，建议和反馈会保存在这里。</p></div>`}
      </section>
    </div>`;
}

function activeTabTemplate(person) {
  if (state.activeTab === "overview") return overviewTemplate(person);
  if (state.activeTab === "timeline") return timelineTemplate(person);
  if (state.activeTab === "evidence") return evidenceTemplate(person);
  if (state.activeTab === "history") return historyTemplate(person);
  return visualTemplate(person);
}

function renderProfile() {
  const person = getSelected();
  if (!person) {
    $("#profileArea").innerHTML = `<div class="empty-profile"><div><h2>还没有人物档案</h2><p>新建一个档案，从具体观察开始记录。</p></div></div>`;
    $("#pageTitle").textContent = "人物档案";
    $("#editPersonButton").disabled = true;
    return;
  }
  $("#editPersonButton").disabled = false;
  $("#pageTitle").textContent = person.name;
  $("#profileArea").innerHTML = `
    <section class="profile-hero">
      <div class="profile-avatar" style="background:${escapeHtml(person.color)}">${escapeHtml(initials(person.name))}</div>
      <div class="profile-copy">
        <span class="eyebrow">CURRENT PERSONA</span>
        <h2>${escapeHtml(person.name)}</h2>
        <p>${escapeHtml(person.relation || "未设置关系")} · 认识 ${escapeHtml(person.knownFor || "时间未记录")}</p>
        <div class="profile-meta">
          <span class="tag accent">${escapeHtml(person.mbti)}</span>
          <span class="tag">${escapeHtml(person.zodiac)}</span>
          ${person.traits.slice(0, 2).map(item => `<span class="tag">${escapeHtml(item)}</span>`).join("")}
        </div>
      </div>
      <div class="certainty"><strong>${personConfidence(person)}%</strong><span>资料完整度</span></div>
    </section>
    <nav class="profile-tabs" aria-label="人物档案内容">
      <button class="profile-tab ${state.activeTab === "overview" ? "active" : ""}" data-tab="overview">人物概览</button>
      <button class="profile-tab ${state.activeTab === "timeline" ? "active" : ""}" data-tab="timeline">观察时间线</button>
      <button class="profile-tab ${state.activeTab === "evidence" ? "active" : ""}" data-tab="evidence">证据画像</button>
      <button class="profile-tab ${state.activeTab === "history" ? "active" : ""}" data-tab="history">历史反馈</button>
      <button class="profile-tab ${state.activeTab === "visual" ? "active" : ""}" data-tab="visual">形象方向</button>
    </nav>
    <div class="tab-panel">${activeTabTemplate(person)}</div>
  `;
  document.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => {
    state.activeTab = button.dataset.tab;
    renderProfile();
  }));
  document.querySelectorAll("[data-delete-observation]").forEach(button => button.addEventListener("click", () => deleteObservation(button.dataset.deleteObservation)));
  document.querySelectorAll("[data-edit-observation]").forEach(button => button.addEventListener("click", () => openObservationModal(person.observations.find(item => item.id === button.dataset.editObservation))));
  document.querySelectorAll("[data-delete-claim]").forEach(button => button.addEventListener("click", () => deleteClaim(button.dataset.deleteClaim)));
  $("#claimForm")?.addEventListener("submit", saveClaim);
  $("#claimConfidence")?.addEventListener("input", event => { $("#claimConfidenceOutput").value = event.target.value; });
  $("#generateImageButton")?.addEventListener("click", generateImage);
}

function render() {
  renderPeopleList();
  renderProfile();
  resetDecision();
}

function resetDecision() {
  $("#decisionOutput").className = "decision-empty";
  $("#decisionOutput").innerHTML = `<span class="empty-symbol">◎</span><p>填写情境后，这里会给出考虑角度、沟通建议和需要确认的问题。</p>`;
}

async function analyzeDecision() {
  const person = getSelected();
  const scenario = $("#scenarioInput").value.trim();
  if (!person || !scenario) {
    showToast("先选择人物并写下一个具体情境");
    return;
  }
  const optionA = $("#optionA").value.trim();
  const optionB = $("#optionB").value.trim();
  try {
    $("#analyzeButton").disabled = true;
    const { result, decisionId } = await api(`/api/people/${person.id}/decisions`, {
      method: "POST", body: JSON.stringify({ scenario, options: [optionA, optionB].filter(Boolean) })
    });
    state.currentDecisionId = decisionId;
    $("#decisionOutput").className = "decision-result";
    $("#decisionOutput").innerHTML = `
      <div class="decision-result-header"><small>针对 ${escapeHtml(person.name)} · 参考度 ${result.confidence}%</small><h3>${escapeHtml(result.headline)}</h3></div>
      <div class="result-section"><strong>优先考虑</strong><p>${result.priorities.map(escapeHtml).join("、") || "对方当下的真实需求"}</p></div>
      <div class="result-section"><strong>建议方向</strong><div class="result-choice">${escapeHtml(result.suggestedOption)}</div></div>
      <div class="result-section"><strong>表达方式</strong><p>${escapeHtml(result.communication)}</p></div>
      <div class="result-section"><strong>需要直接确认</strong><p>${escapeHtml(result.question)} 不要只根据标签替对方作决定。</p></div>
      <div class="decision-feedback">
        <strong>事情结束后，这条建议准确吗？</strong>
        <div><button data-feedback="helpful">有帮助</button><button data-feedback="mixed">部分适用</button><button data-feedback="missed">出现偏差</button></div>
        <textarea id="feedbackNotes" rows="2" placeholder="记录实际结果，帮助以后修正判断"></textarea>
      </div>
    `;
    document.querySelectorAll("[data-feedback]").forEach(button => button.addEventListener("click", () => saveDecisionFeedback(button.dataset.feedback)));
  } catch (error) { showToast(error.message); }
  finally { $("#analyzeButton").disabled = false; }
}

function openPersonModal(person = null) {
  $("#personModal").hidden = false;
  document.body.style.overflow = "hidden";
  $("#modalTitle").textContent = person ? "编辑人物档案" : "新建人物档案";
  $("#deletePersonButton").style.visibility = person ? "visible" : "hidden";
  $("#personId").value = person?.id || "";
  $("#nameInput").value = person?.name || "";
  $("#relationInput").value = person?.relation || "";
  $("#knownForInput").value = person?.knownFor || "";
  $("#mbtiInput").value = person?.mbti || "不确定";
  $("#zodiacInput").value = person?.zodiac || "不确定";
  $("#traitsInput").value = person?.traits?.join("，") || "";
  $("#caresInput").value = person?.cares?.join("，") || "";
  $("#communicationInput").value = person?.communication || "";
  $("#boundariesInput").value = person?.boundaries || "";
  $("#consentInput").value = person?.consentStatus || "not_recorded";
  $("#observationInput").value = "";
  $("#observationContextInput").value = "";
  $("#interpretationInput").value = "";
  $("#evidenceTypeInput").value = "observed";
  $("#confidenceInput").value = "60";
  $("#confidenceOutput").value = "60";
  setTimeout(() => $("#nameInput").focus(), 30);
}

function closePersonModal() {
  $("#personModal").hidden = true;
  document.body.style.overflow = "";
}

async function savePerson(event) {
  event.preventDefault();
  const id = $("#personId").value;
  const existing = state.people.find(person => person.id === id);
  const observationText = $("#observationInput").value.trim();
  const person = {
    name: $("#nameInput").value.trim(),
    relation: $("#relationInput").value.trim(),
    knownFor: $("#knownForInput").value.trim(),
    mbti: $("#mbtiInput").value,
    zodiac: $("#zodiacInput").value,
    traits: splitValues($("#traitsInput").value),
    cares: splitValues($("#caresInput").value),
    communication: $("#communicationInput").value.trim(),
    boundaries: $("#boundariesInput").value.trim(),
    consentStatus: $("#consentInput").value,
    color: existing?.color || ["#3d7771", "#c55743", "#5977ad", "#6d657f"][state.people.length % 4]
  };
  try {
    const response = await api(id ? `/api/people/${id}` : "/api/people", {
      method: id ? "PATCH" : "POST", body: JSON.stringify(person)
    });
    if (observationText) {
      await api(`/api/people/${response.person.id}/observations`, {
        method: "POST",
        body: JSON.stringify({
          fact: observationText,
          context: $("#observationContextInput").value.trim(),
          interpretation: $("#interpretationInput").value.trim(),
          evidenceType: $("#evidenceTypeInput").value,
          confidence: Number($("#confidenceInput").value)
        })
      });
    }
    await loadPeople(response.person.id);
    closePersonModal();
    render();
    showToast(existing ? "档案已更新" : "人物档案已创建");
  } catch (error) { showToast(error.message); }
}

async function deletePerson() {
  const id = $("#personId").value;
  if (!id || !confirm("确定删除这个人物档案吗？此操作无法撤销。")) return;
  try {
    await api(`/api/people/${id}`, { method: "DELETE" });
    await loadPeople();
    closePersonModal();
    render();
    showToast("档案及其关联记录已彻底删除");
  } catch (error) { showToast(error.message); }
}

function exportData() {
  window.location.href = "/api/backup";
  showToast("人物档案已导出");
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      const people = Array.isArray(data) ? data : data.people;
      if (!Array.isArray(people)) throw new Error("invalid");
      if (!confirm(`恢复备份会覆盖当前 ${state.people.length} 个人物档案，确定继续吗？`)) return;
      await api("/api/restore", { method: "POST", body: JSON.stringify({ confirm: true, people }) });
      await loadPeople();
      render();
      showToast(`已恢复 ${people.length} 个人物档案`);
    } catch {
      showToast("恢复失败：请选择识人簿导出的 JSON 备份");
    }
    event.target.value = "";
  };
  reader.readAsText(file);
}

async function deleteObservation(observationId) {
  const person = getSelected();
  if (!person || !confirm("确定删除这条观察记录吗？")) return;
  try {
    await api(`/api/people/${person.id}/observations/${observationId}`, { method: "DELETE" });
    await loadPeople(person.id);
    renderProfile();
    showToast("观察记录已删除");
  } catch (error) { showToast(error.message); }
}

async function generateImage() {
  const person = getSelected();
  if (!person) return;
  const button = $("#generateImageButton");
  button.disabled = true;
  button.textContent = "正在准备形象...";
  try {
    const { image, providerConfigured } = await api(`/api/people/${person.id}/images`, {
      method: "POST", body: JSON.stringify({ style: "现代编辑插画" })
    });
    await loadPeople(person.id);
    renderProfile();
    showToast(providerConfigured && image.imageUrl ? "形象已经生成" : "提示词已生成；配置图片 API Key 后可生成图片");
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
    button.textContent = "生成形象方案";
  }
}

function openObservationModal(observation = null) {
  const person = getSelected();
  if (!person) return;
  $("#observationModal").hidden = false;
  document.body.style.overflow = "hidden";
  $("#observationModalTitle").textContent = observation ? "编辑观察" : "添加观察";
  $("#observationId").value = observation?.id || "";
  $("#observationDate").value = observation?.date || new Date().toISOString().slice(0, 10);
  $("#observationContext").value = observation?.context || "";
  $("#observationFact").value = observation?.fact || "";
  $("#observationInterpretation").value = observation?.interpretation || "";
  $("#observationEvidenceType").value = observation?.evidenceType || "observed";
  $("#observationConfidence").value = String(observation?.confidence ?? 60);
  $("#observationConfidenceOutput").value = String(observation?.confidence ?? 60);
  setTimeout(() => $("#observationFact").focus(), 30);
}

function closeObservationModal() {
  $("#observationModal").hidden = true;
  document.body.style.overflow = "";
}

async function saveObservation(event) {
  event.preventDefault();
  const person = getSelected();
  const id = $("#observationId").value;
  if (!person) return;
  const payload = {
    date: $("#observationDate").value,
    context: $("#observationContext").value.trim(),
    fact: $("#observationFact").value.trim(),
    interpretation: $("#observationInterpretation").value.trim(),
    evidenceType: $("#observationEvidenceType").value,
    confidence: Number($("#observationConfidence").value)
  };
  try {
    await api(id ? `/api/people/${person.id}/observations/${id}` : `/api/people/${person.id}/observations`, {
      method: id ? "PATCH" : "POST", body: JSON.stringify(payload)
    });
    await loadPeople(person.id);
    closeObservationModal();
    state.activeTab = "timeline";
    render();
    showToast(id ? "观察记录已更新" : "新观察已加入人物画像");
  } catch (error) { showToast(error.message); }
}

async function saveClaim(event) {
  event.preventDefault();
  const person = getSelected();
  if (!person) return;
  const observationIds = [...document.querySelectorAll('input[name="claimEvidence"]:checked')].map(input => input.value);
  try {
    await api(`/api/people/${person.id}/claims`, {
      method: "POST",
      body: JSON.stringify({
        label: $("#claimLabel").value.trim(), category: $("#claimCategory").value,
        confidence: Number($("#claimConfidence").value), notes: $("#claimNotes").value.trim(), observationIds
      })
    });
    await loadPeople(person.id);
    renderProfile();
    showToast("画像结论和证据已关联");
  } catch (error) { showToast(error.message); }
}

async function deleteClaim(claimId) {
  const person = getSelected();
  if (!person || !confirm("确定删除这条画像结论吗？原始观察不会被删除。")) return;
  try {
    await api(`/api/people/${person.id}/claims/${claimId}`, { method: "DELETE" });
    await loadPeople(person.id);
    renderProfile();
    showToast("画像结论已删除，原始观察仍保留");
  } catch (error) { showToast(error.message); }
}

async function saveDecisionFeedback(outcome) {
  const person = getSelected();
  if (!person || !state.currentDecisionId) return;
  try {
    await api(`/api/people/${person.id}/decisions/${state.currentDecisionId}/feedback`, {
      method: "PATCH", body: JSON.stringify({ outcome, notes: $("#feedbackNotes")?.value.trim() || "" })
    });
    await loadPeople(person.id);
    document.querySelectorAll("[data-feedback]").forEach(button => button.disabled = true);
    showToast("反馈已保存，之后可以在历史反馈中查看");
  } catch (error) { showToast(error.message); }
}

let toastTimer;
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

$("#searchInput").addEventListener("input", event => { state.search = event.target.value; renderPeopleList(); });
$("#addPersonButton").addEventListener("click", () => openPersonModal());
$("#addObservationButton").addEventListener("click", () => openObservationModal());
$("#editPersonButton").addEventListener("click", () => openPersonModal(getSelected()));
$("#closeModal").addEventListener("click", closePersonModal);
$("#cancelModal").addEventListener("click", closePersonModal);
$("#personModal").addEventListener("click", event => { if (event.target.id === "personModal") closePersonModal(); });
$("#personForm").addEventListener("submit", savePerson);
$("#observationForm").addEventListener("submit", saveObservation);
$("#closeObservationModal").addEventListener("click", closeObservationModal);
$("#cancelObservationModal").addEventListener("click", closeObservationModal);
$("#observationModal").addEventListener("click", event => { if (event.target.id === "observationModal") closeObservationModal(); });
$("#observationConfidence").addEventListener("input", event => { $("#observationConfidenceOutput").value = event.target.value; });
$("#deletePersonButton").addEventListener("click", deletePerson);
$("#analyzeButton").addEventListener("click", analyzeDecision);
$("#exportButton").addEventListener("click", exportData);
$("#importButton").addEventListener("click", () => $("#importInput").click());
$("#importInput").addEventListener("change", importData);
$("#confidenceInput").addEventListener("input", event => { $("#confidenceOutput").value = event.target.value; });
$("#openSidebar").addEventListener("click", () => $(".sidebar").classList.add("open"));
$("#closeSidebar").addEventListener("click", () => $(".sidebar").classList.remove("open"));
document.addEventListener("keydown", event => { if (event.key === "Escape") { closePersonModal(); closeObservationModal(); } });

async function initialize() {
  $("#profileArea").innerHTML = `<div class="empty-profile"><div><h2>正在读取人物档案</h2><p>连接本地数据库...</p></div></div>`;
  try {
    await loadPeople();
    render();
  } catch (error) {
    $("#profileArea").innerHTML = `<div class="empty-profile"><div><h2>无法连接后端</h2><p>${escapeHtml(error.message)}。请使用 npm start 启动完整网站。</p></div></div>`;
    showToast("后端未启动");
  }
}

initialize();
