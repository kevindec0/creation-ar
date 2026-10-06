// Formularios para añadir contenido a una obra: sube el archivo y luego lo asocia a la obra.
import { postJson, uploadFile } from "/static/js/uploader.js";

document.querySelectorAll("[data-asset-form]").forEach((form) => {
  const $ = (sel) => form.querySelector(sel);
  const progress = $("[data-asset-progress]");
  const fill = $("[data-asset-progress-fill]");
  const progressText = $("[data-asset-progress-text]");
  const errorBox = $("[data-asset-error]");
  const submit = $("[data-asset-submit]");

  const showError = (msg) => {
    errorBox.querySelector("p").textContent = msg;
    errorBox.hidden = !msg;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const kind = $("input[name=kind]:checked")?.value;
    const role = $("input[name=role]").value;
    const title = $("input[name=title]").value.trim();
    const payload = { role, kind, title };

    const label = submit.textContent;
    submit.disabled = true;
    try {
      if (kind === "link") {
        payload.url = $("input[name=url]").value.trim();
      } else {
        const file = $("input[type=file]").files?.[0];
        if (!file) throw new Error("Selecciona un archivo para subir.");
        progress.hidden = false;
        fill.style.width = "0%";
        progressText.textContent = "Subiendo…";
        payload.ref = await uploadFile(file, {
          kind,
          onProgress: (p) => {
            fill.style.width = `${p}%`;
            progressText.textContent = `Subiendo… ${Math.round(p)} %`;
          },
        });
        progressText.textContent = "Comprobando el archivo…";
      }
      const json = await postJson(form.action, payload);
      window.location.href = json.redirect;
      // Si solo cambia el ancla (#panel), el navegador no recarga: se fuerza.
      if (json.redirect.includes("#")) window.location.reload();
    } catch (err) {
      progress.hidden = true;
      showError(err.message);
      submit.disabled = false;
      submit.textContent = label;
    }
  });
});
