# AGENTS.md — Buscawacha

## Producto

Buscawacha es un prototipo mobile-first de Buscaminas roguelite. Su objetivo actual NO es verse terminado: es comprobar si el loop de Buscaminas + pisos + mapas irregulares + elección de descenso resulta divertido.

Versión base: **v0.4.0**.
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
- Si el jugador está en 0 escudos, la tirada de recompensa se sesga hacia +1 escudo, pero NO lo garantiza: todavía pueden salir +1 espacio de escudo u otros objetos.
- Recompensa consumible actual: `?` (pista). Se puede acumular. Los ítems consumibles se muestran centrados debajo del mapa, sin texto, sólo con su icono y contador. `?` se arrastra sobre una casilla sin revelar; esa primera casilla queda marcada y se resaltan sólo las casillas contiguas válidas para elegir la segunda. Consume 1 unidad e informa cuáles de esas dos tienen mina.
- La información mostrada al elegir descenso es orientativa; el tablero real se genera al entrar.

## Travesía (prototipo)

Modo experimental separado del Buscaminas clásico. No reutilizar sus reglas para cambiar el modo principal sin un pedido explícito.

NEXO de Travesía: **un jugador ubicado en una casilla recorre una mazmorra mediante el sistema de minas del Buscaminas**.

Reglas actuales:
- Cada piso tiene seis salas conectadas en un circuito con una conexión transversal: hay bifurcaciones, distintos caminos y regreso a salas anteriores.
- Cada sala conserva la geometría irregular de Caverna, Pasillos o Salas rotas, en una grilla configurable de 11 × 13.
- Las salas se generan al visitarlas y conservan minas, números, casillas reveladas, banderas y objetos recogidos durante todo el piso.
- El jugador tiene una posición explícita, marcada con `●`. Sólo puede moverse a una casilla vecina activa, en ocho direcciones, incluidas diagonales.
- Tap sobre una vecina, controles de ocho direcciones, flechas y QWE/AD/ZXC permiten moverse. Las casillas reveladas pueden recorrerse de nuevo. Revelar ceros no desplaza al jugador.
- Los números cuentan minas en las ocho vecinas activas. Los ceros expanden automáticamente, sin abrir salidas ni recoger objetos remotos.
- Las salidas numeradas conectan con otra sala del mismo piso. Se atraviesan sólo desde una posición vecina. Al volver se ingresa por la conexión correspondiente.
- Una sala aleatoria contiene la compuerta `↓`. Sólo atravesarla genera el siguiente piso. No se exige limpiar todas las casillas ni completar salas.
- La entrada inicial y las llegadas a salas son seguras. La generación mantiene rutas conectadas y valida deducciones de Buscaminas hasta salidas y objetos.
- Una mina termina la travesía salvo que haya un escudo disponible. El escudo se consume y la casilla con mina queda bloqueada; el jugador permanece en su posición anterior.
- La bandera `⚑` se muestra centrada debajo del mapa y se arrastra con Pointer Events, como los objetos del modo principal. Soltarla en una casilla cubierta válida pone o saca una bandera; no se consume. Hay fantasma y resaltado de destino. Soltar fuera o cancelar no modifica el mapa y limpia los listeners.
- Mantener pulsado y clic derecho también ponen o sacan banderas. Una bandera bloquea el desplazamiento hasta quitarla.
- `S`: escudo; `?`: detector consumible; `R`: rescate opcional. Se recogen sólo al pisar su casilla. El inventario se comparte entre salas y se conserva al bajar de piso.
- El detector `?` comprueba una casilla cubierta adyacente al jugador. `Detector 4` informa minas en las cuatro vecinas ortogonales de la posición.
- Este modo no modifica perfil, ecos, desbloqueos ni progreso del modo clásico.
- Mantener la estética de prototipo, sin audio ni animaciones elaboradas.

Pregunta de diseño: **¿es divertido recorrer salas, deducir minas, explorar desvíos y buscar la compuerta?**

## Modo developer

- El header incluye un botón `DEV` accesible durante el desarrollo.
- Al activarlo aparece un panel de pruebas y el botón cambia a `JUGADOR`.
- El estado DEV persiste en `localStorage` con `buscawacha-dev-mode-v1`.
- El modo DEV puede modificar únicamente el estado de la run activa; no debe alterar el perfil persistente ni los desbloqueos.
- Controles actuales: sumar `?`, sumar/quitar escudos, sumar capacidad, completar piso y visualizar minas ya generadas.
- Los ítems futuros que necesiten test rápido deben poder agregarse desde este panel sin duplicar su lógica de inventario.

## Mobile-first

El celular es la plataforma principal.

- No depender de hover.
- Tap corto siempre revela una casilla.
- Mantener pulsada una casilla alterna su bandera tanto con touch como con mouse. Mientras se mantiene pulsada debe existir feedback visual simple antes de confirmar la bandera.
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
