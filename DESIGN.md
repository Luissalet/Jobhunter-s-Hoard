---
name: Jubhunter's Hoard
description: Un expediente profesional para preparar y seguir candidaturas con información real.
colors:
  accent: "#28543a"
  accent-hover: "#1c432c"
  ink: "#27372c"
  muted: "#6a736b"
  paper: "#fbfcf9"
  white: "#ffffff"
  line: "#e3e7df"
  soft: "#eef2e9"
  sidebar: "#f1f3ec"
  nav-active: "#e0e8d8"
  nav-active-ink: "#23472e"
  nav-hover: "#e7ede1"
  field-line: "#d7dfd0"
  field-ink: "#344a31"
  placeholder: "#65715f"
  supporting-ink: "#626f5c"
  focus: "#497858"
  button-line: "#d8dfd4"
  panel: "#f3f6ee"
  status-bg: "#e9eee3"
  status-ink: "#50654a"
  progress-bg: "#e2eedf"
  progress-ink: "#315f39"
  prepared-bg: "#e9e8f3"
  prepared-ink: "#595674"
  closed-bg: "#f3e9e3"
  closed-ink: "#805b48"
  answered-bg: "#f4ecd8"
  answered-ink: "#79622e"
  danger-bg: "#fff1ef"
  danger-ink: "#813d32"
  danger-line: "#e5c9c5"
typography:
  headline:
    fontFamily: "Segoe UI, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Segoe UI, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    lineHeight: 1.65
  button:
    fontFamily: "Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: "18px"
  label:
    fontFamily: "Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
  code:
    fontFamily: "Consolas, monospace"
    fontSize: "11px"
    lineHeight: 1.8
rounded:
  badge: "5px"
  field: "6px"
  control: "7px"
  panel: "8px"
  welcome: "9px"
  dialog: "12px"
spacing:
  control-gap: "8px"
  action-gap: "10px"
  field-margin: "20px"
  form-column-gap: "24px"
  page-gutter: "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "10px 15px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "10px 15px"
  button-secondary-hover:
    backgroundColor: "{colors.soft}"
  button-danger:
    backgroundColor: "{colors.danger-bg}"
    textColor: "{colors.danger-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "10px 15px"
  field:
    backgroundColor: "{colors.white}"
    textColor: "{colors.field-ink}"
    rounded: "{rounded.field}"
    padding: "10px 11px"
    width: "100%"
  nav-active:
    backgroundColor: "{colors.nav-active}"
    textColor: "{colors.nav-active-ink}"
    rounded: "{rounded.control}"
    padding: "12px 13px"
  status:
    backgroundColor: "{colors.status-bg}"
    textColor: "{colors.status-ink}"
    rounded: "{rounded.badge}"
    padding: "4px 8px"
  inline-panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.panel}"
    padding: "24px"
---

# Design System: Jubhunter's Hoard

## Overview

**Creative North Star: "Expediente profesional"**

Un índice estable acompaña una página de trabajo clara y espaciosa. Papel cálido, tinta vegetal, filas precisas y formularios con etiquetas visibles dan a la búsqueda de empleo un lugar ordenado y sobrio. La interfaz está en español y utiliza texto, fechas y estados observados para orientar cada acción.

La dirección estética fue delegada por el usuario y construida directamente en código. Esta documentación captura la implementación terminada; no existe un comp aprobado ni una dependencia de imágenes raster. La autoridad de construcción es `buildPath: code` en `.impeccable/config.json`. El archivo previo `.impeccable/build/state.json` se conserva como registro histórico, sin autoridad sobre el diseño actual.

**Key Characteristics:**

- Superficies claras con bordes discretos y capas tonales.
- Acciones principales en verde bosque y controles secundarios blancos.
- Navegación persistente, tablas comparables y formularios por secciones.
- Información real, estados escritos y vacíos que ofrecen un siguiente paso.

## Colors

El verde bosque organiza las acciones; los neutros de papel y salvia sostienen la lectura prolongada.

### Primary

- **Bosque:** `accent` identifica acciones principales, enlaces y cursor de escritura; `accent-hover` oscurece la acción al pasar el puntero.
- **Salvia de selección:** `nav-active` y `nav-active-ink` identifican la página activa. `soft` suaviza las respuestas de controles secundarios.

