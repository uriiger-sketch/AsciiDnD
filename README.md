# SUNDOWN

A western tactical RPG drawn as a plain grid of upright ASCII characters. No sprites, no
rotation, no scaling, no glow: every cell is one printable character with a colour. It runs in
a browser (phone or desktop) from a single HTML file.

```
  #SALOON##++###  .#SHERIFF+#  #DOC#'##
oo_____________iuu____%:____xg_________i
............:......:::.:...d............
......[==]........:@xx......r...........
..................:::..........o........
_xx_______io__________uu_______________i
#  #HOTEL#++##  ##BANK###  #CHURCH+#
```

## The game

Chapter one, **LEFT FOR DEAD**: Silas Crowe's gang took your horse, your gun and your name and
left you in the flats. You start with nothing but boots. Six fights, each bigger than the last:
two coyotes with a found knife, a pack at the stockyard with a rusty revolver, a rustlers' camp,
an ambush in Red Canyon, the dark of the Cinder Mine, and Crowe himself in the street at sundown.
There is also an optional trial at the standing stones. Roughly 1,400 turns, and you will die on the way.

**Time moves only when you do.** Each tap is one turn, so a gunfight is something you read:

- **Marked attacks.** A rifleman shows the line he will fire down. A dynamiter's stick shows
  its square and counts two. A rider marks his charge. Red squares are where not to stand.
- **Cover.** A barrel, trough, window or rock between you and a shooter cuts his chance by a
  third. The odds for your own shot are printed before you take it.
- **Six rounds.** Every gun has to be reloaded, yours and theirs. Count his shots.
- **Powder kegs** (`0`) explode. So does dynamite you buy.
- **The dark.** In the mine you see four steps, plus whatever a lantern lights. Assassins are
  invisible beyond three steps unless they stand in the light.

**No experience points.** The ledger counts what you actually do and names you for it: reload
under fire twelve times and you are QUICK HANDS; kill four men with your last round and the
last round never misses. Eight deeds, earned only by playing that way.

## Play

Open `index.html`. Progress is kept on the device.

- tap the ground to walk (far taps travel), tap an enemy to attack, tap yourself to wait
- buttons: FIRE, LOAD, AIM, DASH, SWAP weapon, BAG, LOOK (tap anything to learn what it is), MENU
- keys: arrows / WASD / numpad, `F` fire, `R` load, `Space` aim, `X` dash, `Q` swap, `I` bag, `L` look, `Tab` next target

## Build, test, deploy

```
npm install
npm run build              # index.html (standalone) and dist/artifact.html (fragment)
npm run sim -- 12          # a bot plays the whole chapter 12 times and reports deaths per fight
npm run uitest             # real taps and keys against the page in headless Chromium
npm run map                # print the valley as text
npm start                  # serve on PORT (default 8080); Dockerfile + railway.json do the same
```

## Layout

```
src/game/   data (terrain, creatures, weapons, deeds)  world (maps, field of view, paths)
            game (turns, shooting, cover, blasts, saving)  ai  quests (the chapter)
src/ui/     term (the character grid)  ui (map, status, buttons, menus)  art  sfx
scripts/    build, serve, bot + sim (balance), uitest, shot, dumpmap, trace
```

The rules in `src/game` never touch the screen, so the bot in `scripts/bot.mjs` plays the same
game a person does. Fight sizes were tuned with it: over twelve runs it finishes every time and
dies about three times per run, mostly in the canyon and the camp.

Tested in headless Chromium only. Not yet played on a physical phone.
