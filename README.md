# EL CUBO — Demo web 3D (5×5×5)

Juego web de exploración inspirado en la película *El Cubo / Cube (1997)*:
atrapado en un laberinto de salas cúbicas, debes encontrar la salida resolviendo
retos matemáticos en las puertas.

## Archivo y ruta

- `C:\Users\mañana\Documents\Default Project\index.html` — estructura y menús.
- `C:\Users\mañana\Documents\Default Project\styles.css` — todos los estilos.
- `C:\Users\mañana\Documents\Default Project\game.js` — toda la lógica del juego.
- `C:\Users\mañana\Documents\Default Project\README.md` — este documento.
- Los tres archivos de código deben estar **en la misma carpeta**.

## Cómo ejecutar

1. Doble clic en `index.html` (vale cualquier navegador moderno).
2. Requiere **internet**: Three.js r128 se carga desde CDN
   (`https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`).
3. Pulsa **⛶ ENTRAR AL CUBO** y juega.

## Objetivo y flujo de juego

1. Apareces en un **cubo aleatorio** del laberinto (a mínimo 5 cubos de distancia Manhattan de la salida).
2. Explora cruzando puertas. Cada puerta pide un **reto matemático** (desactivable).
3. La **salida** está en un **borde aleatorio** del cubo: entrar en su sala **NO gana**.
   Sus paredes al exterior son **blancas**: pulsa sobre la **pared blanca** para escapar y ganar.

## El laberinto

- Tamaño **5×5×5 = 125 salas**, procedural y determinista (misma semilla → mismo laberinto).
- Salida aleatoria en cada partida: celda del borde (`x/y/z == 0 o 4`).
- Inicio aleatorio en cada partida, con distancia mínima de 5 a la salida.
- Estética por sala: **steampunk** (cobre, remaches, tuberías, engranajes) o
  **cyberpunk** (circuitos neón), con las 6 paredes distintas generadas por semilla.

## Puertas (una por eje, con animación)

| Eje | Tipo | Glifo |
|-----|------|-------|
| X (ESTE/OESTE) | Diafragma fotográfico de 6 palas (obtura al abrir) | ◉ |
| Y (ARRIBA/ABAJO) | Una hoja deslizante lateral sobre raíles | ═ |
| Z (NORTE/SUR) | Doble hoja que se parte por el centro | ║ |

- Cada puerta vive en un **nicho**: portal hundido con jambas (cobre en steampunk,
  oscuro en cyberpunk) que da grosor a los muros.
- Las paredes tienen el **hueco real** de la puerta (transparencia): al abrir se ve a través.
- Al cruzar: la cámara mira a la puerta, esta se abre mostrando un **pasadizo**
  con la **sala vecina real al fondo** (se construye bajo demanda), la cámara lo
  recorre volando **sin fundido** y la puerta se cierra tras ella.
- Las puertas que dan al muro exterior **no aparecen** (ni en 3D ni en el panel),
  salvo la de escape (pared blanca, sin puerta visible: se pulsa la pared).
- La vecina muestra sus 6 puertas (la de entrada, abierta) con un segundo set
  reutilizable; si el compás está allí se ve su destello dorado (informativo,
  no recogible hasta entrar).

## Retos matemáticos de puerta

Dificultad según distancia al centro (4 niveles: BÁSICA, MEDIA, ALTA, EXTREMA),
desde sumas hasta ecuaciones `ax + b = c`. Cada cruce genera una operación nueva;
fallar genera otra (sin penalización).

## Estado activado / desactivado

| Elemento | Estado por defecto | Dónde se cambia |
|----------|-------------------|-----------------|
| Retos de puerta (cálculos) | ✅ ACTIVADOS | Casilla “Retos de puerta activados” (panel lateral) |
| Luz central de la sala | ❌ APAGADA | Casilla “Luz central” (panel lateral, bajo el estado de sala) |
| Retos de sala (adivinanza, secuencia, memoria, lógica, reflejos) | ❌ DESACTIVADOS | Código presente pero sin llamar (residual) |
| Brújula 🧭 del HUD | ❌ OCULTA | Se activa recogiendo el compás |
| Marca del compás en minimapa | ❌ OCULTA | Casilla “Marcar compás en minimapa” (panel lateral) |
| Partículas flotantes de polvo | ❌ ELIMINADAS | — |
| Línea amarilla de recorrido (minimapa) | ❌ ELIMINADA | — |
| Tiras neón 3D amarilla/fucsia | ❌ ELIMINADAS | — |
| Trampas (~12 % de salas, rojas en minimapa) | ⚠️ SOLO VISUAL | Sin daño: el daño estaba ligado a los retos de sala |
| Vidas (❤×3 en el HUD) | ⚠️ SIN EFECTO | Sin fuentes de daño activas |

## Compás 🧭

- Escondido en una sala al azar (distinta del inicio y la salida, **sin marca en el minimapa**).
- Flota sobre el suelo con aro dorado; su aguja roja **apunta hacia la salida**.
- Se recoge con el botón dorado del panel o pulsándolo en 3D → activa la brújula del HUD.

## Minimapa 3D

Cubos lado a lado con el recorrido: 🟩 tú (pulsante) · 🟦 núcleo central ·
🟨 salida (siempre visible) · 🟥 trampa · ⬜ compás (solo con la opción activa).
Arrastre para rotar, rueda para zoom, botones ⏸ ROTACIÓN y ⬒ VISTA TOP.

## Controles

- Arrastrar: mirar · Click en puerta: cruzar · Click en pared blanca: escapar.
- Flechas: mirar · Teclas E/O/N/S/U/J: intentar puertas ESTE/OESTE/NORTE/SUR/ARRIBA/ABAJO.
- El click distingue arrastre de pulsación (umbral 7 px).

## Notas técnicas

- Sin dependencias de build: `index.html` + `styles.css` + `game.js` vanilla + Three.js global
  (el `<script src="game.js">` va al final del `<body>`, tras el CDN de Three.js).
- Las 125 salas no se instancian: se generan bajo demanda por hash de coordenadas.
- Ajustes rápidos en el código: `SIZE`/`C` (tamaño), `randomBorderExit` (salida),
  `doorDifficulty` (niveles), `sector` (etiquetas), `manhattan(...)<5` (distancia mínima).
