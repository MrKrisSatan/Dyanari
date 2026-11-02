const $ = (id) => document.getElementById(id),
  token = document.querySelector("meta[name=token]").content;
let state,
  memoryMatches = null,
  privateHistory = [],
  lastPrivate = false;
function notice(t) {
  $("notice").textContent = t;
}
async function api(route, body) {
  const r = await fetch("/api/" + route, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "X-Dyanari-Token": token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const v = await r.json();
  if (v.error) throw Error(v.error);
  return v;
}
function card(parent, text, actions = []) {
  const d = document.createElement("div");
  d.className = "card";
  const p = document.createElement("div");
  p.textContent = text;
  d.append(p);
  for (const [label, fn] of actions) {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = () => safe(fn);
    d.append(b);
  }
  parent.append(d);
}
function message(role, text) {
  const d = document.createElement("div");
  d.className = "message " + role;
  const label = document.createElement("small");
  label.textContent = role === "user" ? "YOU" : "DYANARI";
  const body = document.createElement("div");
  body.textContent = text;
  d.append(label, body);
  $("messages").append(d);
  $("messages").scrollTop = $("messages").scrollHeight;
  return body;
}
async function safe(fn) {
  try {
    await fn();
  } catch (e) {
    notice(e.message);
  }
}
async function updateSettings(v) {
  await api("settings", v);
  await refresh(false);
  notice("Settings saved. Active tasks cancelled.");
}
async function refresh(history = false) {
  state = await api("state");
  const s = state.settings;
  $("internet").checked = s.internet;
  $("toolsEnabled").checked = s.tools;
  $("internetLabel").textContent = s.internet ? "ON" : "OFF";
  $("toolsLabel").textContent = s.tools ? "ON" : "OFF";
  $("health").textContent = state.health
    ? "● Local inference connected"
    : "○ Ollama unavailable";
  $("modelLabel").textContent = s.model;
  $("sharedMemoryStatus").textContent =
    "Shared across all models: " +
    (state.memory?.savedMemories ?? 0) +
    " saved memories · " +
    (state.memory?.storedMessages ?? 0) +
    " stored messages. Changing models preserves identity and memory.";
  $("personalityText").value = s.personality;
  $("context").value = s.context;
  $("temperature").value = s.temperature;
  $("domains").value = s.domains.join(", ");
  $("activeProject").value = s.activeProject || "";
  $("microphoneEnabled").checked = !!s.microphone;
  $("proactiveEnabled").checked = !!s.proactive;
  $("proactiveLabel").textContent = s.proactive ? "ON" : "OFF";
  $("microphoneMain").checked = !!s.microphone;
  $("microphoneLabel").textContent = s.microphone ? "ON" : "OFF";
  $("screenEnabled").checked = !!s.screen;
  $("screenLabel").textContent = s.screen ? "ON" : "OFF";
  $("creativeEnabled").checked = !!s.creative;
  $("speakReplies").checked = !!s.speakReplies;
  if ($("voiceSelect").options.length) $("voiceSelect").value = s.voice;
  renderComputerState(s, state.actions);
  renderDevelopment(s,state.development);
  renderLinkedProjects(s,state.linkedProjects);
  renderMemoryReview(s,state.memoryReview);
  $("quietStart").value = s.quietStart;
  $("quietEnd").value = s.quietEnd;
  $("modelSelect").replaceChildren();
  for (const name of new Set([
    s.model,
    ...state.models
      .filter((x) => !x.capabilities || x.capabilities.includes("completion"))
      .map((x) => x.name),
  ])) {
    const o = document.createElement("option");
    o.value = o.textContent = name;
    o.selected = name === s.model;
    $("modelSelect").append(o);
  }
  $("running").textContent = JSON.stringify(
    state.running.map((x) => ({
      model: x.name,
      VRAM_GB: (x.size_vram / 1e9).toFixed(2),
      context: x.context_length,
    })),
    null,
    2,
  );
  $("details").replaceChildren();
  for (const k of ["read", "create", "edit", "organise"]) {
    const l = document.createElement("label"),
      i = document.createElement("input");
    i.type = "checkbox";
    i.checked = s[k];
    i.onchange = () => safe(() => updateSettings({ [k]: i.checked }));
    l.append(i, document.createTextNode(k + " files"));
    $("details").append(l);
  }
  $("workspaces").replaceChildren();
  s.workspaces.forEach((w, i) =>
    card(
      $("workspaces"),
      w.path + " · " + (w.write ? "Read/write" : "Read-only"),
      [
        [
          "Revoke",
          () =>
            updateSettings({
              workspaces: s.workspaces.filter((_, j) => j !== i),
            }),
        ],
      ],
    ),
  );
  if($('memorySearch').value||$('memoryCategoryFilter').value)memoryMatches=await api('memory/search?query='+encodeURIComponent($('memorySearch').value)+'&category='+encodeURIComponent($('memoryCategoryFilter').value));else memoryMatches=null;
  renderMemories();
  $("logs").replaceChildren();
  state.activity.forEach((a) =>
    card($("logs"), a.stamp + " · " + a.kind + "\n" + a.detail),
  );
  $("revisions").replaceChildren();
  state.revisions.forEach((v) =>
    card($("revisions"), v.stamp + " · " + v.file, [
      [
        "Restore previous text",
        async () => {
          await api("rollback", { id: v.id });
          notice("Restored previous text");
          await refresh();
        },
      ],
    ]),
  );
  $("pendingActions").replaceChildren();
  for (const pending of state.pendingActions || [])
    card($("pendingActions"), "Delete request: " + pending.path, [
      [
        "Move to recovery",
        async () => {
          if (
            confirm(
              "Move this file to Dyanari recovery storage?\n" + pending.path,
            )
          ) {
            await api("confirm-delete", { id: pending.id, approved: true });
            await refresh();
          }
        },
      ],
    ]);
  $("operations").replaceChildren();
  for (const op of state.operations || [])
    card(
      $("operations"),
      op.stamp +
        " · " +
        op.kind +
        "\n" +
        op.source +
        (op.destination ? " → " + op.destination : ""),
      op.undone
        ? []
        : [
            [
              "Undo operation",
              async () => {
                if (
                  confirm(
                    "Undo this " +
                      op.kind +
                      " operation? Recovery refuses changed files and occupied paths.",
                  )
                ) {
                  await api("undo-operation", { id: op.id, approved: true });
                  await refresh();
                }
              },
            ],
          ],
    );
  $("reminders").replaceChildren();
  for (const r of state.reminders || [])
    card(
      $("reminders"),
      r.text +
        "\n" +
        new Date(r.due).toLocaleString() +
        " · " +
        (r.enabled ? "Scheduled" : "Inactive"),
      r.enabled
        ? [
            [
              "Cancel",
              async () => {
                await api("reminder", { action: "cancel", id: r.id });
                await refresh();
              },
            ],
          ]
        : [],
    );
  renderNotifications(state.notifications || []);
  if (history && !$("private").checked) {
    $("messages").replaceChildren();
    for (const m of state.messages) message(m.role, m.content);
  }
}
function renderMemories() {
  $("memories").replaceChildren();
  for (const m of (memoryMatches||state.memories))
    card($("memories"), (m.project ? "[" + m.project + "] " : "") + m.content+'\nCategory: '+m.category+' · Source: '+m.source+' · #'+m.id, [
      [
        "Edit",
        async () => {
          const content = prompt("Correct memory", m.content);
          if (content) {
            const category=prompt('Category: '+state.memoryReview.categories.join(', '),m.category);if(!category)return;
            const project=prompt('Project namespace (blank means global)',m.project);if(project===null)return;
            await api("memory", {
              action: "edit",
              id: m.id,
              content,
              project,
              category,
              expected:m.snapshot,
            });
            await refresh();
          }
        },
      ],
      [
        "Delete",
        async () => {
          if(!confirm('Permanently forget this memory and matching consolidation recovery snapshots?\n\n'+m.content))return;
          await api("memory", { action: "delete", id: m.id,expected:m.snapshot });
          await refresh();
        },
      ],
    ]);
}
document.querySelectorAll("[data-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      document
        .querySelectorAll(".page")
        .forEach((p) => p.classList.toggle("hidden", p.id !== b.dataset.tab));
      document
        .querySelectorAll("[data-tab]")
        .forEach((n) => n.classList.toggle("active", n === b));
      $("title").textContent = b.textContent;
      safe(() => refresh());
    }),
);
$("internet").onchange = () =>
  safe(() => updateSettings({ internet: $("internet").checked }));
