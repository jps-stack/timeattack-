# VM Time Attack

Dashboard publico y panel Staff para eventos de Virtual Motors. Esta carpeta es el proyecto dedicado que se conecta a Git y Netlify; la recuperacion original permanece separada.

## Que incluye

- Dashboard publico, inscripcion y panel Staff protegido.
- Seleccion de pista y carro con sincronizacion automatica.
- Anuncios opcionales de productos oficiales de Coauto Simracing.
- Carga de logos PNG y gestion de participantes.
- Persistencia compartida mediante Netlify Blobs.
- Netlify Functions para autenticacion, configuracion, logos y participantes.

## Desarrollo local

Requisitos: Node.js 24 y pnpm 11.

```bash
pnpm install
cp .env.example .env
pnpm run dev:netlify
```

Completa `STAFF_PASSWORD` y `SESSION_SECRET` dentro de `.env` antes de iniciar. Para generar un secreto de sesion:

```bash
openssl rand -hex 32
```

Abre:

- Dashboard: `http://localhost:8888/`
- Inscripcion: `http://localhost:8888/registro`
- Staff: `http://localhost:8888/admin`

El almacenamiento de Netlify Dev es local y no modifica produccion.

## Verificacion

```bash
pnpm run verify
```

El comando revisa la sintaxis de la aplicacion y Functions, y genera el sitio estatico en `dist/`.

## Deploy en Netlify

1. Inicia sesion una sola vez:

   ```bash
   pnpm exec netlify login
   ```

2. Vincula esta carpeta con un proyecto nuevo o existente:

   ```bash
   pnpm exec netlify init
   ```

3. Configura `STAFF_PASSWORD` y `SESSION_SECRET` como variables privadas del proyecto en Netlify.

4. Publica primero un deploy de prueba:

   ```bash
   pnpm exec netlify deploy --build
   ```

5. Cuando el flujo este aprobado, publica en produccion:

   ```bash
   pnpm exec netlify deploy --build --prod
   ```

Los deploys no reemplazan los datos del evento: configuracion, participantes y logos viven en el almacenamiento persistente del proyecto de Netlify.

## Estructura

- `assets/`: interfaz y recursos visuales.
- `netlify/functions/`: endpoints desplegables.
- `netlify/lib/`: autenticacion, validacion y persistencia.
- `netlify/seed/`: estado inicial del primer deploy.
- `scripts/build.mjs`: construccion reproducible de `dist/`.
- `netlify.toml`: build, Functions, redirects y headers.

## Nota de origen

La interfaz fue recuperada desde el build publico del sitio anterior; no es el repositorio fuente original. Los recursos de terceros deben contar con permiso de uso antes de una publicacion comercial.
