/* Experiencia de realidad aumentada.
   Se carga en <head>, después de A-Frame y MindAR, para registrar los componentes
   antes de que el navegador procese la escena. */
(function () {
  "use strict";

  /** Ajusta un video o imagen dentro del rectángulo de la obra sin deformarlo ("contain"). */
  AFRAME.registerComponent("fit-media", {
    init() {
      const el = this.el;
      const data = readData();
      const fit = (w, h) => {
        if (!w || !h) return;
        const mediaRatio = h / w;
        let width = 1;
        let height = mediaRatio;
        if (mediaRatio > data.ratio) {
          height = data.ratio;
          width = data.ratio / mediaRatio;
        }
        el.setAttribute("width", width);
        el.setAttribute("height", height);
      };
      const src = document.querySelector(el.getAttribute("src"));
      if (!src) return;
      if (src.tagName === "VIDEO") {
        if (src.readyState >= 1) fit(src.videoWidth, src.videoHeight);
        src.addEventListener("loadedmetadata", () => fit(src.videoWidth, src.videoHeight));
      } else {
        if (src.complete) fit(src.naturalWidth, src.naturalHeight);
        src.addEventListener("load", () => fit(src.naturalWidth, src.naturalHeight));
      }
    },
  });

  /** Escala y centra cualquier modelo 3D para que ocupe el ancho de la obra. */
  AFRAME.registerComponent("fit-model", {
    init() {
      this.el.addEventListener("model-loaded", () => {
        const mesh = this.el.getObject3D("mesh");
        if (!mesh) return;
        const box = new THREE.Box3().setFromObject(mesh);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const largest = Math.max(size.x, size.y, size.z) || 1;
        const scale = 0.8 / largest;
        mesh.scale.multiplyScalar(scale);
        mesh.position.sub(center.multiplyScalar(scale));
      });
    },
  });

  let cachedData;
  function readData() {
    if (!cachedData) cachedData = JSON.parse(document.getElementById("ar-data").textContent);
    return cachedData;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const data = readData();
    const $ = (id) => document.getElementById(id);
    const scene = document.querySelector("a-scene");
    const target = $("ar-target");
    const video = $("ov-video");
    const startScreen = $("ar-start");
    const errorScreen = $("ar-error");
    const hud = $("ar-hud");
    const hint = $("ar-hint");
    const hintText = $("ar-hint-text");
    const moreBtn = $("ar-more");
    const sheet = $("ar-sheet");
    const soundBtn = $("ar-sound");

    let started = false;
    let scanReported = false;
    let wantsSound = true;

    // Si el almacenamiento no permite usar el video como textura 3D (cabeceras CORS),
    // se muestra como un reproductor normal sobre la cámara para que no se pierda.
    let videoBlocked = false;
    let fallbackVideo = null;
    video?.addEventListener("error", () => (videoBlocked = true), { once: true });
    function showFallbackVideo() {
      if (fallbackVideo || !video) return;
      fallbackVideo = document.createElement("video");
      fallbackVideo.className = "ar-fallback-video";
      fallbackVideo.src = video.getAttribute("src");
      fallbackVideo.controls = true;
      fallbackVideo.playsInline = true;
      fallbackVideo.loop = true;
      hud.appendChild(fallbackVideo);
      fallbackVideo.play().catch(() => {});
    }

    function showError(message) {
      $("ar-error-text").textContent = message;
      startScreen.hidden = true;
      hud.hidden = true;
      errorScreen.hidden = false;
      started = false;
    }

    // La cámara del navegador solo funciona en páginas seguras (https o localhost).
    if (!window.isSecureContext) {
      showError(
        "El navegador solo permite usar la cámara en páginas con https. " +
          "Si estás probando en local desde el celular, abre la app a través de un túnel https (las instrucciones están en el README).",
      );
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showError("Este navegador no permite usar la cámara. Prueba con Chrome, Safari o Firefox actualizados.");
      return;
    }

    function setHint(text) {
      hint.hidden = !text;
      if (text) hintText.textContent = text;
    }

    // --- Sonido del video superpuesto ---
    function updateSoundButton() {
      if (!soundBtn) return;
      const on = !video.muted;
      soundBtn.textContent = on ? "🔊" : "🔇";
      soundBtn.setAttribute("aria-pressed", String(on));
      soundBtn.setAttribute("aria-label", on ? "Silenciar" : "Activar sonido");
    }

    async function playVideo() {
      if (!video) return;
      video.muted = !wantsSound;
      try {
        await video.play();
      } catch {
        // Algunos navegadores bloquean el audio sin un toque reciente: se reproduce en silencio.
        video.muted = true;
        await video.play().catch(() => {});
      }
      updateSoundButton();
    }

    if (soundBtn) {
      soundBtn.addEventListener("click", () => {
        wantsSound = video.muted;
        video.muted = !wantsSound;
        if (!video.muted && video.paused) video.play().catch(() => {});
        updateSoundButton();
      });
    }

    // Tocar el video lo pausa o lo reanuda.
    const ov = $("ov");
    if (ov && video) {
      ov.addEventListener("click", () => (video.paused ? playVideo() : video.pause()));
    }

    // --- Panel de información ---
    function openSheet() {
      if (!sheet) return;
      sheet.hidden = false;
      moreBtn?.setAttribute("aria-expanded", "true");
      $("ar-sheet-close").focus();
    }
    function closeSheet() {
      if (!sheet) return;
      sheet.hidden = true;
      moreBtn?.setAttribute("aria-expanded", "false");
      moreBtn?.focus();
    }
    moreBtn?.addEventListener("click", openSheet);
    $("ar-sheet-close")?.addEventListener("click", closeSheet);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && sheet && !sheet.hidden) closeSheet();
    });

    // --- Reconocimiento de la obra ---
    target.addEventListener("targetFound", () => {
      setHint("");
      if (videoBlocked) showFallbackVideo();
      if (moreBtn) moreBtn.hidden = false;
      playVideo();
      if (!scanReported) {
        scanReported = true;
        fetch(`/api/v/${encodeURIComponent(data.token)}/scan`, { method: "POST", keepalive: true }).catch(() => {});
      }
    });
    target.addEventListener("targetLost", () => {
      setHint("Apunta de nuevo a la obra");
      video?.pause();
    });

    scene.addEventListener("arReady", () => setHint("Apunta la cámara a la obra completa"));
    scene.addEventListener("arError", () => {
      showError(
        "No tenemos permiso para usar la cámara, o la está usando otra app. " +
          "Revisa los permisos del navegador para este sitio y vuelve a intentarlo.",
      );
    });

    async function start() {
      if (started) return;
      started = true;
      startScreen.hidden = true;
      errorScreen.hidden = true;
      hud.hidden = false;
      setHint("Preparando la cámara…");

      // Este toque "desbloquea" el video para que luego pueda sonar sin otro gesto (iOS).
      if (video) {
        try {
          video.muted = false;
          await video.play();
          video.pause();
          video.currentTime = 0;
        } catch {
          wantsSound = false;
        }
      }

      if (!scene.hasLoaded) await new Promise((r) => scene.addEventListener("loaded", r, { once: true }));
      try {
        scene.systems["mindar-image-system"].start();
      } catch (err) {
        console.error(err);
        showError("La experiencia no pudo arrancar en este dispositivo. Prueba con otro navegador.");
      }
    }

    $("ar-start-btn").addEventListener("click", start);
    $("ar-retry").addEventListener("click", () => {
      try {
        scene.systems["mindar-image-system"].stop();
      } catch {
        /* no estaba arrancado */
      }
      start();
    });

    // Al salir de la página se apaga la cámara.
    window.addEventListener("pagehide", () => {
      try {
        scene.systems["mindar-image-system"].stop();
      } catch {
        /* nada que detener */
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) video?.pause();
    });
  });
})();