$("toolsEnabled").onchange = () =>
  safe(() => updateSettings({ tools: $("toolsEnabled").checked }));
$("stop").onclick = () =>
  safe(async () => {
    $("speechAudio").pause();
    await api("stop", {});
    notice("Cancellation requested");
  });
$("chatForm").onsubmit = (e) => {
  e.preventDefault();
  safe(async () => {
    const text = $("input").value.trim();
    if (!text) return;
    const priv = $("private").checked;
    if (priv !== lastPrivate) {
      $("messages").replaceChildren();
      privateHistory = [];
      lastPrivate = priv;
    }
    message("user", text);
    $("input").value = "";
    $("send").disabled = true;
    const output = message("assistant", "");
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Dyanari-Token": token,
        },
        body: JSON.stringify({ text, private: priv, history: privateHistory }),
      });
      if (!r.ok) throw Error((await r.json()).error);
      const reader = r.body.getReader(),
        decoder = new TextDecoder();
      let pending = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        let i;
        while ((i = pending.indexOf("\n")) >= 0) {
          const line = pending.slice(0, i);
          pending = pending.slice(i + 1);
          if (!line) continue;
          const v = JSON.parse(line);
          if (v.token) output.textContent += v.token;
          if (v.tool)
            notice(
              "Tool " + v.tool + ": " + JSON.stringify(v.result).slice(0, 180),
            );
          if (v.error) throw Error(v.error);
          $("messages").scrollTop = $("messages").scrollHeight;
        }
      }
      if (priv)
        privateHistory.push(
          { role: "user", content: text },
          { role: "assistant", content: output.textContent },
        );
      notice("Ready");
      if (state.settings.speakReplies && output.textContent)
        try {
          await speak(output.textContent.slice(0, 6000));
        } catch (e) {
          notice("Reply ready. Audio: " + e.message);
        }
    } catch (e) {
      output.textContent += "\n[" + e.message + "]";
    } finally {
      $("send").disabled = false;
    }
  });
};
$("private").onchange = () =>
  safe(async () => {
    privateHistory = [];
    lastPrivate = $("private").checked;
    $("messages").replaceChildren();
    if (!lastPrivate) await refresh(true);
    notice(
      lastPrivate
        ? "Private conversation started"
        : "Stored conversation restored",
    );
  });
