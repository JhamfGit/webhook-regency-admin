const express = require('express');
const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.send('OK');
});

app.post('/chatwoot-webhook', (req, res) => {
  console.log('Webhook recibido');
  res.status(200).json({ ok: true });
});

const PORT = process.env.PORT; // ⚠️ OBLIGATORIO
app.listen(PORT, () => {
  console.log(`🚀 Webhook listening on ${PORT}`);
});
