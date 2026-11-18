# Solmar Bay — an open-world crime game

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/sintaameliaa-mee/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/sintaameliaa-mee/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An entry for the [Make GTA 6 bounty](https://make.fun/bounty/gta6-01) on make.fun.
Rex Marlow is back in Solmar Bay with $120 and a debt to pay: steal cars, outrun
the police, run jobs for Mama Rosa — and take the Big Score.

## Play it

Serve `game/` with any static file server and open `index.html` in desktop Chrome:

```sh
cd game && python3 -m http.server 8080
# open http://localhost:8080/
```

No build step, no network: every script, texture and sound is generated from the
files under `game/` (Three.js is vendored as `game/vendor/three.min.js`, and all
sound is synthesized live with WebAudio).

## What is in the game

- A sun-soaked coastal city to explore on foot and by car: streets, traffic,
  pedestrians, a beach, a pier, a container dock and a downtown skyline.
- Cars to steal and drive — sedans, taxis, vans, trucks and sports cars — with
  arcade handling, damage, smoke and a handbrake.
- A wanted system: five stars, pursuing police cars with flashing light bars,
  armed officers at 3+ stars, busted/wasted, and heat that cools off out of sight.
- Five story missions for Mama Rosa, plus taxi fares and ten hidden packages.
- Combat on foot: punching and pistol shooting with tracers and muzzle flashes.
- A HUD with a live minimap, wanted stars, money, health/armour, weapon and
  speed, plus a start screen, pause menu and localStorage saves.
- Screenshot scenes (`?scene=chase|street|mission|drive`) start real gameplay
  in a set-up state, for taking pictures of the game.

## Layout

- `game/index.html` — the page and the HUD
- `game/js/` — one file per system: `city`, `vehicles`, `pedestrians`,
  `player`, `police`, `missions`, `combat`, `hud`, `audio`, `save`, `main`,
  `utils`
- `game/css/style.css` — HUD and menu styling
- `game/vendor/three.min.js` — vendored Three.js (r160)
- `screenshots/` — renders of the game's own code in a browser
- `main.ts` — copies `game/` and `screenshots/` to the output directory and
  writes `dossier.json`

Everything in this game — the city, the characters, the vehicles, the names, the
story, the art and the sounds — is original work made for this entry.
