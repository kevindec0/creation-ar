// Comportamientos pequeños comunes a todas las páginas.
(function () {
  "use strict";

  // Confirmación antes de acciones destructivas.
  document.addEventListener("submit", (e) => {
    const form = e.target;
    const message = form.getAttribute("data-confirm");
    if (message && !window.confirm(message)) e.preventDefault();
  });

  // Botón "Volver".
  document.querySelectorAll("[data-back]").forEach((btn) =>
    btn.addEventListener("click", () => (history.length > 1 ? history.back() : (location.href = "/"))),
  );

  // Copiar al portapapeles.
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const input = document.querySelector(btn.getAttribute("data-copy"));
      if (!input) return;
      try {
        await navigator.clipboard.writeText(input.value);
      } catch {
        input.select();
        document.execCommand("copy");
      }
      const original = btn.textContent;
      btn.textContent = "Copiado";
      setTimeout(() => (btn.textContent = original), 1800);
    });
  });

  // Formularios de contenido: muestra el campo adecuado según el tipo elegido.
  document.querySelectorAll("[data-asset-form]").forEach((form) => {
    const fileField = form.querySelector("[data-file-field]");
    const urlField = form.querySelector("[data-url-field]");
    const fileInput = fileField.querySelector("input[type=file]");
    const update = () => {
      const checked = form.querySelector("input[name=kind]:checked");
      if (!checked) return;
      const isLink = checked.value === "link";
      fileField.hidden = isLink;
      if (urlField) urlField.hidden = !isLink;
      if (!isLink) fileInput.accept = checked.dataset.accept || "";
    };
    form.addEventListener("change", (e) => {
      if (e.target.name === "kind") update();
    });
    update();
  });
})();
