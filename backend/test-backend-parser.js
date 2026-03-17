const axios = require('axios');

function normalizePosixPath(base, relative) {
    if (!relative.startsWith('.')) return null;

    const baseParts = base.split('/');
    baseParts.pop();

    const relParts = relative.split('/');

    for (const part of relParts) {
        if (part === '.') continue;
        if (part === '..') {
            if (baseParts.length > 0) {
                baseParts.pop();
            }
        } else {
            baseParts.push(part);
        }
    }

    return baseParts.join('/');
}

async function test() {
    const owner = 'mrdoob';
    const repo = 'three.js';
    const sha = 'master';
    const filePath = 'src/Three.js';

    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${filePath}`;
    console.log("Fetching url:", url);
    const response = await axios.get(url, { headers: { 'Accept': 'application/vnd.github.v3.raw' } });
    const content = response.data;
    console.log("typeof content:", typeof content, "length:", content.length);

    const imports = new Set();
    const regexes = [
        /import\s+(?:[^"']+from\s+)?['"]([^"']+)['"]/g,
        /export\s+(?:[^"']+from\s+)?['"]([^"']+)['"]/g,
        /require\s*\(\s*['"]([^"']+)['"]\s*\)/g
    ];

    let match;
    for (const regex of regexes) {
        while ((match = regex.exec(content)) !== null) {
            const depPath = match[1];
            if (depPath.startsWith('.')) {
                imports.add(depPath);
            }
        }
    }
    console.log("Regex imports isolated:", imports);

    const resolvedDeps = [];
    for (const reqPath of imports) {
        const normalizedBase = normalizePosixPath(filePath, reqPath);
        if (!normalizedBase) continue;

        const possibleExtensions = ['', '.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];

        let found = false;
        for (const ext of possibleExtensions) {
            const testPath = normalizedBase + ext;
            resolvedDeps.push(testPath);
            found = true;
            break;
        }
    }

    console.log("Final resolved dependencies:", resolvedDeps);
}
test();