$("addWorkspace").onclick = () =>
  safe(() =>
    updateSettings({
      workspaces: [
        ...state.settings.workspaces,
        { path: $("workspacePath").value, write: $("workspaceWrite").checked },
      ],
    }),
  );
$("saveDomains").onclick = () =>
  safe(() =>
    updateSettings({
      domains: $("domains")
        .value.split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    }),
  );
$("savePersonality").onclick = () =>
  safe(() => updateSettings({ personality: $("personalityText").value }));
$("characterImport").onchange = () =>
  safe(async () => {
    $("personalityText").value = await $("characterImport").files[0].text();
  });
$("saveModel").onclick = () =>
  safe(async () => {
    await updateSettings({
      model: $("modelSelect").value,
      context: Number($("context").value),
      temperature: Number($("temperature").value),
    });
    notice(
      "Model changed. Shared memory, personality and stored conversations are preserved.",
    );
  });
$("refresh").onclick = () => safe(() => refresh());
$("clearHistory").onclick = () =>
  safe(async () => {
    if (confirm("Delete stored conversation history?")) {
      await api("clear", {});
      await refresh(true);
    }
  });
async function searchMemories(){memoryMatches=await api('memory/search?query='+encodeURIComponent($('memorySearch').value)+'&category='+encodeURIComponent($('memoryCategoryFilter').value));renderMemories()}
$("memorySearch").oninput = ()=>safe(searchMemories);
$('memoryCategoryFilter').onchange=()=>safe(searchMemories);
$("addMemory").onclick = () =>
  safe(async () => {
    await api("memory", {
      content: $("memoryContent").value,
      project: $("memoryProject").value,
      category:$('memoryCategory').value,
    });
    $("memoryContent").value = "";
    await refresh();
  });
$("runTool").onclick = () =>
  safe(async () => {
    $("toolResult").textContent = JSON.stringify(
      await api("tool", {
        name: $("toolName").value,
        arguments: JSON.parse($("toolArgs").value),
      }),
      null,
      2,
    );
    await refresh();
  });
$("backup").onclick = () =>
  safe(async () => {
    const v = await api("backup", { password: $("backupPassword").value });
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(v)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "dyanari-encrypted-backup.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
$("restore").onclick = () =>
  safe(async () => {
    const f = $("restoreFile").files[0];
    if (!f) throw Error("Choose a backup");
    await api("restore", {
      password: $("backupPassword").value,
      backup: JSON.parse(await f.text()),
    });
    await refresh(true);
    notice("Backup merged. Permissions reset to OFF.");
  });
$("download").onclick = () =>
  safe(async () => {
    const r = await fetch("/api/pull", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Dyanari-Token": token },
      body: JSON.stringify({ model: $("downloadModel").value }),
    });
    if (!r.ok) throw Error((await r.json()).error);
    const reader = r.body.getReader(),
      decoder = new TextDecoder();
    while (true) {
      const x = await reader.read();
      if (x.done) break;
      $("downloadStatus").textContent = decoder.decode(x.value).slice(-3000);
    }
    await refresh();
  });
safe(() => refresh(true));
document.querySelector("[data-tab=chat]").classList.add("active");
let audioUrl;
async function speak(text) {
  const r = await fetch("/api/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Dyanari-Token": token },
    body: JSON.stringify({ text, voice: $("voiceSelect").value }),
  });
  if (!r.ok) throw Error((await r.json()).error);
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = URL.createObjectURL(await r.blob());
  $("speechAudio").src = audioUrl;
  await $("speechAudio").play();
}
$("microphoneEnabled").onchange = () =>
  safe(async () => {
    await updateSettings({ microphone: $("microphoneEnabled").checked });
    $("micStatus").textContent = state.settings.microphone
      ? "Microphone: ON (idle)"
      : "Microphone: OFF";
  });
