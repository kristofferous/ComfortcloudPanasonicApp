const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const outDir = path.join(projectRoot, '.homeybuild');

function run(command) {
  execSync(command, { stdio: 'inherit', cwd: projectRoot });
}

function emptyDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyRelative(source, target) {
  const sourcePath = path.join(projectRoot, source);
  if (!fs.existsSync(sourcePath)) {
    return;
  }
  const targetPath = path.join(outDir, target);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.cpSync(sourcePath, targetPath, { recursive: true });
}

function build() {
  emptyDir(outDir);
  run('tsc --project tsconfig.json');

  const staticEntries = [
    ['.homeycompose', '.homeycompose'],
    ['.homeychangelog.json', '.homeychangelog.json'],
    ['app.json', 'app.json'],
    ['assets', 'assets'],
    ['drivers/panasonic-ac/assets', 'drivers/panasonic-ac/assets'],
    ['drivers/panasonic-ac/pair', 'drivers/panasonic-ac/pair'],
    ['drivers/panasonic-ac/driver.compose.json', 'drivers/panasonic-ac/driver.compose.json'],
    ['locales', 'locales'],
  ];

  for (const [source, target] of staticEntries) {
    copyRelative(source, target);
  }
}

build();
