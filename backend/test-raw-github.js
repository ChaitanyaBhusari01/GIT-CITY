const axios = require('axios');
require('dotenv').config();

async function test() {
    try {
        const url = 'https://raw.githubusercontent.com/mrdoob/three.js/master/src/Three.js';
        const headers = {
            'Accept': 'application/vnd.github.v3.raw',
            'User-Agent': 'GitCity'
        };
        if (process.env.GITHUB_TOKEN) {
            headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
        }
        console.log("Fetching: " + url);
        const res = await axios.get(url, { headers });
        console.log("Success! Content length:", res.data.length);
        console.log("Preview:\n", res.data.substring(0, 100));
    } catch (e) {
        console.error("Failed!", e.message);
        if (e.response) console.error("Status:", e.response.status, e.response.statusText);
    }
}
test();
