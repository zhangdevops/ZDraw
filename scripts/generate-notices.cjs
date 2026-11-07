const fs = require('node:fs');
const path = require('node:path');

const visited = new Set();
const sections = [
  'ZDraw third-party notices\nElectron / Chromium notices are shipped alongside the executable.',
];

// 按 Node.js 的目录规则定位依赖，兼容嵌套安装。
function locate(name, from) {
  let directory = from;
  while (true) {
    const candidate = path.join(directory, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      return null;
    }
    directory = parent;
  }
}

// 汇总前端运行依赖自带的许可文件，避免漏掉打包后的依赖声明。
function collect(name, from) {
  const directory = locate(name, from);
  if (!directory || visited.has(directory)) {
    return;
  }
  visited.add(directory);
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  sections.push(
    `\n--- ${metadata.name}@${metadata.version} (${metadata.license ?? 'see upstream'}) ---\n`
  );
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && /^(licen[cs]e|copying|notice)(\.|$)/i.test(entry.name)) {
      sections.push(fs.readFileSync(path.join(directory, entry.name), 'utf8'));
    }
  }
  for (const dependency of Object.keys(metadata.dependencies ?? {})) {
    collect(dependency, directory);
  }
}

// 追加上游未随 npm 包分发的编辑器及字体许可。
for (const dependency of ['@excalidraw/excalidraw', 'react', 'react-dom']) {
  collect(dependency, process.cwd());
}
if (fs.existsSync('licenses')) {
  for (const name of fs.readdirSync('licenses')) {
    sections.push(`\n--- ${name} ---\n`);
    sections.push(fs.readFileSync(path.join('licenses', name), 'utf8'));
  }
}
fs.writeFileSync('THIRD-PARTY-NOTICES.txt', sections.join('\n'));
console.log(`Collected notices for ${visited.size} packages.`);