$("listen").onclick = () =>
  safe(async () => {
    if (!state.settings.microphone)
      throw Error("Enable Microphone permission first");
    $("micStatus").textContent = "● Microphone: LISTENING";
    try {
      const v = await api("listen", {});
      $("input").value = v.text;
      notice(
        v.text
          ? "Recognised text is in the chat composer. Review before sending."
          : "No speech recognised",
      );
    } finally {
      $("micStatus").textContent = state.settings.microphone
        ? "Microphone: ON (idle)"
        : "Microphone: OFF";
    }
  });
$("speak").onclick = () => safe(() => speak($("speechText").value));
$("speakLast").onclick = () =>
  safe(() =>
    speak(
      [...document.querySelectorAll(".message.assistant > div")].at(-1)
        ?.textContent || "",
    ),
  );
$("stopSpeech").onclick = () => {
  $("speechAudio").pause();
  safe(() => api("stop", {}));
};
$("speechAudio").onplay = () =>
  document.querySelector(".orb").classList.add("speaking");
$("speechAudio").onpause = $("speechAudio").onended = () =>
  document.querySelector(".orb").classList.remove("speaking");
safe(async () => {
  const vs = await api("voices");
  for (const v of vs) {
    const o = document.createElement("option");
    o.value = v.name;
    o.textContent = v.name + " · " + v.culture;
    $("voiceSelect").append(o);
  }
  if (state) {
    $("voiceSelect").value = state.settings.voice;
    $("microphoneEnabled").checked = !!state.settings.microphone;
    $("micStatus").textContent = state.settings.microphone
      ? "Microphone: ON (idle)"
      : "Microphone: OFF";
  }
});
$("saveProject").onclick = () =>
  safe(async () => {
    await updateSettings({ activeProject: $("activeProject").value.trim() });
    privateHistory = [];
    await refresh(true);
  });
if (window.chrome?.webview) {
  const picker = document.createElement("button");
  picker.textContent = "Choose folder…";
  picker.onclick = () => window.chrome.webview.postMessage("choose-workspace");
  $("addWorkspace").before(picker);
  window.chrome.webview.addEventListener("message", (e) => {
    if (e.data.type === "workspace-picked")
      $("workspacePath").value = e.data.path;
  });
}
for (const name of [
  "search_files",
  "search_text",
  "file_metadata",
  "compare_files",
  "create_directory",
  "copy_file",
  "move_file",
  "request_delete",
]) {
  const o = document.createElement("option");
  o.textContent = name;
  $("toolName").append(o);
}
$("proactiveEnabled").onchange = () =>
  safe(() => updateSettings({ proactive: $("proactiveEnabled").checked }));
$("saveQuiet").onclick = () =>
  safe(() =>
    updateSettings({
      quietStart: Number($("quietStart").value),
      quietEnd: Number($("quietEnd").value),
    }),
  );
$("addReminder").onclick = () =>
  safe(async () => {
    const due = new Date($("reminderDue").value);
    if (!Number.isFinite(due.getTime())) throw Error("Choose a date and time");
    await api("reminder", {
      text: $("reminderText").value,
      due: due.toISOString(),
      repeat_minutes: Number($("reminderRepeat").value),
    });
    await refresh();
  });
const notified = new Set();
function renderNotifications(items) {
  $("notifications").replaceChildren();
  for (const n of items) {
    card(
      $("notifications"),
      n.stamp + " · " + n.text,
      n.seen
        ? []
        : [
            [
              "Dismiss",
              async () => {
                await api("notification-read", { id: n.id });
                renderNotifications(await api("notifications"));
              },
            ],
          ],
    );
    if (!n.seen && !notified.has(n.id)) {
      notified.add(n.id);
      notice("Reminder: " + n.text);
    }
  }
}
setInterval(
  () => safe(async () => renderNotifications(await api("notifications"))),
  5000,
);
$("microphoneMain").onchange = () =>
  safe(() => updateSettings({ microphone: $("microphoneMain").checked }));
$("screenEnabled").onchange = () =>
  safe(() => updateSettings({ screen: $("screenEnabled").checked }));
let visionImage = "";
function previewVision(image) {
  visionImage = image;
  $("visionPreview").src = "data:image/jpeg;base64," + image;
  $("visionPreview").hidden = false;
}
$("visionFile").onchange = () =>
  safe(async () => {
    const file = $("visionFile").files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) throw Error("Image must be under 20 MB");
    const bitmap = await createImageBitmap(file),
      canvas = document.createElement("canvas");
    canvas.width = Math.min(1024, bitmap.width);
    canvas.height = Math.round((bitmap.height * canvas.width) / bitmap.width);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    previewVision(canvas.toDataURL("image/jpeg", 0.7).split(",")[1]);
  });
