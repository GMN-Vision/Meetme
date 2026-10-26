import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const run = promisify(execFile);
let activeConversions = 0;

export async function convertPresentationToPdf(bytes: Uint8Array, extension: string) {
  if (!['ppt', 'pptx', 'pps', 'ppsx', 'odp'].includes(extension)) throw new Error('Unsupported presentation format.');
  if (activeConversions >= 2) throw new Error('Other presentations are being prepared. Please retry shortly.');
  const windowsBinary = 'C:/Program Files/LibreOffice/program/soffice.exe';
  const binary = process.env.LIBREOFFICE_PATH || (process.platform === 'win32'
    ? await access(windowsBinary).then(() => windowsBinary).catch(() => 'soffice.exe')
    : 'libreoffice');
  activeConversions++;
  let folder: string | undefined;
  try {
    folder = await mkdtemp(path.join(os.tmpdir(), 'melanam-slides-'));
    const input = path.join(folder, `slides.${extension}`);
    await writeFile(input, bytes);
    await run(binary, [
      `-env:UserInstallation=${pathToFileURL(path.join(folder, 'profile')).href}`,
      '--headless', '--norestore', '--convert-to', 'pdf:impress_pdf_Export',
      '--outdir', folder, input,
    ], { timeout: 60_000, maxBuffer: 1024 * 1024, windowsHide: true });
    const pdf = await readFile(path.join(folder, 'slides.pdf'));
    if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid conversion output');
    return pdf;
  } catch (error: any) {
    if (error.code === 'ENOENT' && error.path === binary) {
      throw new Error('PowerPoint presentation requires LibreOffice on the app server. Configure LIBREOFFICE_PATH.');
    }
    throw new Error('Unable to prepare these slides. Check that the presentation is valid and not password-protected.');
  } finally {
    activeConversions--;
    if (folder) {
      // Only remove our own verified temporary directory, never an upload path.
      const target = path.resolve(folder);
      const temporaryRoot = path.resolve(os.tmpdir());
      if (path.dirname(target) === temporaryRoot && path.basename(target).startsWith('melanam-slides-')) {
        await rm(target, { recursive: true, force: true });
      }
    }
  }
}
