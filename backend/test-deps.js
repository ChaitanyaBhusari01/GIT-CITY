const axios = require('axios');

async function test() {
    try {
        console.log("Loading three.js repo...");
        await axios.post('http://localhost:3001/repo/load', { url: "https://github.com/mrdoob/three.js" });
        console.log("Repo loaded.");

        console.log("Fetching dependencies for src/Three.js...");
        const res = await axios.get('http://localhost:3001/repo/dependencies?path=src/Three.js');
        console.log("Dependencies:", res.data);
    } catch (e) {
        console.error("Test failed:", e.message);
        if (e.response) {
            console.error(e.response.data);
        }
    }
}

test();