### Neutral

- **Papel:** `paper` es la superficie principal; `white` corresponde a campos y controles secundarios; `sidebar` separa el índice.
- **Tinta:** `ink` sostiene títulos y contenido. `muted` acompaña las descripciones; `supporting-ink` corresponde a fechas, cabeceras de tabla y pies tras el ajuste final de contraste.
- **Líneas:** `line` separa regiones y filas. Los campos y botones tienen sus propios bordes (`field-line`, `button-line`).

Los estados son semánticos: verde para enviada/entrevista/oferta, lavanda para CV listo, arcilla para cerradas y ocre para respuesta recibida. Cada tono acompaña una etiqueta textual. El rojo suave se reserva para acciones destructivas; los avisos de error usan una superficie oscura cálida.

**The Estado escrito Rule.** Cada estado comunica su significado mediante texto; el color refuerza esa información.

Los nombres históricos Slate e Indigo de Tailwind están remapeados a neutros claros y verdes en la hoja global para mantener pantallas heredadas. No interpretar esos nombres como una paleta oscura o azul. Los tokens anteriores representan los componentes de trabajo actuales; las excepciones locales continúan en `client/src/index.css`.

## Typography

**Body Font:** Segoe UI con system-ui y sans-serif de respaldo. La misma familia compone los títulos, los campos y los controles. Georgia aparece únicamente en la marca tipográfica `j.`; Consolas se utiliza en la configuración de conexión.

La jerarquía es contenida y humana: títulos seminegrita, texto pequeño preciso y párrafos de lectura con interlineado holgado. No hay una escala geométrica única; la jerarquía está ajustada a las superficies.

- **Headline:** título de página; baja a (26px) en móvil.
- **Title:** título de sección; los editores utilizan variantes observadas de (20px), y el detalle utiliza (24px) en escritorio y (21px) en móvil.
- **Body:** párrafos generales; las descripciones de página y formulario suelen usar (13px), con anchos entre (65ch) y (75ch).
- **Label:** etiquetas visibles de formulario; ayudas y fechas ocupan (10–12px).
- **Button:** control seminegrita compacto. Los números de resumen y las fechas usan cifras tabulares.

## Layout

El escritorio utiliza una cuadrícula de índice (224px) y contenido flexible con mínimo cero. El índice permanece pegado arriba y ocupa (100dvh). La barra superior mide (78px); la página centra un contenido máximo de (1510px), con márgenes interiores de (42px 40px 24px).

Las filas de candidaturas alinean identidad, modalidad, estado, fecha y flecha. La primera columna admite títulos largos y salto de palabra. Los formularios usan dos columnas con separación de (24px), y el editor de contexto se limita a (900px). Las secciones se recorren con pestañas horizontales y el guardado queda visible al pie mediante una barra sticky.

- A partir de (1500px), los márgenes laterales aumentan a (56px).
- Hasta (1150px), el índice se reduce a (195px), los márgenes de página a (26px) y las filas se compactan.
- Hasta (800px), el índice se convierte en navegación horizontal desplazable, la barra superior mide (58px), la página usa márgenes laterales de (20px), y formularios, bienvenida y conexión pasan a una columna. La tabla oculta cabecera, fecha y flecha; cada candidatura apila identidad y metadatos.
- El detalle es un panel derecho de hasta (760px), limitado al ancho de pantalla, con altura de (100dvh). En móvil ocupa el ancho disponible. Su encabezado y pestañas no se comprimen; el cuerpo usa flex, mínimo de altura cero y desplazamiento propio. No restaurar las alturas calculadas anteriores: las reglas finales de la hoja las sustituyen para soportar encabezados multilínea y pantallas estrechas.

## Elevation & Depth

La aplicación es plana por defecto: fondos tonales, líneas y espacio separan el trabajo. Las sombras se reservan a diálogos y avisos flotantes; no hay cristal, desenfoque decorativo ni tarjetas elevadas repetidas.

