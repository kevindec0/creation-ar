# CreationAR

Obras de arte que muestran contenido digital al apuntarles con la cámara del celular. Un artista sube la foto de su obra, le añade un video, una imagen o un modelo 3D que aparece encima, y un panel con audioguía, imágenes y enlaces. Después la publica y pone el código QR junto a la obra. Quien lo escanee abre la experiencia en el navegador, sin instalar ninguna app.

Es una versión reescrita y ampliada de [ar-application](https://github.com/Shayd-R/ar-application).

**Tecnologías:** Node.js, Express 5, TypeScript, EJS, Drizzle ORM con Postgres, MindAR y A-Frame. Se despliega en Vercel con Neon como base de datos y Vercel Blob para los archivos.

## Desarrollo local

Requisitos: Node.js 22.9 o superior (`node -v` para comprobarlo). No hace falta instalar ninguna base de datos: en local se usa PGlite, un Postgres embebido que se guarda en la carpeta `data/`.

```bash
npm install
npm run dev
```

Abre <http://localhost:3000>. La primera vez aparece un asistente para crear la cuenta de administración (no hay usuario ni contraseña por defecto). Para empezar de cero, detén el servidor y borra la carpeta `data/`.

La cámara del celular solo funciona en páginas con **https**, así que para probar la realidad aumentada en el teléfono lo más práctico es desplegar en Vercel (siguiente sección). En el computador sí funciona en `localhost`, apuntando la cámara web a la obra o a una foto de ella.

## Publicar en GitHub

1. Crea un repositorio **vacío** en [github.com/new](https://github.com/new): sin README, sin `.gitignore` y sin licencia, porque el proyecto ya los trae.
2. En una terminal, dentro de la carpeta del proyecto:

```bash
git init
git add .
git commit -m "CreationAR: primera versión"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/creation-ar.git
git push -u origin main
```

El `.gitignore` excluye `node_modules/`, `data/`, `dist/` y `.env`, así que no se suben dependencias, datos locales ni claves. Antes del primer `git add`, revisa con `git status` que `.env` no aparezca en la lista.

## Desplegar en Vercel

### 1. Importar el proyecto

Entra a [vercel.com](https://vercel.com) con tu cuenta de GitHub y elige **Add New → Project**. Importa el repositorio `creation-ar`. Vercel detecta Express automáticamente: no cambies ningún ajuste y pulsa **Deploy**.

El primer despliegue mostrará un error que dice qué falta (la base de datos). Es normal: los pasos 2 y 3 lo resuelven.

### 2. Base de datos: Neon

En el proyecto de Vercel ve a la pestaña **Storage → Create Database** y elige **Neon** (Postgres sin servidor, con plan gratuito). Conéctala al proyecto. Vercel añade la variable `DATABASE_URL` automáticamente.

Las tablas se crean solas la primera vez que la app arranca.

### 3. Archivos: Vercel Blob

En **Storage → Create** elige **Blob** y, al crearlo, selecciona acceso **Public** (no se puede cambiar después). Conéctalo al proyecto.

Luego revisa en **Settings → Environment Variables** que exista `BLOB_READ_WRITE_TOKEN`. Si no está, ábrelo desde los ajustes del Blob store, copia el token de lectura y escritura y agrégalo como variable con ese nombre para los entornos Production y Preview. La app lo necesita para autorizar las subidas desde el navegador.

### 4. Volver a desplegar

Ve a **Deployments**, abre el último despliegue y elige **Redeploy**. Cuando termine, abre `https://tu-proyecto.vercel.app`, crea la cuenta de administración y sube tu primera obra.

Desde ese momento, cada `git push` a `main` despliega una versión nueva.

### Variables opcionales en Vercel

| Variable | Para qué sirve |
| --- | --- |
| `APP_URL` | Dirección pública fija para los QR, por ejemplo si conectas un dominio propio |
| `ALLOW_REGISTRATION` | `false` para que solo la administración cree cuentas |
| `MAX_UPLOAD_MB` | Tamaño máximo por archivo (por defecto 50) |

Los QR apuntan a la dirección desde la que se abre el estudio. Si generas un QR desde una URL de *preview* de Vercel, ese QR apuntará a la preview. Para QR que se van a imprimir, usa la dirección de producción o define `APP_URL`.

## Cómo se usa

1. **Nueva obra.** Elige una foto de la obra. El navegador la analiza (10 a 40 segundos) y genera el archivo `.mind` con el que MindAR la reconoce. Verás una puntuación: *fácil*, *aceptable* o *difícil de reconocer*.
2. **Sobre la obra.** Sube lo que aparece encima al reconocerla: un video MP4, una imagen o un modelo 3D en GLB.
3. **Panel de información.** Añade audioguías, más imágenes, videos y enlaces. También aparecen en la página pública de la obra, que funciona sin cámara.
4. **Publicar.** Al publicar se activan el enlace y el código QR (PNG para pantalla, SVG para imprenta).
5. **Actividad.** Cada obra muestra cuántas veces se abrió su página y cuántas veces la cámara la reconoció en los últimos 14 días.

### Consejos para que la cámara reconozca la obra

- Foto de frente, sin reflejos ni sombras, recortada justo al borde de la obra.
- Las obras con mucho detalle y contraste funcionan mucho mejor que las lisas, muy oscuras o con grandes zonas de un solo color.
- Si la puntuación sale *difícil de reconocer*, prueba con una foto más nítida o mejor iluminada antes de imprimir el QR.
- Para probar sin la obra física, abre su imagen en la pantalla del computador y apunta el celular a la pantalla.

### Formatos de contenido

| Tipo | Formatos | Nota |
| --- | --- | --- |
| Imagen | JPG, PNG, WebP | |
| Video | MP4, WebM | MP4 con H.264 funciona en iPhone y Android |
| Audio | MP3, M4A, OGG, WAV | |
| Modelo 3D | GLB | Sin compresión Draco; se escala solo al ancho de la obra |

El máximo por archivo es de 50 MB (`MAX_UPLOAD_MB`). Los archivos se validan por su contenido real, no por la extensión.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo con recarga automática |
| `npm test` | Pruebas automáticas (usan una base de datos en memoria) |
| `npm run typecheck` | Revisión de tipos de TypeScript |
| `npm run build` y `npm start` | Compila a `dist/` y arranca en modo producción (Docker u otro hosting) |
| `npm run db:generate` | Genera una migración después de cambiar `src/db/schema.ts` |
| `npm run db:migrate` | Aplica las migraciones a la base de `DATABASE_URL` |
| `npm run vendor:blob` | Regenera el cliente de Vercel Blob para el navegador |

## Cómo funciona por dentro

```
src/
  index.ts          Entrada para Vercel (exporta la app de Express)
  local.ts          Entrada para desarrollo local, Docker u otros servidores
  bootstrap.ts      Configuración, base de datos y armado de la app
  create-app.ts     Express, seguridad (CSP, cabeceras) y rutas
  config.ts         Variables de entorno validadas
  db/               Esquema (Drizzle) y conexión: PGlite en local, Postgres con DATABASE_URL
  lib/storage/      Almacenamiento: disco local, Vercel Blob o S3
  routes/           auth, public (galería, obra, AR, QR), studio, uploads, admin
  services/         Usuarios, sesiones, obras, estadísticas y revisión de archivos
views/              Plantillas EJS
public/static/      CSS, JavaScript del navegador, fuentes, A-Frame, MindAR y cliente de Blob
drizzle/            Migraciones SQL
tests/              Pruebas con Vitest y Supertest
```

**Subida de archivos en dos pasos.** Primero el archivo llega al almacenamiento y después el formulario se envía con su referencia. En Vercel, el navegador sube directamente a Vercel Blob después de pedir permiso al servidor. Así se evita el límite de 4,5 MB por petición de las funciones de Vercel. En local, el archivo pasa por el servidor y se guarda en `data/uploads`. En ambos casos el servidor comprueba, antes de asociarlo a una obra, que el archivo esté en la carpeta del usuario y que su contenido sea del tipo esperado.

**Reconocimiento.** El archivo `.mind` se genera en el navegador con MindAR y la experiencia AR lo descarga desde el mismo dominio de la app (`/v/<token>/target.mind`).

## Seguridad

- Sin credenciales por defecto: la primera cuenta se crea con el asistente.
- Contraseñas con Argon2id. Las sesiones se guardan en la base de datos como hash, se renuevan solas y se cierran al cambiar la contraseña o al desactivar la cuenta.
- Protección CSRF en todos los formularios y subidas, y cookies `HttpOnly`, `SameSite=Lax` y `Secure` en https.
- Límite de intentos en el inicio de sesión y el registro.
- Política de seguridad de contenido (CSP) estricta. Solo la página AR permite `unsafe-eval`, porque A-Frame lo necesita.
- Cada cuenta solo puede usar archivos de su propia carpeta, y los archivos se validan por contenido.

## Solución de problemas

**"CreationAR no pudo arrancar" en Vercel.** El mensaje dice qué variable falta. Revisa los pasos 2 y 3 y vuelve a desplegar: los cambios de variables solo se aplican en un despliegue nuevo.

**La subida de archivos falla en Vercel.** Comprueba que `BLOB_READ_WRITE_TOKEN` exista y que el Blob store sea **Public**.

**La cámara no se abre en el celular.** La página debe abrirse con `https://`. Revisa también que el navegador tenga permiso de cámara para el sitio (en Chrome, el candado de la barra de direcciones; en iPhone, Ajustes → Safari → Cámara).

**El video sobre la obra no se ve en 3D.** Si el almacenamiento no permite usar el video como textura (cabeceras CORS), la app lo muestra como un reproductor normal encima de la cámara. Avísale a quien mantenga el proyecto para revisar la configuración del almacenamiento.

## Otros hostings

La app también funciona en cualquier servidor con Node.js o Docker (Render, Railway, Koyeb, un VPS). El `Dockerfile` y `docker-compose.yml` incluidos sirven para eso; los archivos pueden guardarse en disco o en un almacenamiento compatible con S3 (variables `S3_*` en `.env.example`).

## Limitaciones conocidas

- No hay recuperación de contraseña por correo.
- Cada obra se reconoce por separado; todavía no hay exposiciones que agrupen varias obras en una sola experiencia.
- Si alguien sube un archivo y abandona el formulario sin guardarlo, ese archivo queda en el almacenamiento sin usarse.
- El límite de intentos de inicio de sesión se cuenta por instancia del servidor; en Vercel puede haber varias a la vez.
- Los umbrales de la puntuación de calidad (`src/lib/quality.ts`) se calibraron con imágenes de prueba y conviene ajustarlos con obras reales.

## Licencia

MIT. A-Frame y MindAR (en `public/static/vendor`) son MIT, el cliente de Vercel Blob es Apache-2.0, y las fuentes Bricolage Grotesque y Atkinson Hyperlegible tienen licencia SIL OFL.
