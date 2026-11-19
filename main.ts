// SPDX-License-Identifier: MIT
// Sunline Heat — make.fun gta6-01 hand-in program (Node 22, standard library only).
// Copies the playable game (game/) and its screenshots (screenshots/) to the output
// directory and writes dossier.json with the vendored make.fun library.
// Locally: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyDir(name: string): void {
  const src = join(root, name);
  mkdirSync(join(outDir, name), { recursive: true });
  if (existsSync(src)) cpSync(src, join(outDir, name), { recursive: true });
}

mkdirSync(outDir, { recursive: true });
copyDir('game');
copyDir('screenshots');

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`dossier.json written to ${outDir} (${dossier.length} bytes)`);
