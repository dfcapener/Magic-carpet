# Magic Carpet — Reverse-Engineering Notes

This document records what we know about Bullfrog's *Magic Carpet* (1994, DOS)
and how each system maps onto our browser reimplementation. It is a
**clean-room** effort: we describe observable behaviour of the original game and
re-create it with our own code and procedurally generated assets. No original
code, graphics, sound or level data is copied or shipped in this repository.

If you own the original game, a future milestone may add an *optional* loader
that reads data files from your own install at runtime (see "Original data
files" below) — they are never committed here.

---

## 1. The game in one paragraph

You are a wizard on a flying carpet. Each level is a wrapping island world
littered with **mana balls**. You claim mana by casting **Possession** on it,
then **balloons** from your **castle** fly out, collect the possessed mana and
bring it home. Stored mana grows the castle and fuels your spells. Monsters and
rival wizards fight you for the same mana. A level is won once you control a
target share of the world's total mana.

## 2. Core systems

### 2.1 World / terrain

| Original behaviour | Our implementation |
| --- | --- |
| World is a square heightmap (256×256 cells in the original) that **wraps** on both axes — fly off one edge and you appear on the other. | `src/terrain.js`: 512×512 heightmap, all lookups masked with `& (SIZE-1)` so the world wraps. |
| Terrain is fully **deformable**: spells raise/lower land, fireballs scorch, Earthquake/Volcano reshape it at runtime. | Heights are a `Float32Array`; `deform()` edits a region and `recolor()` recomputes lighting for just that region. Fireballs leave scorched craters. |
| Sea level with animated water; land coloured by height/slope (sand, grass, rock, snow). | Procedural tileable fractal noise + height/slope colour ramp + per-texel noise; water shimmer animated per frame. |
| Distance fog / haze hides the draw distance. | Linear fog blend toward the sky colour in the renderer. |

### 2.2 Rendering

The original renders a perspective-projected, Gouraud/texture-mapped heightmap
mesh with sprite-based objects (mana balls, creatures, balloons) and supports
banking of the view when turning, plus a famous red/blue stereo mode.

We use the closely related **voxel-space** technique (front-to-back column
raycasting with a per-column y-buffer, à la *Comanche*):

* Internal framebuffer 320×200 (`src/renderer.js`), upscaled with nearest
  neighbour for the chunky 1994 look.
* Camera pitch = horizon shift; carpet **banking (roll)** = rotating the final
  framebuffer when blitting to the screen.
* A per-pixel depth buffer is written by the terrain pass so billboard sprites
  are correctly occluded by hills.

### 2.3 Player / carpet

* Mouse steers (yaw) and looks up/down (pitch); the carpet moves forward/back
  and strafes. It hovers at an adjustable height above the ground and can never
  go below it.
* Turning banks the carpet.
* Health regenerates slowly; on death you are resurrected at your castle (or
  your start point if you have none) — in the original you lose some mana when
  this happens; we do the same.

### 2.4 Mana economy

| Original | Ours |
| --- | --- |
| Mana balls lie on the ground, neutral (white/grey). | `ManaBall` entities, neutral colour. |
| **Possession** spell tints a ball in your colour. | Right mouse button fires a possession bolt; a ball it hits becomes yours. |
| Balloons launch from your castle, fly to possessed balls, carry them home. | `Balloon` entities. One balloon per castle level. |
| Castle grows (more rings / towers) as stored mana passes thresholds. | Castle is stamped *into the terrain* (`Castle.stamp`), raising walls/towers; it re-stamps bigger at each level threshold. |
| Killing creatures releases mana. | Dead monsters drop a neutral mana ball. |
| Level goal: own N% of world mana. | HUD shows `% world mana`; reaching the goal wins the level. |

### 2.5 Spells (original roster, by approximate unlock order)

Fireball, Heal, Possession, Castle, Speed Up, Rapid Fire, Lightning, Shield,
Meteor, Invisibility, Raise Land, Lower Land, Destroy Castle, Earthquake,
Crater, Volcano, Duel, Swarm, Rebound, Lightning Storm, Global Death,
Steal Mana, Firestorm, Teleport, Mana Magnet, Summon Undead/Creature.

Implemented in milestone 1: **Fireball** (LMB), **Possession** (RMB),
**Castle** (C), **Heal** (H). Others are on the roadmap below.

### 2.6 Creatures

Original bestiary includes vultures, bees, worms, killer bees, griffons,
skeleton armies, trolls, crabs, wyverns, genies, nomads, archers, krakens and
the rival AI wizards. Milestone 1 ships a flying **Vulture**-style creature
that wanders and dives at the player.

## 3. Original data files (for later reference)

Publicly documented facts about the DOS release, useful if we add an optional
"bring your own data" loader:

* Assets live in `DATA/` and `LEVELS/` directories; many files are compressed
  with Bullfrog's **RNC ProPack** (header magic `RNC\x01`/`RNC\x02`).
* Palettes are 256-colour VGA palettes (6-bit components ×4 to get 8-bit).
* Level files describe terrain seed/heightmap, object placement and the
  level's spell list.

The community projects *Remc1* and *magic-carpet-2-hd* have documented these
formats in more depth; any loader we write must read from the user's own copy
and must never be bundled.

## 4. Architecture of this repo

```
index.html          page shell, canvas, overlay
src/main.js         bootstrap + fixed-step game loop
src/config.js       tunables
src/terrain.js      heightmap generation, colouring, deformation, wrap math
src/renderer.js     voxel-space terrain + depth-tested sprites + banking blit
src/sprites.js      procedural sprite images
src/input.js        keyboard / mouse / pointer lock
src/player.js       carpet physics & spell casting
src/entities.js     mana balls, projectiles, castle, balloons, creatures
src/hud.js          health/mana bars, minimap, messages
src/audio.js        WebAudio synthesized sound effects
tools/smoke.mjs     headless Playwright smoke test
```

## 5. Roadmap

1. ✅ **M1 – Playable core:** deformable wrapping terrain, carpet flight,
   fireball/possession/castle/heal, balloons, castle growth, vulture enemies,
   HUD + minimap, win condition.
2. **M2 – Spell book:** spell selection UI, Lightning, Shield, Speed Up,
   Raise/Lower Land, Crater, Earthquake, Volcano, Meteor.
3. **M3 – Rival wizards:** AI wizard with its own castle, balloons, and spell use.
4. **M4 – Bestiary:** bees, worms, griffons, skeleton armies, krakens.
5. **M5 – Campaign:** multiple level definitions with spell unlocks and goals.
6. **M6 – Polish:** music, stereo (anaglyph) mode, gamepad, mobile touch.
7. **Optional:** bring-your-own original data loader (RNC decompression,
   palette and sprite import) — user-supplied files only.
