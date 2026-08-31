const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const ignoredDirectories = new Set(['.git', '.pnpm-store', 'coverage', 'dist', 'node_modules', 'test-results']);
const textExtensions = new Set([
  '.cjs', '.css', '.env', '.example', '.html', '.js', '.json', '.jsx', '.md', '.mjs',
  '.prisma', '.sql', '.ts', '.tsx', '.txt', '.yaml', '.yml',
]);
const textFileNames = new Set(['.editorconfig', '.gitignore', 'Dockerfile', 'pnpm-workspace.yaml']);
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const mojibakePattern = /[\u00C2\u00F0]|\u00C3[\u0080-\u00BF\u0192]|\u00E2[\u0080-\u00BF]|\u00EF\u00BF\u00BD|\uFFFD/;
const errors = [];
let checkedFiles = 0;

const isTextFile = (filePath) => {
  const name = path.basename(filePath);
  return textFileNames.has(name) || name.startsWith('.env') || textExtensions.has(path.extname(name).toLowerCase());
};

const inspectFile = (filePath) => {
  if (!isTextFile(filePath)) return;
  checkedFiles += 1;

  const buffer = fs.readFileSync(filePath);
  const relativePath = path.relative(root, filePath);
  if (
    (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) ||
    (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) ||
    (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff)
  ) {
    errors.push(`${relativePath}: BOM detectado`);
    return;
  }

  let source;
  try {
    source = utf8Decoder.decode(buffer);
  } catch {
    errors.push(`${relativePath}: conteúdo inválido em UTF-8`);
    return;
  }

  source.split(/\r?\n/).forEach((line, index) => {
    if (mojibakePattern.test(line)) errors.push(`${relativePath}:${index + 1}: possível texto corrompido`);
  });
};

const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(entryPath);
    else if (entry.isFile()) inspectFile(entryPath);
  }
};

walk(root);

if (errors.length) {
  console.error(`Falha na validação de encoding (${errors.length} ocorrência(s)):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`${checkedFiles} arquivo(s) de texto validados: UTF-8 sem BOM e sem mojibake conhecido.`);
}
