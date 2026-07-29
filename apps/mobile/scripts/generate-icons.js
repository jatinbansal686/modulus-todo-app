/**
 * Generates Android launcher icons from assets/logo.svg.
 *
 * Run from apps/mobile. Uses the `sharp` that ships with react-native-bootsplash,
 * so there is no extra toolchain to install.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const APP_ROOT = path.join(__dirname, '..');
const RES = path.join(APP_ROOT, 'android/app/src/main/res');
const LOGO = fs.readFileSync(path.join(APP_ROOT, 'assets/logo.svg'));

/** Near-black ground, matching tokens.elevation.dark[0]. */
const BACKGROUND = { r: 0x0b, g: 0x0f, b: 0x14, alpha: 1 };

const DENSITIES = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
];

/**
 * Adaptive foreground is a 108dp canvas whose central 72dp is the guaranteed-safe
 * zone — launchers crop and animate the rest. Drawing the mark at 60dp leaves it
 * comfortably inside that circle under every mask shape.
 */
const ADAPTIVE_CANVAS_DP = 108;
const ADAPTIVE_LOGO_DP = 60;

/** Legacy square icon for API 24–25, which predates adaptive icons. */
const LEGACY_CANVAS_DP = 48;
const LEGACY_LOGO_DP = 32;

const round = (value) => Math.round(value);

async function renderLogo(sizePx) {
  return sharp(LOGO).resize(sizePx, sizePx).png().toBuffer();
}

/** Transparent canvas with the mark centred. Used as the adaptive foreground. */
async function adaptiveForeground(scale) {
  const canvas = round(ADAPTIVE_CANVAS_DP * scale);
  const logo = round(ADAPTIVE_LOGO_DP * scale);
  const offset = round((canvas - logo) / 2);

  return sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: await renderLogo(logo), top: offset, left: offset }])
    .png()
    .toBuffer();
}

/** Mark on the dark ground. `circular` masks it for `ic_launcher_round`. */
async function legacyIcon(scale, circular) {
  const canvas = round(LEGACY_CANVAS_DP * scale);
  const logo = round(LEGACY_LOGO_DP * scale);
  const offset = round((canvas - logo) / 2);

  const layers = [{ input: await renderLogo(logo), top: offset, left: offset }];

  if (circular) {
    // Applied as a destination-in mask so the corners become transparent rather
    // than a different colour — a launcher that applies its own mask then has
    // nothing square to clip through.
    const mask = Buffer.from(
      `<svg width="${canvas}" height="${canvas}"><circle cx="${canvas / 2}" cy="${
        canvas / 2
      }" r="${canvas / 2}" fill="#fff"/></svg>`,
    );
    layers.push({ input: mask, blend: 'dest-in' });
  }

  return sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: BACKGROUND,
    },
  })
    .composite(layers)
    .png()
    .toBuffer();
}

async function main() {
  for (const [density, scale] of DENSITIES) {
    const dir = path.join(RES, `mipmap-${density}`);
    fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(
      path.join(dir, 'ic_launcher_foreground.png'),
      await adaptiveForeground(scale),
    );
    fs.writeFileSync(
      path.join(dir, 'ic_launcher.png'),
      await legacyIcon(scale, false),
    );
    fs.writeFileSync(
      path.join(dir, 'ic_launcher_round.png'),
      await legacyIcon(scale, true),
    );

    console.log(`mipmap-${density}: written`);
  }

  // A 512px marketing-size render, handy for the README and a store listing.
  fs.writeFileSync(
    path.join(APP_ROOT, 'assets/icon-512.png'),
    await legacyIcon(512 / LEGACY_CANVAS_DP, false),
  );
  console.log('assets/icon-512.png: written');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
