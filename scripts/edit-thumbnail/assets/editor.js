(() => {
  const {
    targetWidth: TARGET_WIDTH,
    targetHeight: TARGET_HEIGHT,
    hasSource: SSR_HAS_SOURCE,
    initialFilename: SSR_FILENAME,
  } = JSON.parse(document.getElementById("editor-config").textContent);
  const ASPECT = TARGET_WIDTH / TARGET_HEIGHT;
  const VALID_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif"];

  const $ = (id) => document.getElementById(id);
  const stageEl = $("stage");
  const toastEl = $("toast");
  const dropOverlayEl = $("dropOverlay");

  const controlIds = [
    "rotateL",
    "rotateR",
    "flipH",
    "flipV",
    "zoomIn",
    "zoomOut",
    "nudgeUp",
    "nudgeDown",
    "nudgeLeft",
    "nudgeRight",
    "reset",
    "save",
  ];

  const NUDGE_STEP = 1;
  const NUDGE_STEP_BIG = 10;
  const ZOOM_STEP = 0.1;

  let cropper = null;
  let currentExt = ".png";
  let flipX = 1;
  let flipY = 1;

  function setControlsEnabled(enabled) {
    for (const id of controlIds) $(id).disabled = !enabled;
  }

  let toastTimer = null;
  function showStatus(msg, type = "info") {
    const iconName =
      type === "success" ? "check_circle" : type === "error" ? "error" : "info";
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
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3500);
  }

  function ensureStageImage() {
    stageEl.replaceChildren();
    stageEl.classList.remove("is-empty");
    const container = document.createElement("div");
    container.className = "container";
    const img = document.createElement("img");
    img.id = "image";
    img.alt = "編集中の画像";
    container.appendChild(img);
    stageEl.appendChild(container);
    return img;
  }

  function destroyCropper() {
    if (cropper) {
      cropper.destroy();
      cropper = null;
    }
  }

  function attachCropper(imgEl) {
    destroyCropper();
    flipX = 1;
    flipY = 1;
    cropper = new Cropper(imgEl, {
      aspectRatio: ASPECT,
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
      minContainerHeight: 420,
    });
    setControlsEnabled(true);
  }

  function initCropper(dataUrl) {
    const imgEl = ensureStageImage();
    imgEl.onload = () => attachCropper(imgEl);
    imgEl.src = dataUrl;
  }

  function initFromSSR() {
    if (!SSR_HAS_SOURCE) return;
    const imgEl = stageEl.querySelector("img#image");
    if (!imgEl) return;
    const ext = (SSR_FILENAME.match(/\.[^.]+$/)?.[0] || ".png").toLowerCase();
    currentExt = VALID_EXTS.includes(ext) ? ext : ".png";
    const start = () => {
      attachCropper(imgEl);
      showStatus(`既存の ${SSR_FILENAME} を読み込みました`, "info");
    };
    if (imgEl.complete && imgEl.naturalWidth > 0) start();
    else imgEl.addEventListener("load", start, { once: true });
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  async function uploadFile(file) {
    if (!file) return;
    const rawExt = "." + (file.name.split(".").pop() || "png").toLowerCase();
    currentExt = VALID_EXTS.includes(rawExt) ? rawExt : ".png";
    let dataUrl;
    try {
      dataUrl = await readFileAsDataURL(file);
    } catch (err) {
      showStatus("ファイル読み込み失敗: " + err.message, "error");
      return;
    }
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, ext: currentExt }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || res.statusText);
      showStatus(
        j.converted
          ? `PNG に変換してアップロード: _thumbnail${j.ext}`
          : `画像をアップロード: _thumbnail${j.ext}`,
        "success",
      );
      // サーバ側で PNG 変換した場合 (HEIC / 非 PNG 静止画) は変換後の dataUrl を使う
      // (ブラウザが元形式を <img> でレンダリングできない場合があるため)
      initCropper(j.dataUrl || dataUrl);
    } catch (err) {
      showStatus("アップロード失敗: " + err.message, "error");
    }
  }

  $("fileInput").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    await uploadFile(file);
    e.target.value = "";
  });

  // drag & drop
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
    const files = Array.from(e.dataTransfer.files || []).filter(
      (f) => f.type === "" || f.type.startsWith("image/"),
    );
    if (files.length === 0) {
      showStatus("画像ファイルではありません", "error");
      return;
    }
    if (files.length > 1) {
      showStatus(
        `${files.length} 件のうち最初の 1 件のみ使用します (サムネイルは 1 枚)`,
        "info",
      );
    }
    await uploadFile(files[0]);
  });

  function nudge(dx, dy) {
    if (!cropper) return;
    cropper.move(dx, dy);
  }
  function zoomBy(delta) {
    if (!cropper) return;
    cropper.zoom(delta);
  }
  function resetAll() {
    if (!cropper) return;
    flipX = 1;
    flipY = 1;
    cropper.reset();
  }

  $("rotateL").addEventListener("click", () => cropper?.rotate(-90));
  $("rotateR").addEventListener("click", () => cropper?.rotate(90));
  $("flipH").addEventListener("click", () => {
    if (!cropper) return;
    flipX = -flipX;
    cropper.scaleX(flipX);
  });
  $("flipV").addEventListener("click", () => {
    if (!cropper) return;
    flipY = -flipY;
    cropper.scaleY(flipY);
  });
  $("zoomIn").addEventListener("click", () => zoomBy(ZOOM_STEP));
  $("zoomOut").addEventListener("click", () => zoomBy(-ZOOM_STEP));
  $("nudgeUp").addEventListener("click", () => nudge(0, -NUDGE_STEP));
  $("nudgeDown").addEventListener("click", () => nudge(0, NUDGE_STEP));
  $("nudgeLeft").addEventListener("click", () => nudge(-NUDGE_STEP, 0));
  $("nudgeRight").addEventListener("click", () => nudge(NUDGE_STEP, 0));
  $("reset").addEventListener("click", resetAll);

  function isTypingTarget(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  window.addEventListener("keydown", (e) => {
    if (!cropper) return;
    if (isTypingTarget(e.target)) return;

    const step = e.shiftKey ? NUDGE_STEP_BIG : NUDGE_STEP;
    switch (e.key) {
      case "ArrowUp":
        nudge(0, -step);
        e.preventDefault();
        return;
      case "ArrowDown":
        nudge(0, step);
        e.preventDefault();
        return;
      case "ArrowLeft":
        nudge(-step, 0);
        e.preventDefault();
        return;
      case "ArrowRight":
        nudge(step, 0);
        e.preventDefault();
        return;
      case "+":
      case "=":
        zoomBy(ZOOM_STEP);
        e.preventDefault();
        return;
      case "-":
      case "_":
        zoomBy(-ZOOM_STEP);
        e.preventDefault();
        return;
      case "0":
        resetAll();
        e.preventDefault();
        return;
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      $("save").click();
    }
  });

  $("save").addEventListener("click", async () => {
    if (!cropper) return;
    const saveBtn = $("save");
    saveBtn.disabled = true;
    const labelEl = saveBtn.querySelector(".btn-label");
    const originalLabel = labelEl?.textContent;
    if (labelEl) labelEl.textContent = "保存中...";
    try {
      const canvas = cropper.getCroppedCanvas({
        width: TARGET_WIDTH,
        height: TARGET_HEIGHT,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "high",
        fillColor: "#000",
      });
      if (!canvas) throw new Error("Canvas の生成に失敗しました");
      const dataUrl = canvas.toDataURL("image/png");
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || res.statusText);
      showStatus(
        `保存しました (${TARGET_WIDTH}×${TARGET_HEIGHT} PNG) — ビルド時に反映されます`,
        "success",
      );
    } catch (err) {
      showStatus("保存失敗: " + err.message, "error");
    } finally {
      saveBtn.disabled = false;
      if (labelEl && originalLabel != null) labelEl.textContent = originalLabel;
    }
  });

  initFromSSR();

  new EventSource("/api/events");
})();
