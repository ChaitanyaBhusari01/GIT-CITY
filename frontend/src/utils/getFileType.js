// Maps file extensions to language names
// Returns the language name for a given file path

const EXTENSION_MAP = {
    // JavaScript
    js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
    // TypeScript
    ts: 'TypeScript', tsx: 'TypeScript', mts: 'TypeScript',
    // Python
    py: 'Python', pyw: 'Python', pyx: 'Python',
    // C / C++
    c: 'C/C++', h: 'C/C++', cpp: 'C/C++', hpp: 'C/C++', cc: 'C/C++', cxx: 'C/C++',
    // CSS
    css: 'CSS',
    // SCSS
    scss: 'SCSS', sass: 'SCSS',
    // HTML
    html: 'HTML', htm: 'HTML',
    // JSON
    json: 'JSON',
    // Markdown
    md: 'Markdown', mdx: 'Markdown',
    // Ruby
    rb: 'Ruby', rake: 'Ruby', gemspec: 'Ruby',
    // Go
    go: 'Go',
    // Rust
    rs: 'Rust',
    // Java
    java: 'Java',
    // Shell
    sh: 'Shell', bash: 'Shell', zsh: 'Shell',
    // YAML
    yml: 'YAML', yaml: 'YAML',
};

/**
 * Get the language name from a file path or filename.
 * @param {string} filePath - e.g. "src/components/App.jsx"
 * @returns {string} Language name, e.g. "JavaScript"
 */
export function getFileType(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    return EXTENSION_MAP[ext] || 'Unknown';
}

/**
 * Get language stats from a tree of files.
 * Returns sorted array of { language, count, percentage }
 */
export function getLanguageStats(tree) {
    const counts = {};
    let total = 0;

    tree.forEach(f => {
        if (f.type !== 'blob') return;
        const lang = getFileType(f.path);
        counts[lang] = (counts[lang] || 0) + 1;
        total++;
    });

    return Object.entries(counts)
        .map(([language, count]) => ({
            language,
            count,
            percentage: total > 0 ? Math.round((count / total) * 100) : 0
        }))
        .sort((a, b) => b.count - a.count);
}

export default getFileType;
