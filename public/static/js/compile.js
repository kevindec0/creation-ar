// Prepara la imagen de la obra y genera el archivo .mind con el compilador de MindAR,
// todo en el navegador. Luego sube ambos archivos y envía el formulario.
import { postJson, uploadFile } from "/static/js/uploader.js";

const UPLOAD_MAX = 1600; // lado mayor de la imagen que se guarda
const COMPILE_MAX = 1000; // lado mayor de la imagen que se compila (más grande = más lento)
const MIN_SIDE = 480;

let compilerModule;
const loadCompiler = () => (compilerModule ??= import("/static/vendor/mind-ar/mindar-image.prod.js"));

function scaledCanvas(source, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // fondo blanco para PNG con transparencia
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const toBlob = (canvas, type, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo procesar la imagen"))), type, quality),
  );

function countFeaturePoints(compiler) {
  const first = compiler.data?.[0];
  if (!first?.matchingData) return 0;
  return first.matchingData.reduce(
    (sum, level) => sum + (level.maximaPoints?.length ?? 0) + (level.minimaPoints?.length ?? 0),
    0,
  );
}

function setup(form) {
  const $ = (sel) => form.querySelector(sel);
  const input = $("[data-target-input]");
  const dropzone = $("[data-dropzone]");
  const fileError = $("[data-target-error]");
  const preview = $("[data-target-preview]");
  const previewImg = $("[data-target-img]");
  const dims = $("[data-target-dims]");
  const quality = $("[data-quality]");
  const progress = $("[data-progress]");
  const progressFill = $("[data-progress-fill]");
  const progressText = $("[data-progress-text]");
  const formError = $("[data-form-error]");
  const submit = $("[data-submit]");
  const thresholds = { low: Number(form.dataset.qualityLow), good: Number(form.dataset.qualityGood) };

  let result = null; // { imageBlob, mindBlob, width, height, points }
  let run = 0;
  let previewUrl;

  submit.disabled = true;

  const showFileError = (msg) => {
    fileError.textContent = msg;
    fileError.hidden = !msg;
  };
  const showFormError = (msg) => {
    formError.querySelector("p").textContent = msg;
    formError.hidden = !msg;
    if (msg) formError.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  function showQuality(points) {
    const level = points >= thresholds.good ? "good" : points >= thresholds.low ? "fair" : "poor";
    const texts = {
      good: ["Fácil de reconocer", "La cámara debería reconocer la obra rápido y sin perderla."],
      fair: ["Reconocimiento aceptable", "Funcionará, pero con poca luz o de lejos puede tardar. Una foto más nítida ayuda."],
      poor: [
        "Difícil de reconocer",
        "La imagen tiene poco detalle. Prueba con una foto más nítida, con mejor luz o recortada justo al borde. Puedes continuar igualmente.",
      ],
    };
    quality.dataset.level = level;
    quality.querySelector("[data-quality-label]").textContent = texts[level][0];
    quality.querySelector("[data-quality-fill]").style.width = `${Math.min(100, Math.round((points / (thresholds.good * 1.4)) * 100))}%`;
    quality.querySelector("[data-quality-text]").textContent = `${points} puntos de reconocimiento. ${texts[level][1]}`;
    quality.hidden = false;
  }

  async function handleFile(file) {
    const current = ++run;
    result = null;
    submit.disabled = true;
    showFileError("");
    showFormError("");
    quality.hidden = true;

    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      showFileError("Elige una imagen JPG, PNG o WebP.");
      return;
    }

    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      showFileError("No se pudo abrir la imagen. Prueba con otro archivo.");
      return;
    }
    if (Math.min(bitmap.width, bitmap.height) < MIN_SIDE) {
      showFileError(`La imagen es muy pequeña (${bitmap.width}×${bitmap.height}). Usa una de al menos ${MIN_SIDE} píxeles por lado.`);
      return;
    }

    const uploadCanvas = scaledCanvas(bitmap, UPLOAD_MAX);
    const compileCanvas = scaledCanvas(bitmap, COMPILE_MAX);
    bitmap.close?.();

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const imageBlob = await toBlob(uploadCanvas, "image/jpeg", 0.9);
    previewUrl = URL.createObjectURL(imageBlob);
    previewImg.src = previewUrl;
    dims.textContent = `${uploadCanvas.width} × ${uploadCanvas.height} px`;
    preview.hidden = false;

    progress.hidden = false;
    progressFill.style.width = "0%";
    progressText.textContent = "Cargando el compilador…";

    try {
      const { Compiler } = await loadCompiler();
      if (current !== run) return;
      const compiler = new Compiler();
      progressText.textContent = "Analizando la imagen. No cierres esta página.";
      await compiler.compileImageTargets([compileCanvas], (p) => {
        if (current !== run) return;
        progressFill.style.width = `${Math.min(100, p).toFixed(0)}%`;
      });
      if (current !== run) return;
      const data = await compiler.exportData();
      result = {
        imageBlob: new File([imageBlob], "obra.jpg", { type: "image/jpeg" }),
        mindBlob: new File([data], "obra.mind", { type: "application/octet-stream" }),
        width: uploadCanvas.width,
        height: uploadCanvas.height,
        points: countFeaturePoints(compiler),
      };
      progress.hidden = true;
      showQuality(result.points);
      submit.disabled = false;
    } catch (err) {
      console.error(err);
      if (current !== run) return;
      progress.hidden = true;
      showFileError("No se pudo analizar la imagen en este navegador. Prueba con Chrome o Edge en un computador.");
    }
  }

  input.addEventListener("change", () => handleFile(input.files?.[0]));
  input.addEventListener("focus", () => loadCompiler().catch(() => {}), { once: true });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("is-over");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-over"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-over");
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showFormError("");
    if (!result) {
      showFileError("Primero elige la foto de la obra y espera a que termine el análisis.");
      return;
    }
    const titleInput = form.querySelector("[name=title]");
    if (titleInput && !titleInput.value.trim()) {
      showFormError("La obra necesita un título.");
      titleInput.focus();
      return;
    }

    const label = submit.textContent;
    submit.disabled = true;
    const setLabel = (text) => (submit.textContent = text);
    try {
      setLabel("Subiendo imagen…");
      const targetImage = await uploadFile(result.imageBlob, {
        kind: "image",
        ext: "jpg",
        onProgress: (p) => setLabel(`Subiendo imagen… ${Math.round(p)} %`),
      });
      setLabel("Subiendo reconocimiento…");
      const targetMind = await uploadFile(result.mindBlob, {
        kind: "mind",
        ext: "mind",
        onProgress: (p) => setLabel(`Subiendo reconocimiento… ${Math.round(p)} %`),
      });
      setLabel("Guardando…");
      const fields = Object.fromEntries(new FormData(form));
      delete fields.targetSource;
      delete fields._csrf;
      const json = await postJson(form.action, {
        ...fields,
        targetImage,
        targetMind,
        targetWidth: result.width,
        targetHeight: result.height,
        featurePoints: result.points,
      });
      window.location.href = json.redirect;
    } catch (err) {
      showFormError(err.message);
      submit.disabled = false;
      setLabel(label);
    }
  });
}

document.querySelectorAll("[data-compile-form]").forEach(setup);