$("captureScreen").onclick = () =>
  safe(async () => {
    if (!state.settings.screen) throw Error("Screen Vision is OFF");
    if (!window.chrome?.webview)
      throw Error("Screen capture is available in Dyanari.exe");
    notice("Capturing primary display once…");
    window.chrome.webview.postMessage("capture-screen:" + token);
  });
window.chrome?.webview?.addEventListener("message", (e) => {
  if (e.data.type === "screen-captured") {
    previewVision(e.data.image);
    notice("Screen captured locally. Review the preview before inspection.");
  }
  if (e.data.type === "capture-error") notice(e.data.error);
});
$("inspectImage").onclick = () =>
  safe(async () => {
    if (!visionImage) throw Error("Choose or capture an image first");
    $("visionResult").textContent = "Inspecting with local Qwen3-VL…";
    try {
      $("visionResult").textContent = (
        await api("vision", {
          image: visionImage,
          prompt: $("visionPrompt").value,
        })
      ).text;
    } catch (e) {
      $("visionResult").textContent = e.message;
      throw e;
    }
  });
$("creativeEnabled").onchange = () =>
  safe(() => updateSettings({ creative: $("creativeEnabled").checked }));
$("voiceSelect").onchange = () =>
  safe(() => updateSettings({ voice: $("voiceSelect").value }));
$("speakReplies").onchange = () =>
  safe(() => updateSettings({ speakReplies: $("speakReplies").checked }));
$("startCreative").onclick = () =>
  safe(async () => {
    const result = await api("creative/start", {});
    $("creativeStatus").textContent = result.starting
      ? "ComfyUI is starting; refresh in a few seconds."
      : "Local service is running";
  });
const artworkUrls = new Set();
async function refreshCreative() {
  const v = await api("creative/state");
  $("creativeStatus").textContent = v.available
    ? v.job
      ? "Generating: " + v.job.status
      : "Local ComfyUI connected"
    : "Local ComfyUI is not running";
  const selected = $("checkpoint").value;
  $("checkpoint").replaceChildren();
  for (const name of v.checkpoints) {
    const o = document.createElement("option");
    o.value = o.textContent = name;
    o.selected = name === selected;
    $("checkpoint").append(o);
  }
  for (const url of artworkUrls) URL.revokeObjectURL(url);
  artworkUrls.clear();
  $("artworkLibrary").replaceChildren();
  for (const art of v.artworks) {
    const r = await fetch("/api/artwork?id=" + encodeURIComponent(art.id), {
      headers: { "X-Dyanari-Token": token },
    });
    if (!r.ok) continue;
    const url = URL.createObjectURL(await r.blob());
    artworkUrls.add(url);
    const div = document.createElement("div");
    div.className = "card";
    const img = document.createElement("img");
    img.src = url;
    img.alt = art.prompt;
    img.className = "generatedImage";
    const caption = document.createElement("p");
    caption.textContent = art.prompt;
    const a = document.createElement("a");
    a.href = url;
    a.download = "Dyanari-" + art.id + ".png";
    a.textContent = "Save image";
    div.append(img, caption, a);
    $("artworkLibrary").append(div);
  }
}
$("refreshCreative").onclick = () => safe(refreshCreative);
$("generateImage").onclick = () =>
  safe(async () => {
    $("generateImage").disabled = true;
    $("creativeStatus").textContent =
      "Generating locally — the first checkpoint load can take a minute.";
    try {
      await api("creative/generate", {
        prompt: $("imagePrompt").value,
        negative: $("imageNegative").value,
        checkpoint: $("checkpoint").value,
        width: Number($("imageSize").value),
        height: Number($("imageSize").value),
        steps: Number($("imageSteps").value),
        seed: Number($("imageSeed").value),
      });
      await refreshCreative();
      notice("Image generated and saved locally.");
    } finally {
      $("generateImage").disabled = false;
    }
  });
