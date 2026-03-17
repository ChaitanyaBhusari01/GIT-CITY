const content = `
import { WebGLRenderer } from './renderers/WebGLRenderer.js';
import { Scene } from './scenes/Scene.js';
`;
const regexes = [
    /import\s+(?:[^"']+from\s+)?['"]([^"']+)['"]/g,
    /export\s+(?:[^"']+from\s+)?['"]([^"']+)['"]/g,
    /require\s*\(\s*['"]([^"']+)['"]\s*\)/g
];
let match;
for (const regex of regexes) {
    while ((match = regex.exec(content)) !== null) {
        console.log(match[1]);
    }
}
