const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const load = require('./load-typescript.cjs');

test('shared slide preview uses the stored file name and is available to other participants', async () => {
  let stored = { name: 'shared.PPT', size: 4 };
  let conversions = 0;
  const { GET } = load('app/api/files/presentation/route.ts', {
    '@/lib/db': async () => {},
    '@/models/SharedFile': { findOne: () => ({ lean: async () => stored }) },
    '@/lib/server-file-storage': { diskPath: () => '/shared-file' },
    '@/lib/supabaseServer': { supabaseServer: {} },
    'node:fs/promises': { stat: async () => ({ size: stored.size }), readFile: async () => Buffer.from('deck') },
    '@/lib/powerpoint-presentation': { convertPresentationToPdf: async (bytes, extension) => {
      conversions++;
      assert.equal(extension, 'ppt');
      assert.equal(bytes.toString(), 'deck');
      return Buffer.from('%PDF-test');
    } },
  });
  const request = () => new Request('https://app/api/files/presentation?path=local/room/id&name=untrusted.exe');
  const response = await GET(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.equal(await response.text(), '%PDF-test');
  stored = { name: 'large.ppt', size: 101 * 1024 ** 2 };
  assert.equal((await GET(request())).status, 413);
  assert.equal(conversions, 1);
  stored = null;
  assert.equal((await GET(request())).status, 404);
});

test('real PPT and PPTX slide decks convert to PDF without changing the originals', async t => {
  const binary = process.env.LIBREOFFICE_PATH || (process.platform === 'win32'
    ? 'C:/Program Files/LibreOffice/program/soffice.exe' : '/usr/bin/libreoffice');
  try { await fs.access(binary); } catch { t.skip('LibreOffice is not installed on this test host'); return; }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'melanam-slide-test-'));
  t.after(async () => {
    const target = path.resolve(directory);
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
    assert.ok(path.basename(target).startsWith('melanam-slide-test-'));
    await fs.rm(target, { recursive: true, force: true });
  });
  const source = path.join(directory, 'sample.fodp');
  await fs.writeFile(source, `<?xml version="1.0" encoding="UTF-8"?>
    <office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
      xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
      xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
      xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
      office:version="1.2" office:mimetype="application/vnd.oasis.opendocument.presentation">
      <office:body><office:presentation><draw:page draw:name="Slide 1">
      <draw:frame svg:x="1cm" svg:y="1cm" svg:width="15cm" svg:height="5cm">
      <draw:text-box><text:p>Shared meeting presentation</text:p></draw:text-box>
      </draw:frame></draw:page></office:presentation></office:body>
    </office:document>`);
  const { convertPresentationToPdf } = load('lib/powerpoint-presentation.ts');
  for (const extension of ['ppt', 'pptx']) {
    await promisify(execFile)(binary, [
      `-env:UserInstallation=${pathToFileURL(path.join(directory, 'fixture-profile')).href}`,
      '--headless', '--convert-to', extension, '--outdir', directory, source,
    ], { timeout: 60000, windowsHide: true });
    const filename = path.join(directory, `sample.${extension}`);
    const bytes = await fs.readFile(filename);
    const pdf = await convertPresentationToPdf(bytes, extension);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.length > 1000);
    assert.deepEqual(await fs.readFile(filename), bytes);
  }
});
