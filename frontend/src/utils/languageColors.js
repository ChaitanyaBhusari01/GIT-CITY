// Language color mapping for file type visualization
// Maps language names to their official/recognizable colors from GitHub linguist

export const LANGUAGE_COLORS = {
    JavaScript: '#f1e05a',   // yellow
    TypeScript: '#3178c6',   // blue
    JSON: '#34d399',         // green
    Markdown: '#ffffff',     // white
    Config: '#a855f7',       // purple
    Unknown: '#6b7280',      // soft gray
    HTML: '#e34c26',         // orange-red
    CSS: '#563d7c',          // purple
    Python: '#3572A5',       // deep blue
    'C/C++': '#555555',      // dark gray
    Ruby: '#CC342D',         // red
    Go: '#00ADD8',           // cyan
    Rust: '#dea584',         // copper
    Java: '#b07219',         // brown-orange
    Shell: '#89e051',        // lime green
    YAML: '#cb171e',         // red (config)
    SCSS: '#c6538c',         // pink
};

// Human-readable display names (same keys as LANGUAGE_COLORS)
export const LANGUAGE_NAMES = Object.keys(LANGUAGE_COLORS);

export default LANGUAGE_COLORS;
