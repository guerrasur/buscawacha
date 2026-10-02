# Buscawacha

Prototipo mobile-first de Buscaminas roguelite.

## v0.3.0

- Buscaminas clásico con primer toque seguro.
- Tap para revelar; modo Bandera y long press para marcar.
- Tableros con siluetas no rectangulares.
- Cada tablero completado es un piso.
- Elección entre dos descensos al completar un piso.
- Una mina termina la run.
- Progresión persistente horizontal: cada piso superado genera 1 eco pendiente; los ecos se bancan al morir y desbloquean nuevas formas. Abandonar no los acredita.
- Header con versión visible y detector de actualización mediante `version.json`.
- Modo separado **Travesía (prototipo)**: explorar mazmorras irregulares usando reglas de Buscaminas, abrir sólo frontera conectada, aprovechar expansión de ceros, desviarse por recompensas visibles y elegir entre dos puertas para continuar. Incluye escudos, detector `?`, rescates opcionales y una lectura ortogonal inspirada en Mined-Out.

Sitio: https://guerrasur.github.io/buscawacha/

El alcance y las invariantes para próximas iteraciones están documentados en `AGENTS.md`.
