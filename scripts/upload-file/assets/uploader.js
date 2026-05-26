(() => {
  const CONFIG = JSON.parse(
    document.getElementById("uploader-config").textContent,
  );
  const URL_PREFIX = CONFIG.urlPrefix;

  const $ = (id) => document.getElementById(id);
  const fileListEl = $("fileList");
  const emptyStateEl = $("emptyState");
  const fileViewEl = $("fileView");
  const previewModeEl = $("previewMode");
  const editModeEl = $("editMode");
  const editBtnEl = $("editBtn");
  const renameBtnEl = $("renameBtn");
  const deleteBtnEl = $("deleteBtn");
  const otherArticlesToggleEl = $("otherArticlesToggle");
  const otherArticlesBodyEl = $("otherArticlesBody");
  const otherCountBadgeEl = $("otherCountBadge");
  const renameInputEl = $("renameInput");
  const fileMetaEl = $("fileMeta");
  const fileTypeIconEl = $("fileTypeIcon");
  const previewAreaEl = $("previewArea");
  const mdCodeEl = $("mdCode");
  const dropOverlayEl = $("dropOverlay");
  const toastEl = $("toast");
  const editImageEl = $("editImage");
  const moveBtnEl = $("moveBtn");
  const moveDropdownEl = $("moveDropdown");
  const mkdirBtnEl = $("mkdirBtn");
  const renameExtEl = $("renameExt");

  let files = [];
  let folders = [];
  let folderFiles = {};
  let expandedFolders = new Set();
  let selected = null;
  let mode = "preview"; // 'preview' | 'edit'
  let cropper = null;
  let editFlipX = 1;
  let editFlipY = 1;
  let otherArticles = null; // null = 未取得
  let otherFilesCache = {};
  const NUDGE_STEP = 1;
  const NUDGE_STEP_BIG = 10;
  const ZOOM_STEP = 0.1;

  // ---------- toast ----------
  let toastTimer = null;
  function toast(msg, type = "info") {
    const iconName =
      type === "success"
        ? "check_circle"
        : type === "error"
          ? "error"
          : "info";
    toastEl.replaceChildren();
    const i = document.createElement("span");
    i.className = "icon";
    i.setAttribute("aria-hidden", "true");
    i.textContent = iconName;
    toastEl.appendChild(i);
    const t = document.createElement("span");
    t.textContent = msg;
    toastEl.appendChild(t);
    toastEl.className = "toast show " + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("show");
    }, 3500);
  }

  // ---------- formatting ----------
  function formatSize(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  }
  function formatDate(ms) {
    const d = new Date(ms);
    const jst = new Date(d.getTime() + d.getTimezoneOffset() * 60000 + 9 * 60 * 60000);
    const pad = (x) => String(x).padStart(2, "0");
    return `${jst.getFullYear()}-${pad(jst.getMonth() + 1)}-${pad(jst.getDate())} ${pad(jst.getHours())}:${pad(jst.getMinutes())}`;
  }
  function iconForKind(kind, mime) {
    if (kind === "image") return "image";
    if (kind === "video") return "movie";
    if (kind === "audio") return "music_note";
    if (kind === "pdf") return "picture_as_pdf";
    if (mime === "image/svg+xml") return "code";
    return "draft";
  }

  // ---------- API ----------
  async function api(path, opts = {}) {
    const res = await fetch(path, opts);
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* non-json */
    }
    if (!res.ok || body?.error) {
      throw new Error(body?.error || res.statusText);
    }
    return body;
  }

  // ---------- tree rendering ----------
  function makeTreeItem(f, folder) {
    const li = document.createElement("li");
    li.className = `tree-item kind-${f.kind}${folder ? " tree-item-sub" : ""}`;
    li.dataset.name = f.name;
    if (folder) li.dataset.folder = folder;

    const isActive =
      selected &&
      selected.name === f.name &&
      (selected.folder || "") === folder &&
      (!selected.articleId || selected.articleId === CONFIG.articleId);
    if (isActive) li.classList.add("is-active");

    const icon = document.createElement("span");
    icon.className = "icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = iconForKind(f.kind, f.mime);
    li.appendChild(icon);

    const name = document.createElement("span");
    name.className = "tree-item-name";
    name.textContent = f.name;
    name.title = f.name;
    li.appendChild(name);

    const size = document.createElement("span");
    size.className = "tree-item-size";
    size.textContent = formatSize(f.size);
    li.appendChild(size);

    li.addEventListener("click", () => selectFile(f.name, folder));
    return li;
  }

  function renderTree() {
    fileListEl.replaceChildren();
    if (files.length === 0 && folders.length === 0) {
      const li = document.createElement("li");
      li.className = "tree-empty";
      li.textContent = "(ファイルなし)";
      fileListEl.appendChild(li);
      return;
    }

    for (const folder of folders) {
      const isExpanded = expandedFolders.has(folder.name);

      const li = document.createElement("li");
      li.className = "tree-item tree-folder-item";
      li.dataset.folder = folder.name;

      const chevron = document.createElement("span");
      chevron.className = `icon folder-chevron${isExpanded ? " is-expanded" : ""}`;
      chevron.setAttribute("aria-hidden", "true");
      chevron.textContent = "chevron_right";
      li.appendChild(chevron);

      const icon = document.createElement("span");
      icon.className = "icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = isExpanded ? "folder_open" : "folder";
      li.appendChild(icon);

      const nameEl = document.createElement("span");
      nameEl.className = "tree-item-name";
      nameEl.textContent = folder.name + "/";
      li.appendChild(nameEl);

      const count = document.createElement("span");
      count.className = "tree-item-size";
      count.textContent = String(folder.fileCount);
      li.appendChild(count);

      li.addEventListener("click", () => toggleFolder(folder.name));
      fileListEl.appendChild(li);

      if (isExpanded) {
        for (const f of folderFiles[folder.name] ?? []) {
          fileListEl.appendChild(makeTreeItem(f, folder.name));
        }
      }
    }

    for (const f of files) {
      fileListEl.appendChild(makeTreeItem(f, ""));
    }
  }

  async function toggleFolder(folderName) {
    if (expandedFolders.has(folderName)) {
      expandedFolders.delete(folderName);
      renderTree();
      return;
    }
    expandedFolders.add(folderName);
    if (!folderFiles[folderName]) {
      renderTree();
      try {
        const data = await api(`/api/files?subfolder=${encodeURIComponent(folderName)}`);
        folderFiles[folderName] = data.files;
      } catch (err) {
        expandedFolders.delete(folderName);
        toast("フォルダの読み込みに失敗: " + err.message, "error");
      }
    }
    renderTree();
  }

  async function loadFiles(preserveSelectedName, preserveSelectedFolder = "") {
    const data = await api("/api/files");
    files = data.files;
    folders = data.folders ?? [];
    // フォルダキャッシュをリセット (展開済みのみ再取得)
    const toRefresh = [...expandedFolders];
    folderFiles = {};
    for (const fn of toRefresh) {
      try {
        const d = await api(`/api/files?subfolder=${encodeURIComponent(fn)}`);
        folderFiles[fn] = d.files;
      } catch { expandedFolders.delete(fn); }
    }

    if (preserveSelectedName !== undefined) {
      if (!preserveSelectedFolder) {
        const found = files.find((f) => f.name === preserveSelectedName);
        selected = found ? { ...found, folder: "", articleId: CONFIG.articleId } : null;
      } else {
        const subFiles = folderFiles[preserveSelectedFolder] ?? [];
        const found = subFiles.find((f) => f.name === preserveSelectedName);
        if (found) {
          selected = { ...found, folder: preserveSelectedFolder, articleId: CONFIG.articleId };
          expandedFolders.add(preserveSelectedFolder);
        } else {
          selected = null;
        }
      }
    }
    renderTree();
    if (selected) renderFileView();
    else showEmptyState();
  }

  // ---------- selection / view ----------
  function selectFile(name, folder = "") {
    const pool = folder ? (folderFiles[folder] ?? []) : files;
    const f = pool.find((x) => x.name === name);
    if (!f) return;
    selected = { ...f, folder, articleId: CONFIG.articleId };
    otherArticlesBodyEl
      .querySelectorAll(".tree-item.is-active")
      .forEach((el) => el.classList.remove("is-active"));
    renderTree();
    renderFileView();
  }

  function showEmptyState() {
    emptyStateEl.hidden = false;
    fileViewEl.hidden = true;
  }

  function renderFileView() {
    if (!selected) { showEmptyState(); return; }
    if (mode === "edit") exitEditMode({ silent: true });
    emptyStateEl.hidden = true;
    fileViewEl.hidden = false;

    const isMine = !selected.articleId || selected.articleId === CONFIG.articleId;
    const articleId = selected.articleId || CONFIG.articleId;
    const folder = selected.folder || "";

    // 拡張子を除いたベース名のみ入力欄に表示
    const ext = selected.name.match(/(\.[^.]+)$/)?.[1] ?? "";
    const base = selected.name.slice(0, selected.name.length - ext.length);
    renameInputEl.value = base;
    renameInputEl.readOnly = !isMine;
    renameExtEl.textContent = ext;

    fileTypeIconEl.textContent = iconForKind(selected.kind, selected.mime);
    fileMetaEl.textContent = `${isMine ? "" : `[${articleId}] · `}${folder ? folder + "/" : ""}${formatSize(selected.size)} / ${formatDate(selected.mtime)}`;
    editBtnEl.hidden = selected.kind !== "image" || !isMine;
    renameBtnEl.hidden = !isMine;
    deleteBtnEl.hidden = !isMine;
    moveBtnEl.hidden = !isMine || (folders.length === 0 && !folder);

    const filePath = folder ? `${folder}/${selected.name}` : selected.name;
    const folderParam = folder ? `&folder=${encodeURIComponent(folder)}` : "";
    const idParam = (selected.articleId && selected.articleId !== CONFIG.articleId)
      ? `id=${encodeURIComponent(articleId)}&` : "";
    const apiUrl = `/api/file?${idParam}name=${encodeURIComponent(selected.name)}${folderParam}&_t=${Date.now()}`;
    const publicUrl = `/files/${articleId}/${filePath}`;

    previewAreaEl.replaceChildren();
    if (selected.kind === "image") {
      const img = document.createElement("img");
      img.src = apiUrl;
      img.alt = selected.name;
      previewAreaEl.appendChild(img);
    } else if (selected.kind === "video") {
      const v = document.createElement("video");
      v.src = apiUrl;
      v.controls = true;
      previewAreaEl.appendChild(v);
    } else if (selected.kind === "audio") {
      const a = document.createElement("audio");
      a.src = apiUrl;
      a.controls = true;
      previewAreaEl.appendChild(a);
    } else if (selected.kind === "pdf") {
      const i = document.createElement("iframe");
      i.src = apiUrl;
      previewAreaEl.appendChild(i);
    } else {
      const ph = document.createElement("div");
      ph.className = "preview-placeholder";
      ph.innerHTML = `<span class="icon" aria-hidden="true">draft</span>このファイル形式はプレビューできません`;
      previewAreaEl.appendChild(ph);
    }

    mdCodeEl.textContent = `![${base}](${publicUrl})`;
  }

  // ---------- upload ----------
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  async function uploadFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    const payload = { files: [] };
    for (const f of fileList) {
      try {
        const dataUrl = await readFileAsDataURL(f);
        payload.files.push({ name: f.name, dataUrl });
      } catch (err) {
        toast(`読み込み失敗: ${f.name}`, "error");
      }
    }
    if (payload.files.length === 0) return;
    toast(`${payload.files.length} 件をアップロード中...`, "info");
    try {
      const data = await api("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const ok = data.results.filter((r) => r.ok);
      const ng = data.results.filter((r) => !r.ok);
      if (ng.length > 0) {
        toast(
          `${ok.length} 件成功 / ${ng.length} 件失敗: ${ng.map((x) => `${x.originalName} (${x.error})`).join(", ")}`,
          "error",
        );
      } else {
        const renamed = ok.filter(
          (r) =>
            r.originalName &&
            r.name &&
            r.originalName.replace(/\.[^.]+$/, "") !==
              r.name.replace(/\.[^.]+$/, ""),
        );
        const detail =
          renamed.length > 0
            ? `: ${renamed.map((r) => `${r.originalName} → ${r.name}`).join(", ")}`
            : "";
        toast(`${ok.length} 件アップロード完了${detail}`, "success");
      }
      const newest = ok[ok.length - 1]?.name;
      await loadFiles(newest);
    } catch (err) {
      toast("アップロード失敗: " + err.message, "error");
    }
  }

  $("fileInput").addEventListener("change", async (e) => {
    await uploadFiles(e.target.files);
    e.target.value = "";
  });
  $("refreshBtn").addEventListener("click", async () => {
    await loadFiles(selected?.name, selected?.folder ?? "");
    toast("再読み込みしました", "info");
  });

  // ---------- rename ----------
  async function doRename() {
    if (!selected) return;
    const ext = selected.name.match(/(\.[^.]+)$/)?.[1] ?? "";
    const inputBase = renameInputEl.value.trim();
    const to = inputBase + ext;
    if (!inputBase || to === selected.name) return;
    const folder = selected.folder || "";
    try {
      const data = await api("/api/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: selected.name, to, folder }),
      });
      const note = data.changed ? ` (「${data.requested}」を正規化)` : "";
      toast(`リネーム: ${selected.name} → ${data.name}${note}`, "success");
      await loadFiles(data.name, folder);
    } catch (err) {
      toast("リネーム失敗: " + err.message, "error");
      const curExt = selected.name.match(/(\.[^.]+)$/)?.[1] ?? "";
      renameInputEl.value = selected.name.slice(0, selected.name.length - curExt.length);
    }
  }
  renameBtnEl.addEventListener("click", doRename);
  renameInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      const curExt = selected?.name.match(/(\.[^.]+)$/)?.[1] ?? "";
      renameInputEl.value = selected ? selected.name.slice(0, selected.name.length - curExt.length) : "";
      renameInputEl.blur();
    }
  });

  // ---------- delete ----------
  deleteBtnEl.addEventListener("click", async () => {
    if (!selected) return;
    if (selected.articleId && selected.articleId !== CONFIG.articleId) return;
    if (!confirm(`'${selected.name}' を削除します。よろしいですか?`)) return;
    const folder = selected.folder || "";
    try {
      await api("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selected.name, folder }),
      });
      toast(`削除: ${selected.name}`, "success");
      selected = null;
      await loadFiles();
    } catch (err) {
      toast("削除失敗: " + err.message, "error");
    }
  });

  // ---------- copy ----------
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("コピーしました", "success");
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        toast("コピーしました", "success");
      } catch {
        toast("コピー失敗", "error");
      } finally {
        document.body.removeChild(ta);
      }
    }
  }
  function copyMd() {
    if (!selected) return;
    copyToClipboard(mdCodeEl.textContent);
  }
  function copyUrl() {
    if (!selected) return;
    const folder = selected.folder || "";
    const filePath = folder ? `${folder}/${selected.name}` : selected.name;
    copyToClipboard(`${URL_PREFIX}/${filePath}`);
  }
  $("copyMdBtn").addEventListener("click", copyMd);
  $("copyMdInlineBtn").addEventListener("click", copyMd);
  $("copyUrlBtn").addEventListener("click", copyUrl);

  // ---------- drag & drop ----------
  let dragDepth = 0;
  function isFileDrag(e) {
    return Array.from(e.dataTransfer?.types || []).includes("Files");
  }
  window.addEventListener("dragenter", (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth++;
    dropOverlayEl.hidden = false;
  });
  window.addEventListener("dragover", (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });
  window.addEventListener("dragleave", (e) => {
    if (!isFileDrag(e)) return;
    dragDepth--;
    if (dragDepth <= 0) {
      dragDepth = 0;
      dropOverlayEl.hidden = true;
    }
  });
  window.addEventListener("drop", async (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth = 0;
    dropOverlayEl.hidden = true;
    const dropped = e.dataTransfer.files;
    if (dropped && dropped.length > 0) {
      await uploadFiles(dropped);
    }
  });

  // ---------- edit mode ----------
  function destroyCropper() {
    if (cropper) {
      cropper.destroy();
      cropper = null;
    }
  }

  // キャンバスをコンテナの FILL 割合に収めて中央配置（初期表示・回転後共通）
  // viewMode: 1 では cropBox 制約で setCanvasData が縮小できないため clear/crop で囲む
  const CANVAS_FILL = 0.85;
  function fitCanvasWithMargin() {
    if (!cropper) return;
    const ct = cropper.getContainerData();
    const cd = cropper.getCanvasData();
    const scale = Math.min(
      (ct.width * CANVAS_FILL) / cd.width,
      (ct.height * CANVAS_FILL) / cd.height,
    );
    cropper.clear();
    const newW = cd.width * scale;
    const newH = cd.height * scale;
    cropper.setCanvasData({
      width: newW,
      left: (ct.width - newW) / 2,
      top: (ct.height - newH) / 2,
    });
    cropper.crop();
    const cd2 = cropper.getCanvasData();
    cropper.setCropBoxData({ left: cd2.left, top: cd2.top, width: cd2.width, height: cd2.height });
  }

  function enterEditMode() {
    if (!selected || selected.kind !== "image") return;
    if (selected.articleId && selected.articleId !== CONFIG.articleId) return;
    mode = "edit";
    editFlipX = 1;
    editFlipY = 1;
    previewModeEl.hidden = true;
    editModeEl.hidden = false;
    // テンプレート未反映時のフォールバック: img を .edit-canvas-inner で包む
    const parent = editImageEl.parentElement;
    if (parent && !parent.classList.contains("edit-canvas-inner")) {
      const wrapper = document.createElement("div");
      wrapper.className = "edit-canvas-inner";
      parent.insertBefore(wrapper, editImageEl);
      wrapper.appendChild(editImageEl);
    }
    const start = () => {
      destroyCropper();
      cropper = new Cropper(editImageEl, {
        aspectRatio: NaN, // 自由比率
        viewMode: 1,
        autoCropArea: 1,
        background: true,
        dragMode: "move",
        movable: true,
        zoomable: true,
        scalable: true,
        rotatable: true,
        responsive: true,
        checkOrientation: true,
        minContainerHeight: 400,
        ready() {
          fitCanvasWithMargin();
        },
      });
    };
    const folder = selected.folder || "";
    const folderParam = folder ? `&folder=${encodeURIComponent(folder)}` : "";
    const apiUrl = `/api/file?name=${encodeURIComponent(selected.name)}${folderParam}&_t=${Date.now()}`;
    editImageEl.onload = start;
    editImageEl.src = apiUrl;
  }

  function exitEditMode({ silent = false } = {}) {
    if (mode !== "edit") return;
    destroyCropper();
    editImageEl.removeAttribute("src");
    editModeEl.hidden = true;
    previewModeEl.hidden = false;
    mode = "preview";
    if (!silent) toast("編集をキャンセルしました", "info");
  }

  async function saveEdit() {
    if (!cropper || !selected) return;
    const saveBtn = $("editSaveBtn");
    saveBtn.disabled = true;
    const labelEl = saveBtn.querySelector(".btn-label");
    const originalLabel = labelEl?.textContent;
    if (labelEl) labelEl.textContent = "保存中...";
    try {
      const canvas = cropper.getCroppedCanvas({
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "high",
      });
      if (!canvas) throw new Error("Canvas の生成に失敗しました");
      const dataUrl = canvas.toDataURL("image/png");
      const folder = selected.folder || "";
      const data = await api("/api/save-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selected.name, dataUrl, folder }),
      });
      toast(`保存しました (${canvas.width}×${canvas.height} PNG)`, "success");
      destroyCropper();
      editImageEl.removeAttribute("src");
      editModeEl.hidden = true;
      previewModeEl.hidden = false;
      mode = "preview";
      await loadFiles(data.name, data.folder ?? folder);
    } catch (err) {
      toast("保存失敗: " + err.message, "error");
    } finally {
      saveBtn.disabled = false;
      if (labelEl && originalLabel != null) labelEl.textContent = originalLabel;
    }
  }

  function editNudge(dx, dy) {
    cropper?.move(dx, dy);
  }
  function editZoom(delta) {
    cropper?.zoom(delta);
  }
  function editReset() {
    if (!cropper) return;
    editFlipX = 1;
    editFlipY = 1;
    cropper.reset();
  }

  editBtnEl.addEventListener("click", enterEditMode);
  $("editCancelBtn").addEventListener("click", () => exitEditMode());
  $("editSaveBtn").addEventListener("click", saveEdit);
  function rotateCropper(deg) {
    if (!cropper) return;
    cropper.rotate(deg);
    fitCanvasWithMargin();
  }
  $("editRotateL").addEventListener("click", () => rotateCropper(-90));
  $("editRotateR").addEventListener("click", () => rotateCropper(90));
  $("editFlipH").addEventListener("click", () => {
    if (!cropper) return;
    editFlipX = -editFlipX;
    cropper.scaleX(editFlipX);
  });
  $("editFlipV").addEventListener("click", () => {
    if (!cropper) return;
    editFlipY = -editFlipY;
    cropper.scaleY(editFlipY);
  });
  $("editZoomIn").addEventListener("click", () => editZoom(ZOOM_STEP));
  $("editZoomOut").addEventListener("click", () => editZoom(-ZOOM_STEP));
  $("editNudgeUp").addEventListener("click", () => editNudge(0, -NUDGE_STEP));
  $("editNudgeDown").addEventListener("click", () => editNudge(0, NUDGE_STEP));
  $("editNudgeLeft").addEventListener("click", () => editNudge(-NUDGE_STEP, 0));
  $("editNudgeRight").addEventListener("click", () =>
    editNudge(NUDGE_STEP, 0),
  );
  $("editReset").addEventListener("click", editReset);

  function isTypingTarget(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  window.addEventListener("keydown", (e) => {
    // 編集モードのショートカットのみ。プレビュー時のキーは奪わない (E は除く)
    if (mode === "preview" && !isTypingTarget(e.target)) {
      if (e.key === "e" || e.key === "E") {
        if (selected?.kind === "image") {
          e.preventDefault();
          enterEditMode();
        }
      }
      return;
    }
    if (mode !== "edit") return;
    if (isTypingTarget(e.target)) return;
    if (!cropper) return;

    if (e.key === "Escape") {
      e.preventDefault();
      exitEditMode();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      saveEdit();
      return;
    }
    const step = e.shiftKey ? NUDGE_STEP_BIG : NUDGE_STEP;
    switch (e.key) {
      case "ArrowUp":
        editNudge(0, -step);
        e.preventDefault();
        return;
      case "ArrowDown":
        editNudge(0, step);
        e.preventDefault();
        return;
      case "ArrowLeft":
        editNudge(-step, 0);
        e.preventDefault();
        return;
      case "ArrowRight":
        editNudge(step, 0);
        e.preventDefault();
        return;
      case "+":
      case "=":
        editZoom(ZOOM_STEP);
        e.preventDefault();
        return;
      case "-":
      case "_":
        editZoom(-ZOOM_STEP);
        e.preventDefault();
        return;
      case "0":
        editReset();
        e.preventDefault();
        return;
    }
  });

  // ---------- other articles ----------
  function buildOtherArticleRow(article) {
    const wrap = document.createElement("div");
    wrap.className = "other-article-folder";
    wrap.dataset.id = article.id;

    const row = document.createElement("div");
    row.className = "other-article-row";
    row.addEventListener("click", () => toggleOtherArticle(article.id));

    const folderIcon = document.createElement("span");
    folderIcon.className = "icon tree-folder-icon";
    folderIcon.setAttribute("aria-hidden", "true");
    folderIcon.textContent = "folder";
    row.appendChild(folderIcon);

    const nameSpan = document.createElement("span");
    nameSpan.className = "tree-folder-name";
    nameSpan.textContent = article.id;
    row.appendChild(nameSpan);

    const countSpan = document.createElement("span");
    countSpan.className = "tree-item-size";
    countSpan.textContent = String(article.fileCount);
    row.appendChild(countSpan);

    const chevron = document.createElement("span");
    chevron.className = "icon other-article-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "chevron_right";
    row.appendChild(chevron);

    wrap.appendChild(row);

    const fileList = document.createElement("ul");
    fileList.className = "tree-list other-article-files";
    fileList.hidden = true;
    wrap.appendChild(fileList);

    return wrap;
  }

  function renderOtherArticleFiles(fileList, articleId, fileArr) {
    fileList.replaceChildren();
    if (fileArr.length === 0) {
      const li = document.createElement("li");
      li.className = "tree-empty";
      li.textContent = "(ファイルなし)";
      fileList.appendChild(li);
      return;
    }
    for (const f of fileArr) {
      const li = document.createElement("li");
      li.className = `tree-item kind-${f.kind}`;
      li.dataset.name = f.name;
      if (
        selected &&
        selected.articleId === articleId &&
        selected.name === f.name
      ) {
        li.classList.add("is-active");
      }

      const icon = document.createElement("span");
      icon.className = "icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = iconForKind(f.kind, f.mime);
      li.appendChild(icon);

      const name = document.createElement("span");
      name.className = "tree-item-name";
      name.textContent = f.name;
      name.title = f.name;
      li.appendChild(name);

      const size = document.createElement("span");
      size.className = "tree-item-size";
      size.textContent = formatSize(f.size);
      li.appendChild(size);

      li.addEventListener("click", () => {
        selected = { ...f, articleId };
        renderTree();
        otherArticlesBodyEl
          .querySelectorAll(".tree-item.is-active")
          .forEach((el) => el.classList.remove("is-active"));
        li.classList.add("is-active");
        renderFileView();
      });
      fileList.appendChild(li);
    }
  }

  async function toggleOtherArticle(articleId) {
    const wrap = otherArticlesBodyEl.querySelector(
      `.other-article-folder[data-id="${CSS.escape(articleId)}"]`,
    );
    if (!wrap) return;
    const fileList = wrap.querySelector(".other-article-files");
    const row = wrap.querySelector(".other-article-row");

    if (!fileList.hidden) {
      fileList.hidden = true;
      row.classList.remove("is-expanded");
      return;
    }

    if (!otherFilesCache[articleId]) {
      const spinner = document.createElement("li");
      spinner.className = "tree-empty";
      spinner.textContent = "読み込み中...";
      fileList.replaceChildren(spinner);
      fileList.hidden = false;
      try {
        const data = await api(
          `/api/files?id=${encodeURIComponent(articleId)}`,
        );
        otherFilesCache[articleId] = data.files;
      } catch (err) {
        spinner.textContent = "読み込み失敗: " + err.message;
        return;
      }
    }

    renderOtherArticleFiles(fileList, articleId, otherFilesCache[articleId]);
    fileList.hidden = false;
    row.classList.add("is-expanded");
  }

  otherArticlesToggleEl.addEventListener("click", async () => {
    const isOpen = !otherArticlesBodyEl.hidden;
    if (isOpen) {
      otherArticlesBodyEl.hidden = true;
      otherArticlesToggleEl.closest(".sidebar").classList.remove("other-open");
      return;
    }
    otherArticlesBodyEl.hidden = false;
    otherArticlesToggleEl.closest(".sidebar").classList.add("other-open");
    if (otherArticles !== null) return;
    try {
      const data = await api("/api/articles");
      otherArticles = data.articles;
      otherCountBadgeEl.textContent = otherArticles.length;
      otherCountBadgeEl.hidden = otherArticles.length === 0;
      otherArticlesBodyEl.replaceChildren();
      if (otherArticles.length === 0) {
        const p = document.createElement("p");
        p.className = "tree-empty";
        p.textContent = "その他の記事はありません";
        otherArticlesBodyEl.appendChild(p);
      } else {
        for (const article of otherArticles) {
          otherArticlesBodyEl.appendChild(buildOtherArticleRow(article));
        }
      }
    } catch (err) {
      toast("その他の記事の読み込みに失敗: " + err.message, "error");
    }
  });

  // ---------- フォルダ作成 ----------
  mkdirBtnEl.addEventListener("click", async () => {
    const name = prompt("フォルダ名 (半角英小文字・数字・ハイフン・アンダースコア):");
    if (!name) return;
    try {
      await api("/api/mkdir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      toast(`フォルダ '${name}' を作成しました`, "success");
      await loadFiles(selected?.name, selected?.folder ?? "");
    } catch (err) {
      toast("フォルダ作成失敗: " + err.message, "error");
    }
  });

  // ---------- 移動 ----------
  moveBtnEl.addEventListener("click", (e) => {
    e.stopPropagation();
    if (moveDropdownEl.hidden) {
      const currentFolder = selected?.folder || "";
      moveDropdownEl.replaceChildren();
      const targets = [];
      if (currentFolder) targets.push({ name: "", label: "(ルート)" });
      for (const f of folders) {
        if (f.name !== currentFolder) targets.push({ name: f.name, label: f.name + "/" });
      }
      if (targets.length === 0) {
        toast("移動先がありません", "info");
        return;
      }
      for (const t of targets) {
        const btn = document.createElement("button");
        btn.className = "move-option";
        btn.type = "button";
        btn.textContent = t.label;
        btn.addEventListener("click", () => moveSelectedFile(t.name));
        moveDropdownEl.appendChild(btn);
      }
      moveDropdownEl.hidden = false;
    } else {
      moveDropdownEl.hidden = true;
    }
  });
  document.addEventListener("click", () => { moveDropdownEl.hidden = true; });

  async function moveSelectedFile(targetFolder) {
    moveDropdownEl.hidden = true;
    if (!selected) return;
    const folder = selected.folder || "";
    try {
      const data = await api("/api/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selected.name, folder, targetFolder }),
      });
      const dest = targetFolder ? `${targetFolder}/` : "ルート";
      toast(`移動しました → ${dest}`, "success");
      await loadFiles(data.name, data.folder ?? targetFolder);
    } catch (err) {
      toast("移動失敗: " + err.message, "error");
    }
  }

  // ---------- init ----------
  loadFiles().catch((err) => toast("読み込み失敗: " + err.message, "error"));

  new EventSource("/api/events");
})();
