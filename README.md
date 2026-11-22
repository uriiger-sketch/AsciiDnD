# SUNDOWN

**A light-reactive 3D ASCII graphics engine.** Every visible thing on screen is one of the
95 printable ASCII characters, placed in a real 3D world, lit by a real sun, moon and firelight.
WebGL2, no dependencies, one HTML file.

This is the graphics engine only. The showcase world is a first sketch of the game it is for:
high desert, mesas, a frontier town called Sundown, a railroad, a box canyon with a waterfall,
two camps and a rider.

## Run it

Open `index.html` in any modern browser (desktop or phone). It is fully self-contained.

- drag to look around, pinch or scroll to move in, two fingers or right-drag to travel, `W A S D` to walk
- **Shot** jumps between ten camera set-ups, **Tour** cuts between them on its own (space = next)
- **Hour** scrubs the sun and moon, **Run day** lets a day pass in two and a half minutes
- **Sky** switches weather: clear, clouds, dust storm, thunderstorm, mist
- **More** has glyph size, underglow and light toggles

To rebuild after changing the source:

```
npm install
npm run build          # writes index.html (standalone) and dist/artifact.html (body fragment)
npm run shot -- shots/out.png "shot=main&ui=0" 1280 720 3   # headless screenshot
```

## What is new here

1. **Light chooses the letter.** Each material owns a small palette of characters (sandstone,
   wood, hide, water ...). At start-up the engine rasterises the device's own monospace font,
   measures the ink coverage of every glyph, and sorts each palette into a ramp. Per glyph, per
   frame, the lit colour picks a level on that ramp. Shadows, sunsets, lantern light and lightning
   literally rewrite the text of the world.
2. **Glyphs are signed distance fields**, built at run time. They stay crisp at any size, their
   stroke weight follows brightness, and neighbouring ramp levels *morph* into each other instead
   of popping.
3. **The ground is a glyph field with no stored glyphs.** A quadtree picks a few hundred tiles on
   the CPU; the GPU derives every character from the tile id and `gl_InstanceID`: position,
   material, light, wind, level of detail. Density on screen is constant from your boots to the
   horizon, yet every glyph is anchored to a fixed place in the world (nothing swims).
4. **Grass is free strokes.** Each blade is a `|` drawn along the projected direction of a blade
   that leans with a gusting wind field and parts around anything that moves through it.
5. **Shadows are height fields, not shadow cameras.** For every ground texel the engine stores
   the height below which a point is in shadow. One lookup shadows anything at any height. A
   coarse map covers the whole land (mesa shadows a kilometre long); a sharp one follows the
   camera and takes every glyph object as an occluder, riders included.
6. **Sculpted glyph objects.** Shapes are described as soft unions of distance-field primitives
   and baked into a one-voxel shell of glyph cards with normals, baked ambient occlusion and bone
   indices. Rows of the lattice are taller than wide, so a horse is typeset in lines of text
   wrapped around a form. Near the silhouette the glyph becomes a stroke (`/ | \ -`) that follows
   the outline.
7. **Architecture is typeset.** A wall is a page of characters lying in its plane, generated in
   three sizes; the shader shows whichever is legible at the current distance. Signs are words.
8. **The sky is a terminal.** A fixed grid of cells behind the world: gradient, a sun of `@#O`
   with a hand-drawn corona, a shaded moon with phase, twinkling stars, clouds from the same
   field that shades the land.
9. **Order-independent ink.** Dark "paper" geometry and backed glyph cards write depth; bare
   ink is blended with `MAX`, so there is no sorting anywhere and every edge is anti-aliased.
10. HDR finish: bloom, light shafts from the sun, heat shimmer, filmic tone map, a night grade
    that turns moonlight blue and leaves firelight warm.

## Layout

```
src/engine/   atlas (SDF glyphs + ramps), glsl (shared lighting / LOD), terrain (glyph field),
              batch (glyph objects, skeletons), sculpt (SDF baker), shadows, sky, particles
              (fire, dust, rain, waterfall), post, atmosphere (sun, moon, weather), engine
src/world/    land (terrain generator), props, town, actors (rider, tumbleweeds), world
src/main.js   showcase: shot director, lightning, controls
scripts/      build (esbuild -> single file), shot / uitest (headless Chromium)
```

## Using the engine for the game

- `Sculpt` + `Template` + `EntityLayer`: new characters and creatures (up to 28 bones each).
- `Builder.building({...})` in `src/world/town.js`: new buildings from a few numbers and a sign.
- `Particles.emit(kind, ...)` and `KIND` in `src/engine/particles.js`: muzzle flashes, dust, smoke.
- `engine.lights.push({ pos, radius, color, flicker })`: lanterns, fires, gunfire.
- `engine.disturbers.push({ x, z, radius, strength })`: anything that should part the grass.
- `Atmosphere.hour`, `Atmosphere.setWeather(name)`: time and weather.

Verified in headless Chromium (software rasteriser). Not yet measured on physical phones or
desktop GPUs; the page lowers resolution, then glyph density, if the frame rate drops.
