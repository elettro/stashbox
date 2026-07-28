import fs from 'node:fs';

const rendererPath = 'video-render-worker/src/ffmpeg.mjs';
const testPath = 'video-render-worker/tests/ffmpeg.test.mjs';

function replaceExactly(source, before, after, label) {
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label} expected exactly one match, found ${occurrences}.`);
  }
  return source.replace(before, after);
}

let renderer = fs.readFileSync(rendererPath, 'utf8');
renderer = replaceExactly(
  renderer,
  `function fitNarrowOverlayText(text, preferredSize, width) {
  const horizontalPadding = 36;
  const availableWidth = Math.max(1, width * 0.86 - horizontalPadding);
  const widthAtOnePixel = Math.max(1, estimatedTextUnits(text));
  return Math.min(preferredSize, availableWidth / widthAtOnePixel);
}`,
  `function fitNarrowOverlayText(text, preferredSize, width) {
  const leftInset = width * 0.05;
  const rightSafeMargin = width * 0.06;
  const boxAndShadowAllowance = 44;
  const glyphWidthSafetyFactor = 1.12;
  const availableWidth = Math.max(
    1,
    width - leftInset - rightSafeMargin - boxAndShadowAllowance
  );
  const widthAtOnePixel = Math.max(
    1,
    estimatedTextUnits(text) * glyphWidthSafetyFactor
  );
  return Math.min(preferredSize, availableWidth / widthAtOnePixel);
}`,
  'portrait text fitting function'
);
fs.writeFileSync(rendererPath, renderer);

let tests = fs.readFileSync(testPath, 'utf8');
tests = replaceExactly(
  tests,
  `for (const [width, height] of [[1080, 1920], [1080, 1080], [1080, 1440]]) {`,
  `for (const [width, height] of [[1080, 1920], [1080, 1080], [1080, 1350], [1080, 1440]]) {`,
  'narrow-format dimension list'
);

tests = replaceExactly(
  tests,
  `test('Ken Burns filter uses smooth eased oversampled motion only when enabled', () => {`,
  `test('long portrait titles retain a conservative right-side safe margin', () => {
  const title = 'Party Spots and Waves (Newport Beach)';
  for (const [width, height] of [[1080, 1920], [1080, 1440], [1080, 1350]]) {
    const filter = buildOverlayFilter({
      width,
      height,
      metadata: {
        title,
        artist: 'Stashbox'
      },
      overlays: {
        intro_enabled: true,
        outro_enabled: false,
        corner_bug_enabled: true
      }
    }, 15);

    const titleSize = Number(
      filter.match(/text='Party Spots and Waves \\(Newport Beach\\)'.*?fontsize=(\\d+)/)?.[1]
    );
    assert.ok(
      titleSize > 0 && titleSize <= 40,
      String(width) + 'x' + String(height) + ' title size was ' + String(titleSize)
    );
  }
});

test('Ken Burns filter uses smooth eased oversampled motion only when enabled', () => {`,
  'long-title safe-margin test insertion'
);
fs.writeFileSync(testPath, tests);

console.log('Applied portrait title safe-margin changes.');
