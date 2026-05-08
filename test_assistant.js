const axios = require('axios');

async function testAssistant() {
  try {
    console.log('Testing /api/assistant endpoint...');
    const response = await axios.post('http://localhost:5000/api/assistant', {
      question: 'What is PM2.5?',
      provider: 'openrouter',
      model: 'gpt-4o-mini',
      appContext: { city: 'Delhi' }
    });
    
    console.log('✅ Response:', response.data);
    console.log('\nEndpoint working correctly!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

testAssistant();
