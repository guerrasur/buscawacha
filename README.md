# Buscawacha

Prototipo mobile-first de Buscaminas roguelite.

## v0.1.1

- Buscaminas clásico con primer toque seguro.
- Tap para revelar; modo Bandera y long press para marcar.
- Tableros con siluetas no rectangulares.
- Cada tablero completado es un piso.
- Elección entre dos descensos al completar un piso.
- Una mina termina la run.
- Progresión persistente horizontal: cada piso superado genera 1 eco pendiente; los ecos se bancan al morir y desbloquean nuevas formas. Abandonar no los acredita.
- Header con versión visible y detector de actualización mediante `version.json`.

Sitio: https://guerrasur.github.io/buscawacha/

El alcance y las invariantes para próximas iteraciones están documentados en `AGENTS.md`.