function choices(parent, values, selected, key) {
  parent.replaceChildren();
  for (const value of values) {
    const label = document.createElement("label"),
      input = document.createElement("input");
    input.type = "checkbox";
    input.checked = selected.includes(value);
    input.onchange = () =>
      safe(() =>
        updateSettings({
          [key]: input.checked
            ? [...new Set([...state.settings[key], value])]
            : state.settings[key].filter((v) => v !== value),
        }),
      );
    label.append(
      input,
      document.createTextNode(" " + value.replaceAll("_", " ")),
    );
    parent.append(label);
  }
}
function renderComputerState(s, actions) {
  $("computerEnabled").checked = !!s.computer;
  $("computerLabel").textContent = s.computer ? "ON" : "OFF";
  $("runToolsEnabled").checked = !!s.runTools;
  $("computerMode").value = s.computerMode || "observe";
  choices(
    $("approvedApps"),
    actions?.supportedApps || [],
    s.approvedApps || [],
    "approvedApps",
  );
  choices(
    $("approvedWorkflows"),
    actions?.supportedWorkflows || [],
    s.approvedWorkflows || [],
    "approvedWorkflows",
  );
  $("actionHelperStatus").textContent = actions?.available
    ? "Native Windows action helper installed"
    : "Native action helper unavailable";
  $("windowGrants").replaceChildren();
  for (const w of actions?.grants || [])
    card($("windowGrants"), w.app + " · " + w.title + "\n" + w.id, [
      [
        "Inspect",
        async () => {
          $("windowInspection").textContent = JSON.stringify(
            await api("tool", {
              name: "inspect_window",
              arguments: { window: w.id },
            }),
            null,
            2,
          );
        },
      ],
      [
        "Revoke",
        async () => {
          await api("actions/revoke", { window: w.id });
          await refresh();
        },
      ],
    ]);
  $("computerApprovals").replaceChildren();
  for (const p of actions?.pending || [])
    card($("computerApprovals"), p.summary, [
      [
        "Approve this action",
        async () => {
          if (
            confirm("Execute this specific computer action?\n\n" + p.summary)
          ) {
            const result = await api("actions/confirm", {
              id: p.id,
              approved: true,
            });
            $("windowInspection").textContent = JSON.stringify(result, null, 2);
            await refresh();
            notice("Computer action returned a verified execution result.");
          }
        },
      ],
      [
        "Reject",
        async () => {
          await api("actions/reject", { id: p.id });
          await refresh();
        },
      ],
    ]);
}
$("computerEnabled").onchange = () =>
  safe(() => updateSettings({ computer: $("computerEnabled").checked }));
$("runToolsEnabled").onchange = () =>
  safe(() => updateSettings({ runTools: $("runToolsEnabled").checked }));
$("computerMode").onchange = () =>
  safe(() => updateSettings({ computerMode: $("computerMode").value }));
$("listWindows").onclick = () =>
  safe(async () => {
    const result = await api("actions/windows", {});
    $("windowsList").replaceChildren();
    for (const w of result.windows)
      card(
        $("windowsList"),
        w.app + " · " + w.title + "\n" + w.id,
        w.authorised
          ? []
          : [
              [
                "Authorise this window",
                async () => {
                  await api("actions/grant", { window: w.id, approved: true });
                  await refresh();
                },
              ],
            ],
      );
    if (!result.windows.length)
      notice("No visible windows from the approved applications were found.");
  });
$("checkFile").onclick = () =>
  safe(async () => {
    $("checkResult").textContent = JSON.stringify(
      await api("tool", {
        name: "check_project_file",
        arguments: { path: $("checkFilePath").value },
      }),
      null,
      2,
    );
    await refresh();
  });
for (const name of [
  "list_windows",
  "inspect_window",
  "open_application",
  "set_control_text",
  "invoke_control",
  "create_workspace_note",
  "check_project_file",
  "calculator_sum",
]) {
  const option = document.createElement("option");
  option.textContent = name;
  $("toolName").append(option);
}

function renderDevelopment(s, dev) {
  $('gitAccess').checked=!!s.gitAccess;$('githubAccess').checked=!!s.githubAccess;$('developmentAccess').checked=!!s.development;
  if(document.activeElement!==$('githubRepositories'))$('githubRepositories').value=(s.githubRepositories||[]).join('\n');
  if(document.activeElement!==$('gitAuthorName'))$('gitAuthorName').value=s.gitAuthorName||'';
  if(document.activeElement!==$('gitAuthorEmail'))$('gitAuthorEmail').value=s.gitAuthorEmail||'';
  $('developmentTools').textContent=Object.entries(dev?.available||{}).map(([name,file])=>name+': '+(file?'installed':'not installed')).join(' · ');
  $('projectRecipes').replaceChildren();
  for(const r of s.projectRecipes||[])card($('projectRecipes'),r.name+'\n'+r.path+'\n'+r.tool+' '+JSON.stringify(r.args),[
    ['Preview run',async()=>{const result=await api('tool',{name:'run_project_recipe',arguments:{id:r.id}});notice(result.message);await refresh()}],
    ['Remove recipe',async()=>updateSettings({projectRecipes:state.settings.projectRecipes.filter(x=>x.id!==r.id)})]
  ]);
  $('developmentApprovals').replaceChildren();
  for(const p of dev?.pending||[])card($('developmentApprovals'),p.summary,[
    ['Approve this operation',async()=>{if(!confirm('Execute this exact operation?\n\n'+p.summary))return;notice('Executing approved operation…');
      const timer=setInterval(()=>safe(()=>refresh()),1500);
      try{const result=await api('development/confirm',{id:p.id,approved:true});$('developmentInspection').textContent=JSON.stringify(result,null,2);notice(result.passed===false?'Operation failed. Inspect exit code and logs.':'Operation finished; inspect the result.');}finally{clearInterval(timer);await refresh()}}],
    ['Reject',async()=>{await api('development/reject',{id:p.id});await refresh()}]
  ]);
  $('developmentRuns').replaceChildren();
  for(const run of dev?.runs||[])card($('developmentRuns'),run.name+' · '+run.status+' · '+run.started+'\n'+(run.error||'')+'\n'+(run.result?.exitCode!==undefined?'Exit code: '+run.result.exitCode+'\n':'')+(run.output||''));
}
for(const [id,key]of [['gitAccess','gitAccess'],['githubAccess','githubAccess'],['developmentAccess','development']])$(id).onchange=()=>safe(()=>updateSettings({[key]:$(id).checked}));
$('saveGithubRepositories').onclick=()=>safe(()=>updateSettings({githubRepositories:$('githubRepositories').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)}));
$('githubAccount').onclick=()=>safe(async()=>{$('githubAccountResult').textContent=JSON.stringify(await api('development/account',{}),null,2)});
$('saveGitAuthor').onclick=()=>safe(()=>updateSettings({gitAuthorName:$('gitAuthorName').value,gitAuthorEmail:$('gitAuthorEmail').value}));
for(const [id,name]of [['developmentStatus','git_status'],['developmentDiff','git_diff']])$(id).onclick=()=>safe(async()=>{$('developmentInspection').textContent=JSON.stringify(await api('tool',{name,arguments:{path:$('developmentRepo').value}}),null,2)});
$('addProjectRecipe').onclick=()=>safe(()=>updateSettings({projectRecipes:[...(state.settings.projectRecipes||[]),{id:crypto.randomUUID(),name:$('recipeName').value,path:$('recipePath').value,tool:$('recipeTool').value,args:JSON.parse($('recipeArgs').value),timeoutSeconds:Number($('recipeTimeout').value)}]}));
$('refreshDevelopment').onclick=()=>safe(()=>refresh());

