const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');

test('incomplete file metadata never crashes the meeting viewer', () => {
  const { sharedFileExtension, getPresentationKind } = load('lib/shared-file-types.ts');
  assert.equal(sharedFileExtension(undefined), '');
  assert.equal(sharedFileExtension(null), '');
  assert.equal(getPresentationKind(undefined), null);
  assert.equal(getPresentationKind('slides.PPTX'), 'slides');
});
