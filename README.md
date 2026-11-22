# SUNDOWN

**An alphabet western.** A role-playing game drawn entirely in the 95 printable ASCII characters,
in a real 3D world lit by sun, moon and firelight. WebGL2, no dependencies, one HTML file.

## The idea

The world is set in type, so the game takes that literally.

- **Your letters are everything you have.** They are your inventory, your skills and your voice.
  A word can be used only if you can spell it from the letters in your case. You arrive with no
  letters at all; the stationmaster writes you down as `NOBODY`, and those six letters are your
  whole character sheet: `NO`, `NOD`, `DO`, `BOO`, `BOND`.
- **A thing is what its sign says.** Letters on signs are real objects. Somebody has stolen the W
  off the `WELL`, so it is an `ELL` (a measure of cloth) and gives no water. `MEND` a letter back
  and the thing becomes itself again. `PRY` one off and it becomes something else: take the G
  off `FEED & GRAIN` and it rains.
- **Quests are spelling problems with consequences.** Earn the letters for a word, find the
  missing letter, decide whose sign to spoil. Every stolen letter is noticed, and you can give
  letters out of your own name.

## Chapter one: NOBODY

About 20 to 30 minutes. It grows from a one-word errand to a town-sized problem:

1. Arrive with nothing. Get a name of sorts.
2. Scare the crows off the oats (`BOO`).
3. The `ELL`: earn `MEND` from the smith, ask a widow for a W, bring the well back.
4. The `SALON`: with a question mark you can finally ask things. Find who has the O, or give one
   of your own and become `NOBDY`.
5. Fire at the livery. Buckets will not do it.
6. A man in black takes the S off `SUNDOWN`. In a town called `UNDOWN`, the sun cannot set.

Along the way: a dead man's hat, a tip jar nobody is watching, a store that sells consonants,
a paper you cannot read until you can spell `READ`, and words nobody teaches you
(`YODEL`, `BOOM`, `POEM`, `NAP`, `PRAY` ...). Tap your letters to try any word.

## Play

Open `index.html` in a modern browser, desktop or phone. Progress is kept on the device.

- tap or click the ground to walk, tap a person or thing to go to it, drag to look, pinch or scroll to zoom
- keyboard: `W A S D` walk, `E` / `Space` talk and continue, `1`-`9` choose, `J` journal
- **UPPERCASE** actions are words you must be able to spell; lowercase ones are free
- **Tour the land** on the title screen is the engine showcase: ten camera set-ups, time of day, weather

## Build and test

```
npm install
npm run build        # writes index.html (standalone) and dist/artifact.html (body fragment)
npm run playtest     # plays chapter one start to finish in headless Chromium, 20 checks
npm run playtest -- --shots   # the same, saving pictures to shots/
npm run shot -- shots/out.png "shot=main&ui=0" 1280 720 3     # an engine still
```

## The engine

1. **Light chooses the letter.** Each material owns a palette of characters. At start-up the
   engine rasterises the device's own monospace font, measures the ink coverage of every glyph,
   and sorts each palette into a ramp. Per glyph, per frame, the lit colour picks a level on it.
2. **Glyphs are signed distance fields**, built at run time: crisp at any size, weight follows
   brightness, neighbouring ramp levels morph instead of popping.
3. **The ground is a glyph field with no stored glyphs.** A quadtree picks tiles on the CPU; the
   GPU derives every character from the tile id and `gl_InstanceID`. Density on screen is
   constant from your boots to the horizon, and every glyph is anchored to a place in the world.
4. **Grass is free strokes** that lean with a gusting wind field and part around anything that moves.
5. **Shadows are height fields.** Per ground texel, the height below which a point is in shadow.
   One coarse map for the whole land, one sharp map that follows the camera and takes every
   glyph object as an occluder.
6. **Sculpted glyph objects.** Shapes are soft unions of distance-field primitives baked into a
   one-voxel shell of glyph cards with normals, ambient occlusion and bone indices.
7. **Architecture is typeset** in three sizes; the shader shows whichever is legible.
8. **Live text.** Signs, names, flying letters and shouted words are written into the world
   every frame by the same shaders, which is what lets the game take letters off walls.
9. **The sky is a terminal**: a grid of cells with a sun of `@#O`, a phased moon, stars, clouds.
10. Order-independent ink (`MAX` blend), HDR bloom, light shafts, heat shimmer, filmic grade.

## Layout

```
src/engine/   atlas, glsl, terrain, batch, sculpt, shadows, sky, particles, text, post, atmosphere
src/world/    land (terrain), props, town (buildings + signs), people, actors (horses), world
src/game/     letters (type case + lexicon), signs (editable signs), ui, game (core), chapter1, sfx
src/tour.js   the engine showcase        src/main.js   boot, title, mode switching
scripts/      build, playtest, shot, uitest, phoneshot
```

Writing more of the game: a chapter is one file like `src/game/chapter1.js`. It adds people
(`g.addNpc`), things (`g.addThing` with a `verbs` table keyed by word), reacts to signs changing
(`signChanged`), and reports the current objective. Words that work anywhere go in its `words`
table; their descriptions go in `LEX` in `letters.js`.

Verified in headless Chromium on a software rasteriser: the automated playthrough passes and
there are no console errors. Not yet measured on physical phones or desktop GPUs; the page
lowers resolution, then glyph density, if the frame rate drops.
