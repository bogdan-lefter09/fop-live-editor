import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Resolves the FOP/Java setup used by the integration and E2E tests.
// Each piece comes from an env var if set, otherwise from the bundled setup in assets/bundled (see README).
const repoRoot = path.resolve(__dirname, '..', '..');
const bundled = path.join(repoRoot, 'assets', 'bundled');

export const serverSrc = path.join(bundled, 'fop', 'server', 'FopServer.java');
export const fopDir: string = process.env.FOP_DIR || path.join(bundled, 'fop');
export const gsonJar: string = process.env.GSON_JAR || path.join(bundled, 'fop', 'server', 'gson-2.10.1.jar');

const envJavaHome = process.env.FOP_JAVA_HOME || process.env.JAVA_HOME;
const bundledJre = path.join(bundled, 'jre');

// Runtime used to run FopServer: env JDK, else bundled JRE, else `java` on PATH
export const javaHome: string | undefined =
  envJavaHome || (fs.existsSync(path.join(bundledJre, 'bin', 'java.exe')) ? bundledJre : undefined);

// javac is needed to compile FopServer.java; the bundled JRE has none, so only an env JDK or PATH works
const javacHome = envJavaHome;

export const javaBin = javaHome ? path.join(javaHome, 'bin', 'java') : 'java';
export const javacBin = javacHome ? path.join(javacHome, 'bin', 'javac') : 'javac';

export const jars = (dir: string): string[] =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.jar')).map(f => path.join(dir, f)) : [];

export function hasFopSetup(): boolean {
  try {
    if (!fs.existsSync(path.join(fopDir, 'build')) || !fs.existsSync(path.join(fopDir, 'lib'))) return false;
    if (!fs.existsSync(gsonJar)) return false;
    execFileSync(javacBin, ['-version'], { stdio: 'ignore' });
    execFileSync(javaBin, ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
