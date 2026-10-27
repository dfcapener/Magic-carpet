# Magic Carpet (browser remake)

A clean-room, browser-based reimplementation of Bullfrog's 1994 classic
*Magic Carpet*. You fly a carpet over a wrapping, deformable island world,
possess mana, raise a castle whose balloons ferry mana home, and fight the
creatures of the skies.

No original game assets or code are used: terrain, sprites and sound are all
generated procedurally. See [docs/REVERSE_ENGINEERING.md](docs/REVERSE_ENGINEERING.md)
for the analysis of the original game and the roadmap.

## Play

No build step — it's plain ES modules. Serve the folder and open it:

```sh
npm start            # node tools/serve.mjs 8080
# open http://localhost:8080/   (add ?seed=1234 for a different world)
```

| Control | Action |
| --- | --- |
| Mouse (click to capture) / arrow keys | Steer and look |
| W A S D, Shift | Fly / strafe, boost |
| Space / Q | Climb / descend |
| Left click / F | Fireball (scorches craters into the land) |
| Right click / R | Possession — claim a mana ball |
| C | Raise your castle (once) |
| H | Heal |
| M | Mute |
| Esc | Pause |

**Goal:** hold 60% of the world's mana in your castle.

## Test

```sh
npm test             # headless Playwright smoke test (tools/smoke.mjs)
```

## Status

Milestone 1 (playable core) is done. Next up: the spell book, rival wizards,
more creatures and a campaign — see the roadmap in the docs.