function renderLinkedProjects(s, linked) {
 $('linkedProjectsEnabled').checked=!!s.linkedProjectsEnabled;
 const selected=$('linkedProjectSelect').value;$('linkedProjectSelect').replaceChildren();$('linkedProjectList').replaceChildren();
 for(const p of linked?.projects||[]){
  const option=document.createElement('option');option.value=p.id;option.textContent=p.name;$('linkedProjectSelect').append(option);
  const box=document.createElement('div');box.className='card';$('linkedProjectList').append(box);
  card(box,p.name+' · '+(p.connected?'connected ('+p.toolCount+' tools)':p.installed?'stopped':'not installed')+'\n'+p.path,[
   ['Install REA',async()=>{const r=await api('tool',{name:'install_linked_project',arguments:{id:p.id}});notice(r.message);await refresh()}],
   ['Start / connect',async()=>{const r=await api('tool',{name:'start_linked_project',arguments:{id:p.id}});notice(r.message);await refresh()}],
   ['Stop',async()=>{await api('tool',{name:'stop_linked_project',arguments:{id:p.id}});await refresh()}],
   ['Unlink',async()=>updateSettings({linkedProjects:state.settings.linkedProjects.filter(x=>x.id!==p.id)})]
  ]);
  const label=document.createElement('label');label.textContent='Allowed tool names (one per line)';const allowed=document.createElement('textarea');allowed.value=p.approvedTools.join('\n');label.append(allowed);box.append(label);
  const save=document.createElement('button');save.textContent='Save tool access';save.onclick=()=>safe(()=>updateSettings({linkedProjects:state.settings.linkedProjects.map(x=>x.id===p.id?{...x,approvedTools:allowed.value.split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}:x)}));box.append(save);
  const logs=document.createElement('details');const title=document.createElement('summary');title.textContent='Server logs';const pre=document.createElement('pre');pre.textContent=p.log;logs.append(title,pre);box.append(logs);
 }
 if([...$('linkedProjectSelect').options].some(o=>o.value===selected))$('linkedProjectSelect').value=selected;
 $('linkedProjectApprovals').replaceChildren();
 for(const p of linked?.pending||[])card($('linkedProjectApprovals'),p.summary,[
  ['Approve exact operation',async()=>{if(!confirm('Execute this exact external project operation?\n\n'+p.summary))return;const timer=setInterval(()=>safe(()=>refresh()),2000);try{$('linkedToolResult').textContent=JSON.stringify(await api('linked-projects/confirm',{id:p.id,approved:true}),null,2)}finally{clearInterval(timer);await refresh()}}],
  ['Reject',async()=>{await api('linked-projects/reject',{id:p.id});await refresh()}]
 ]);
 $('linkedProjectRuns').replaceChildren();for(const r of linked?.runs||[])card($('linkedProjectRuns'),r.operation+' · '+r.status+'\n'+(r.error||'')+'\n'+(r.output||'')+'\n'+(r.result?JSON.stringify(r.result,null,2):''));
}
$('linkedProjectsEnabled').onchange=()=>safe(()=>updateSettings({linkedProjectsEnabled:$('linkedProjectsEnabled').checked}));
$('addReaProject').onclick=()=>safe(()=>updateSettings({linkedProjects:[...(state.settings.linkedProjects||[]),{id:crypto.randomUUID(),kind:'rea',name:'REA 6.8.0',path:$('linkedProjectPath').value,tool:'node',args:['mcp'],approvedTools:[],timeoutSeconds:180}]}));
$('addLocalLinkedProject').onclick=()=>safe(()=>updateSettings({linkedProjects:[...(state.settings.linkedProjects||[]),{id:crypto.randomUUID(),kind:'local',name:$('linkedProjectName').value,path:$('linkedProjectPath').value,tool:$('linkedProjectTool').value,args:JSON.parse($('linkedProjectArgs').value),approvedTools:[],timeoutSeconds:180}]}));
$('discoverLinkedTools').onclick=()=>safe(async()=>{$('linkedToolCatalog').textContent=JSON.stringify(await api('tool',{name:'list_linked_project_tools',arguments:{id:$('linkedProjectSelect').value,query:$('linkedToolQuery').value}}),null,2)});
$('previewLinkedTool').onclick=()=>safe(async()=>{JSON.parse($('linkedToolArguments').value);const r=await api('tool',{name:'call_linked_project_tool',arguments:{id:$('linkedProjectSelect').value,tool:$('linkedToolName').value,arguments_json:$('linkedToolArguments').value}});notice(r.message);await refresh()});
$('refreshLinkedProjects').onclick=()=>safe(()=>refresh());

