# AGENTS.md — Buscawacha

## Producto

Buscawacha es un prototipo mobile-first de Buscaminas roguelite. Su objetivo actual NO es verse terminado: es comprobar si el loop de Buscaminas + pisos + mapas irregulares + elección de descenso resulta divertido.

Versión base: **v0.1.7**.
GitHub Pages publica desde `main`.
Arquitectura: sitio estático sin build ni backend (`index.html`, `styles.css`, `game.js`, `version.json`).

## NEXO

El núcleo debe seguir siendo reconocible como Buscaminas.

- Una casilla revela número o vacío.
- Los números cuentan minas entre las 8 casillas vecinas activas.
- Las casillas inexistentes de la silueta no cuentan como vecinas.
- Las banderas son manuales y no alteran las reglas.
- El primer toque de cada piso es seguro y, cuando hay espacio, también protege sus vecinas.
- Revelar una mina termina la run.
- Revelar todas las casillas no-mina completa el piso.
- Completar un piso lleva a una elección entre dos próximos pisos.
- NO agregar vida, armadura, daño parcial, revivir ni probabilidades de ignorar minas sin aprobación explícita.

## Roguelite

La progresión persistente debe ser principalmente horizontal, no de poder.

Persistir en `localStorage`:
- mejor piso alcanzado;
- pisos totales completados;
- cantidad de runs;
- ecos bancados;
- cantidad de muertes.

Cada piso superado vale 1 eco pendiente. Los ecos de una run se acreditan únicamente cuando el jugador pisa una mina y muere. Abandonar una run descarta esos ecos pendientes.

Desbloqueos actuales por ecos bancados:
- Sala: inicio;
- Cruz: inicio;
- Pasillo: 3 ecos;
- Anillo: 8 ecos;
- Caverna: 15 ecos.

Los desbloqueos habilitan nuevas geometrías. No deben mejorar las probabilidades del jugador.

## Pisos y generación

- Cada piso usa una silueta conectada de celdas activas.
- Las formas pueden variar proceduralmente, pero nunca deben generar grupos desconectados involuntariamente.
- La dificultad puede crecer mediante cantidad de casillas, densidad de minas y geometría.
- No subir necesariamente las tres variables al mismo tiempo.
- La pantalla entre pisos ofrece dos descensos; no tienen que aparecer siempre todos los tipos de piso disponibles.
- Tipos actuales: Seguro (menos minas, 10% recompensa, calidad baja), Normal (40%, calidad normal), Peligroso (más minas, 100%, calidad normal) y Pesado (cada mina consume 2 escudos, 65%, calidad alta).
- El primer piso mantiene una mejora garantizada de +1 escudo.
- Desde el segundo piso, la recompensa depende del tipo de piso completado.
- La información mostrada al elegir descenso es orientativa; el tablero real se genera al entrar.

## Mobile-first

El celular es la plataforma principal.

- No depender de hover.
- Tap corto siempre revela una casilla.
- Mantener pulsada una casilla alterna su bandera.
- No usar un selector de modo Revelar/Bandera en la interfaz.
- Evitar scroll horizontal.
- El tablero debe entrar en el ancho del viewport.
- La barra superior debe ser compacta.
- Priorizar controles claros y texto funcional antes que decoración.
- Evitar animaciones o feedback que retrasen el test del loop.

## Lenguaje de interfaz

Usar texto mínimo, neutro y funcional. Evitar chistes, jerga, frases grandilocuentes o intentos de complicidad.

## Dirección visual

Mientras siga siendo prototipo:
- blanco, gris y negro;
- bordes simples;
- sin assets gráficos salvo que sean necesarios para probar una mecánica;
- sin tiempo invertido en branding, ilustración, partículas o polish visual.

Si una mejora estética no ayuda a evaluar jugabilidad, postergarla.

## Versión y actualizaciones

Mantener siempre sincronizados:
- `VERSION` en `game.js`;
- versión visible en el header;
- query strings de `styles.css` y `game.js` en `index.html`;
- `version.json`.

El header debe mostrar la versión actual.

`checkForUpdate()` debe consultar `version.json` con `cache: 'no-store'` y cache-busting. Si la versión publicada difiere de `VERSION`, mostrar el botón **Actualizar a vX**. El botón debe recargar la página con un parámetro de cache-busting y NO borrar `localStorage`.

Comprobar actualizaciones:
- al cargar;
- al recuperar foco;
- periódicamente mientras la app permanece abierta.

No eliminar esta mecánica en futuras updates.

## Invariantes para futuras actualizaciones

Antes de publicar:
1. Revisar el estado actual de `main` para no pisar cambios nuevos.
2. Incrementar versión cuando cambia comportamiento o contenido jugable.
3. Mantener compatibilidad con `buscawacha-profile-v1`, incluyendo ecos y muertes, o migrarla deliberadamente.
4. Verificar primer toque seguro.
5. Verificar tap corto para revelar y long press para poner/sacar bandera.
6. Verificar expansión de ceros.
7. Verificar victoria al revelar todas las no-minas.
8. Verificar muerte al tocar mina y acreditación de ecos pendientes.
9. Verificar que abandonar NO acredite ecos pendientes.
10. Verificar elección entre dos pisos.
11. Verificar que las formas activas sean conectadas.
12. Verificar layout en viewport móvil angosto.
13. Verificar que el detector de versión no borre progreso.

## Alcance actual

No incorporar todavía, salvo pedido explícito:
- combate;
- personajes;
- inventario;
- economía;
- perks estadísticos;
- eventos narrativos complejos;
- animaciones elaboradas;
- audio;
- online;
- login;
- backend;
- rankings globales.

La pregunta de diseño que debe guiar esta etapa es: **¿resulta divertido encadenar partidas breves de Buscaminas con siluetas distintas y elegir el próximo riesgo?**
