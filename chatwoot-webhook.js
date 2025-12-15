const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const CHATWOOT_URL = process.env.CHATWOOT_URL || 'https://support.jhamf.com';
const API_KEY = process.env.API_KEY;
const ACCOUNT_ID = process.env.ACCOUNT_ID || '9';

app.get('/', (req, res) => {
  res.status(200).send('OK');
});

app.post('/chatwoot-webhook', (req, res) => {
  res.status(200).send('OK');

  (async () => {
    try {
      const { event, message_type, conversation, content } = req.body;

      if (event === 'message_created' && message_type === 'incoming') {
        if (!API_KEY) {
          console.error('❌ API_KEY no definida');
          return;
        }

        await axios.post(
          `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversation.id}/messages`,
          { content: '✅ Entró al webhook' },
          { headers: { api_access_token: API_KEY } }
        );
      }
    } catch (err) {
      console.error('❌ Error webhook:', err.message);
    }
  })();
});

const PORT = process.env.PORT || 3080;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Webhook listening on ${PORT}`);
});