- **Diálogo:** sombra (0 24px 70px #19251726), con velo (#18271655).
- **Aviso:** sombra (0 8px 28px #1a2c172a), situada sobre la interfaz.

**The Profundidad funcional Rule.** Reservar sombras para contenido que se superpone a la página.

## Shapes

Los controles tienen esquinas discretas; campos y búsqueda usan el radio `field`, botones y navegación `control`, paneles `panel`, y la bienvenida `welcome`. El diálogo de alta usa `dialog`; el panel lateral de detalle tiene esquinas rectas. Los estados son pequeñas etiquetas rectangulares suavizadas. Círculos se reservan al avatar, indicadores y números de preparación.

Los bordes finos de (1px) definen controles y filas. El vacío de fuentes usa un borde discontinuo. Los iconos son SVG de línea; la marca y los monogramas se construyen con texto. No hay activos raster que copiar o regenerar.

## Components

### Buttons

Controles claros y contenidos. El primario lleva tinta blanca sobre bosque, el secundario fondo blanco y borde neutro, y el destructivo fondo rojo suave. Todos comparten tamaño mínimo de altura (38px), separación de icono (8px) y transición de fondo/color (0.16s). El estado deshabilitado reduce opacidad a (0.45) y cambia el cursor. Las acciones de texto se subrayan al pasar el puntero; los controles de icono tienen nombre accesible.

### Inputs / Fields

Etiqueta encima del campo y ayuda debajo. El campo ocupa todo el ancho, admite mínimo de ancho cero y usa texto de (13px) con interlineado (1.5). Los placeholders utilizan el token final `placeholder`; no sustituyen etiquetas. Los textareas crecen verticalmente desde (80px). El foco de botones, enlaces, selects y campos usa contorno (2px) con separación (3px) en el color `focus`.

### Navigation

Icono de línea, texto y contador opcional alineado al extremo. La página activa combina peso, color y fondo, con `aria-current`. Las pestañas internas usan subrayado de (2px), mientras los filtros de candidaturas usan una superficie salvia. En móvil se permite desplazamiento horizontal para conservar los nombres completos.

### Chips

Las etiquetas de estado usan texto de (10px), peso (500) y separación interna de (5px). Conservar el texto del estado incluso donde haya poco espacio. Los contadores son secundarios a la etiqueta del filtro o la sección.

### Cards / Containers

La bienvenida se divide en introducción tonal y tres pasos sobre blanco; pasa a una columna en móvil. Los paneles de importación y edición usan superficie salvia clara, borde y padding. Las filas de candidaturas y fuentes se separan con líneas, sin convertir cada registro en una tarjeta flotante.

### Dossier detail

Diálogo nativo con nombre accesible, cierre visible y pestañas Oferta, Preparación y Actividad. El encabezado mantiene identidad y acción de apertura; el cuerpo desplaza documentos, notas y resultados. Los formularios con cambios pendientes protegen el cierre o la navegación. Mantener esta protección al extenderlos.

### Context editor and feedback

Perfil, preferencias, instrucciones, fuentes y respuestas permanecen en secciones separadas. El guardado de contexto/perfil conserva su alcance; añadir una fuente tiene su propia acción y borrador. No mostrar el guardado de una región como si persistiera otra. Los avisos se sitúan centrados abajo, admiten cierre y usan `status` o `alert` según su naturaleza.

Las transiciones sirven a estados de control. La preferencia de movimiento reducido desactiva animaciones, transiciones y desplazamiento animado.

## Do's and Don'ts

### Do:

- **Do** reutilizar el papel cálido, las acciones bosque y la jerarquía de texto existente.
- **Do** conservar etiquetas visibles, foco perceptible, nombres accesibles y estados escritos.
- **Do** permitir títulos largos, formularios de una columna y desplazamiento independiente en el detalle.
- **Do** distinguir el guardado de contexto, fuentes y documentos mediante acciones y avisos precisos.
- **Do** mostrar vacíos y recuentos reales sin poblar la interfaz con candidaturas ficticias.

### Don't:

- **Don't** reintroducir estética de terminal, navegación por cámara o texto decorativo monoespaciado.
- **Don't** transformar el sistema de filas y páginas en una colección de tarjetas elevadas.
- **Don't** reducir el contraste de ayudas y fechas ni usar placeholders como etiquetas.
- **Don't** derivar la altura del cuerpo del detalle de una altura fija supuesta para el encabezado.
- **Don't** tratar el estado histórico de construcción como un comp visual aprobado.
