# Dark mode

Subsola's default is the light model view. Dark mode is an option for people who browse at night
or keep their system dark, not a new direction: same model, same APWA colors, same restraint.

## What the good ones do

- **Google Maps (dark):** a navy-gray ground, never black. Roads stay lighter than the land
  around them, so the street hierarchy survives the flip. Labels go light with a dark halo.
  Points of interest keep their category hues.
- **Apple Maps (dark):** warm charcoal ground, buildings a step lighter than the ground, satellite
  imagery left as is. Pins keep a white rim, which is what lifts them off any background.
- **Mapbox Dark / OpenFreeMap Dark:** the basemap drops to a few close grays so overlays carry
  the color. Water is darker than land, the way it is in daylight.
- **Felt:** the basemap mutes, the user's data stays saturated, and selected items get an outline
  that flips from dark to light.
- **Linear:** elevation by lighter surfaces instead of shadows; text in three steps of gray;
  primary buttons invert (light button, dark text).
- **Stripe dashboard:** chart colors get lighter variants for dark, every series checked against
  the surface it sits on; muted text is still readable.

## Our principles

1. **Not black.** The ground is a cool blue-gray (`#14181e`), the dark twin of the light ground's
   `#e6e9ee`. Pure black makes the colored pipes vibrate and hides the dark edges of fittings.
2. **Elevation is lightness.** Ground, then panel (`#1d222a`), then inset surfaces
   (`#272d37`). Shadows mostly vanish on dark, so the step in lightness does the work and every
   panel keeps its hairline border.
3. **The model reads the same.** In the scene, roads stay a step lighter than the ground, curbs
   lighter than roads, and buildings are a dark gray massing lit and shaded like the white one. On
   the city map, roads and buildings stand off the land by as much as they do in daylight, drawn
   lighter, the way Google's and Apple's dark maps draw them; water stays darker than land.
4. **Big fills go quiet, data stays loud.** Basemap, road, building and panel fills are low-chroma
   grays. The APWA utility colors keep their exact hues; on the dark ground every one of them
   clears 3:1 as is, so none is changed in the scene.
5. **Uncertain means dimmer, in both themes.** In light mode an inferred pipe is mixed toward
   white; on a dark ground that would make it brighter than a surveyed one. In dark mode it mixes
   toward the ground instead.
6. **Ink inverts.** Anything drawn in ink on the light model (the address tag, the selected pin,
   selection outlines, lead service markers, the live work pulse, primary buttons) is drawn in
   light ink on dark, with dark text where it carries text. Street tags stay a see-through dark
   so they never read as the address tag.
7. **White still means excavation.** Live work zones, the dig shaft and their pins stay APWA white
   with dark edges. On the dark ground they are the brightest things on the street, which is
   right: they are what's happening now.
8. **Pins keep their white rim.** The rim is what separates a pin from any background, light,
   dark or aerial photo.
9. **Text passes AA against the surface it actually sits on.** Body and muted text reach 4.5:1 on
   every panel and inset; chart bars, swatches, toggles and focus rings reach 3:1. Checked by
   `src/theme.test.ts`, not by eye.
10. **Photos are dimmed, never tinted.** Aerial imagery is multiplied by a neutral gray so it sits
    back under the pipes without a color cast.
11. **Hi-vis yellow keeps dark text.** The 811 button reads the same in both themes; it is the one
    light object in the chrome on purpose.
12. **Paper is paper.** The lot report follows the theme on screen and always prints light.

## How it works

- `public/theme.js` runs in `<head>` before the first paint (a same-origin script, so the
  `script-src 'self'` policy allows it with no hash). It reads the stored choice
  (`localStorage['subsola:theme']`: `light`, `dark` or missing for "match system"), resolves it
  against `prefers-color-scheme`, and sets `data-theme` and `data-theme-choice` on `<html>`. It
  follows system changes while the choice is "match system", and choices made in other tabs. It
  exposes `window.subsolaTheme` (`choice`, `theme`, `set`, `subscribe`) for the toggle.
- CSS defines each surface's tokens once on `:root` and overrides them under
  `@media screen { :root[data-theme='dark'] }`, so print always gets the light values. There is
  no CSS-only `prefers-color-scheme` fallback: the boot script always sets `data-theme`, and both
  pages need JavaScript to show anything anyway, so the tokens stay defined once per surface.
- `src/ui/themeToggle.ts` is the light/dark switch in the top bar of the map and the insights
  page. Until it's first clicked the page follows the system setting; a click stores `light` or
  `dark`.
- `src/theme.ts` lets TypeScript read the resolved theme and listen for changes. The 3D scene
  (`src/scene/palette.ts`) and the city map (`src/city/basemapTheme.ts`) recolor live, without
  reloading any data.
