# makefun-gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/victory-c/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/victory-c/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Sunline Heat** is an original open-world crime game that runs in a desktop browser. It is plain JavaScript on a 2D canvas, with no libraries, no assets and no network requests. You play Nina Reyes, home after six years upstate, and over six story missions you take Sunline City back from Silas "Saltwater" Crane.

- **The city:** a 100×100-tile coastal city generated from a seed. It has Ocean Drive and Sunline Beach, Downtown towers, Coral Hills villas with pools, Calle Mango, Port Solmar's docks and piers, Bayfront Park and the Verde Links golf course. Buildings are drawn in pseudo-3D (roofs lean away from the camera like GTA2's), with cast shadows, palms, umbrellas, rooftop pools, helipads and landmarks.
- **On foot and by car:** walk, sprint, punch or shoot with the mouse. Steal any car with F; if someone is driving, you pull them out. Seven vehicle types use arcade physics with handbrake drifts, skid marks, damage, smoke, fire and explosions.
- **Traffic and pedestrians:** AI cars follow a road graph on the right-hand lane, slow for corners and honk at you. Pedestrians stroll the sidewalks and run from gunfire.
- **Wanted level and police:** five stars. Crimes raise heat. Police cars follow the road grid to reach you and ram you; officers get out, try to arrest you at low heat and open fire at higher heat. Stay out of sight to lose them, or pay $100 at a Fresh Coat garage to clear your stars. If you die you're WASTED and wake up at the hospital; if they catch you you're BUSTED and lose your guns.
- **Story:** six missions told through dialogue: *Homecoming*, *Golden Wheels*, *Collection Day*, *Shark Bait*, *Special Delivery* and *Armored Sunset*. They include timers, losing the cops, gang shootouts and an armored-truck heist that ends with a getaway by boat.
- **HUD:** clock, money, health and armor, weapon and ammo, wanted stars, and a minimap with blips (police, targets and services). There's also a speedometer, a vehicle-health bar, zone names, an objective line, a full city map (M) and a pause menu.
- **Day and night:** a 24-minute day with golden-hour and dusk tints. At night, streetlights, headlights, police lights, lit windows and neon roof trims come on.
- **Sound:** synthesized live with WebAudio: engine, siren, guns, crashes, pickups, and "Sunline FM", a synthwave car radio.
- **Saving:** a title screen with Continue and New Game. The game autosaves after each mission, saves at the safehouse, and you can also save from the pause menu.

Every name, place, character and piece of art here was made for this game. It uses nothing from any existing franchise.

## Run it

```sh
node serve.ts   # then open http://localhost:8080 in desktop Chrome
# controls: WASD drive/walk · mouse aim · click shoot · F steal/enter/exit car · Space handbrake
#           Q/E weapons · H horn · R radio · M map · Esc pause
# hand-in:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
# screenshots (real renders of the game's own ?shot= scenes): CHROME=/path/to/chrome node tools/shoot.mjs
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=dsps50bd&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