function renderMemoryReview(s, review) {
 $('memorySuggestionsEnabled').checked=!!s.memorySuggestionsEnabled;
 if(!$('memoryCategory').options.length)for(const category of review?.categories||[]){const a=document.createElement('option');a.value=a.textContent=category;$('memoryCategory').append(a);const b=a.cloneNode(true);$('memoryCategoryFilter').append(b)}
 $('memorySuggestions').replaceChildren();
 for(const p of review?.suggestions||[])card($('memorySuggestions'),'Suggested, not saved · '+p.category+' · '+(p.project||'global')+'\n'+p.content+'\nSource: your non-private message\n'+p.evidence,[
  ['Approve memory',async()=>{await api('memory/review',{action:'approve',id:p.id,approved:true});await refresh()}],
  ['Correct then approve',async()=>{const content=prompt('Correct the suggested memory',p.content);if(!content)return;const category=prompt('Category: '+(review.categories||[]).join(', '),p.category);if(!category)return;await api('memory/review',{action:'approve',id:p.id,content,category,project:p.project,approved:true});await refresh()}],
  ['Dismiss',async()=>{await api('memory/review',{action:'dismiss',id:p.id});await refresh()}]
 ]);
 $('memoryMergeHistory').replaceChildren();for(const merge of review?.merges||[])card($('memoryMergeHistory'),'Consolidation #'+merge.id+' · '+merge.stamp+(merge.undone?' · undone':''),merge.undone?[]:[['Undo consolidation',async()=>{if(!confirm('Restore the original memories? Undo refuses if the consolidated memory was changed.'))return;await api('memory/review',{action:'undo-merge',id:merge.id,approved:true});await refresh()}]]);
}
$('memorySuggestionsEnabled').onchange=()=>safe(()=>updateSettings({memorySuggestionsEnabled:$('memorySuggestionsEnabled').checked}));
$('suggestRecentMemories').onclick=()=>safe(async()=>{const result=await api('memory/review',{action:'recent'});notice(result.created+' suggestions queued for review.');await refresh()});
$('findMemoryDuplicates').onclick=()=>safe(async()=>{const pairs=await api('memory/review',{action:'duplicates'});$('memoryDuplicates').replaceChildren();if(!pairs.length)card($('memoryDuplicates'),'No related wording found in the bounded scan.');for(const pair of pairs)card($('memoryDuplicates'),(pair.project||'Global')+' · Similar wording, not necessarily the same fact\n'+pair.contents.join('\n---\n'),[['Preview consolidation',async()=>{const content=prompt('Enter the corrected consolidated fact. Check for contradictions first.',pair.contents[0]);if(!content)return;const category=prompt('Memory category', 'general');if(!category)return;const preview=await api('memory/review',{action:'preview-merge',ids:pair.ids,content,category});if(!confirm('Replace these memories?\n\n'+preview.before.map(m=>m.content).join('\n')+'\n\nWith:\n'+preview.after.content+'\nProject: '+(preview.after.project||'global')))return;await api('memory/review',{action:'confirm-merge',id:preview.id,approved:true});$('memoryDuplicates').replaceChildren();await refresh()}]])});
$('clearMemoryMergeHistory').onclick=()=>safe(async()=>{if(!confirm('Permanently remove consolidation recovery copies? Saved memories remain, but these merges cannot be undone.'))return;await api('memory/review',{action:'clear-merge-history',approved:true});await refresh()});
$('exportMemories').onclick=()=>safe(async()=>{const data=await api('memory/export');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='dyanari-memories.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
