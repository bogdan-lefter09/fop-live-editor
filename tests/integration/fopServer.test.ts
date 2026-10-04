import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ChildProcessWithoutNullStreams, execFileSync, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fopDir, gsonJar, hasFopSetup, javaBin, javacBin, jars as jarsIn, serverSrc } from '../helpers/fopEnv';

// Needs a real FOP 2.x install, a gson jar and a JDK (javac). Uses FOP_DIR / GSON_JAR / FOP_JAVA_HOME (or JAVA_HOME)
// when set, otherwise the bundled setup in assets/bundled. See tests/helpers/fopEnv.ts.
const repoRoot = path.resolve(__dirname, '..', '..');
const usable = hasFopSetup();
const bin = (name: string) => (name === 'javac' ? javacBin : javaBin);
const jars = jarsIn;

describe.skipIf(!usable)('FopServer (integration)', () => {
  let tmp: string;
  let proc: ChildProcessWithoutNullStreams;
  let nextId = 1;
  let buffer = '';
  const waiting: Array<{ match: (r: any) => boolean; resolve: (r: any) => void }> = [];
  const seen: any[] = [];

  function onData(chunk: Buffer) {
    buffer += chunk.toString();
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith('RESPONSE:')) continue;
      const response = JSON.parse(line.slice('RESPONSE:'.length));
      const w = waiting.findIndex(x => x.match(response));
      if (w >= 0) waiting.splice(w, 1)[0].resolve(response);
      else seen.push(response);
    }
  }

  function waitFor(match: (r: any) => boolean, timeoutMs = 60_000): Promise<any> {
    const earlier = seen.findIndex(match);
    if (earlier >= 0) return Promise.resolve(seen.splice(earlier, 1)[0]);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Timed out waiting for FopServer response')), timeoutMs);
      waiting.push({ match, resolve: r => { clearTimeout(t); resolve(r); } });
    });
  }

  async function send(command: Record<string, unknown>) {
    const requestId = nextId++;
    const reply = waitFor(r => r.requestId === requestId);
    proc.stdin.write(JSON.stringify({ ...command, requestId }) + '\n');
    return reply;
  }

  async function startServer() {
    buffer = '';
    seen.length = 0;
    const classpath = [...jars(path.join(fopDir, 'build')), ...jars(path.join(fopDir, 'lib')), gsonJar, tmp].join(path.delimiter);
    proc = spawn(bin('java'), ['-Djavax.xml.accessExternalStylesheet=all', '-cp', classpath, 'FopServer'], { cwd: tmp });
    proc.stdout.on('data', onData);
    const ready = await waitFor(r => r.status === 'ready');
    expect(ready.status).toBe('ready');
  }

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fop-int-'));
    const classpath = [...jars(path.join(fopDir, 'build')), ...jars(path.join(fopDir, 'lib')), gsonJar].join(path.delimiter);
    execFileSync(bin('javac'), ['-cp', classpath, '-d', tmp, serverSrc], { stdio: 'pipe' });
    await startServer();
  });

  afterAll(async () => {
    if (proc && proc.exitCode === null) {
      const exited = new Promise(resolve => proc.once('exit', resolve));
      proc.kill();
      await exited;
    }
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  const examples = path.join(repoRoot, 'examples');
  const fixtures = path.join(repoRoot, 'tests', 'fixtures');
  const generate = (xml: string, xsl: string, name: string) =>
    send({ action: 'generate', xmlPath: xml, xslPath: xsl, outputPath: path.join(tmp, name), workingDir: path.dirname(xsl) });

  it('answers ping', async () => {
    expect((await send({ action: 'ping' })).status).toBe('pong');
  });

  it('generates a valid PDF from the example invoice', async () => {
    const res = await generate(path.join(examples, 'xml', 'invoice.xml'), path.join(examples, 'xsl', 'invoice.xsl'), 'invoice.pdf');
    expect(res.status).toBe('success');
    const pdf = fs.readFileSync(path.join(tmp, 'invoice.pdf'));
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('regenerates when the output already exists (repeat requests on one JVM)', async () => {
    const xml = path.join(examples, 'xml', 'sample.xml');
    const xsl = path.join(examples, 'xsl', 'sample.xsl');
    expect((await generate(xml, xsl, 'again.pdf')).status).toBe('success');
    expect((await generate(xml, xsl, 'again.pdf')).status).toBe('success');
  });

  it('reports malformed XML as an error and stays alive', async () => {
    const res = await generate(path.join(fixtures, 'broken.xml'), path.join(examples, 'xsl', 'sample.xsl'), 'bad1.pdf');
    expect(res.status).toBe('error');
    expect(res.message).toBeTruthy();
    expect((await send({ action: 'ping' })).status).toBe('pong');
  });

  it('reports a broken stylesheet as an error', async () => {
    const res = await generate(path.join(examples, 'xml', 'sample.xml'), path.join(fixtures, 'broken.xsl'), 'bad2.pdf');
    expect(res.status).toBe('error');
  });

  it('reports missing input files as an error', async () => {
    const res = await generate(path.join(tmp, 'missing.xml'), path.join(examples, 'xsl', 'sample.xsl'), 'bad3.pdf');
    expect(res.status).toBe('error');
  });

  it('rejects unknown actions without crashing', async () => {
    expect((await send({ action: 'bogus' })).status).toBe('error');
    expect((await send({ action: 'ping' })).status).toBe('pong');
  });

  it('shuts down on request and can be started again', async () => {
    const exited = new Promise<number | null>(resolve => proc.once('exit', code => resolve(code)));
    expect((await send({ action: 'shutdown' })).status).toBe('shutdown');
    expect(await exited).toBe(0);
    await startServer();
    expect((await send({ action: 'ping' })).status).toBe('pong');
  });
});

describe('FopServer prerequisites', () => {
  it.skipIf(usable)('is skipped: set FOP_DIR (+ GSON_JAR, JDK with javac) to run the integration tests', () => {
    expect(usable).toBe(false);
  });
});



