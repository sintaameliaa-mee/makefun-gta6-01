// main.ts — hands the Solmar Bay entry in: copies game/ and screenshots/
// from this repository to the output directory and writes dossier.json
// with buildDossier from vendor/makefun-game.ts. Node 22, stdlib only.
// Runs twice and writes byte-identical files both times.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

/** Empties a directory's contents without removing the directory itself. */
function emptyContents(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    return;
  }
  for (const entry of readdirSync(dir)) {
    rmSync(join(dir, entry), { recursive: true, force: true });
  }
}

/** Copies a directory tree, entries in sorted order for determinism. */
function copyTree(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyTree(from, to);
    } else if (entry.isFile()) {
      copyFileSync(from, to);
    }
    // Anything else (symlink, socket) is refused by the dossier anyway.
  }
}

function main(): void {
  const gameSrc = join(REPO_ROOT, 'game');
  const shotsSrc = join(REPO_ROOT, 'screenshots');
  if (!existsSync(gameSrc) || !statSync(gameSrc).isDirectory()) {
    throw new Error('main.ts: game/ is missing from the repository');
  }
  if (!existsSync(shotsSrc) || !statSync(shotsSrc).isDirectory()) {
    throw new Error('main.ts: screenshots/ is missing from the repository');
  }
  emptyContents(OUTPUT_DIR);
  copyTree(gameSrc, join(OUTPUT_DIR, 'game'));
  copyTree(shotsSrc, join(OUTPUT_DIR, 'screenshots'));
  const dossier = buildDossier(OUTPUT_DIR, DOSSIER_CAPS);
  writeFileSync(join(OUTPUT_DIR, 'dossier.json'), dossier);
}

main();
