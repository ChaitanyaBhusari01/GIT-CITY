const axios = require('axios');
require('dotenv').config();

const apiKey = process.env.OPENROUTER_API_KEY;
console.log('OpenRouter API Key present:', !!apiKey);

if (apiKey) {
  console.log('Testing OpenRouter API...');
  axios.post('https://openrouter.ai/api/v1/chat/completions', {
    model: 'anthropic/claude-3-haiku',
    messages: [{ role: 'user', content: 'Hello, can you respond with just "Hello back!"?' }],
    max_tokens: 50,
    temperature: 0.7
  }, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://gitcity.app',
      'X-Title': 'GitCity'
    }
  }).then(res => {
    console.log('✅ OpenRouter API key is working!');
    console.log('Response:', res.data.choices[0].message.content);
  }).catch(err => {
    console.log('❌ OpenRouter API error:', err.response?.data?.error?.message || err.message);
  });
} else {
  console.log('No API key found');
}