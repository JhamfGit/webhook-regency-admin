const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// ================================
// VARIABLES DE ENTORNO
// ================================
const CHATWOOT_URL = process.env.CHATWOOT_URL;
const API_KEY = process.env.API_KEY;
const ACCOUNT_ID = process.env.ACCOUNT_ID;
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

// ================================
// MENSAJE FINAL ÚNICO (CONTROL)
// ================================
const FINAL_SUCCESS_MESSAGE =
  'Confirmamos que has superado esta fase inicial. Tu candidatura sigue activa y pasará a la siguiente etapa del proceso de selección.';

// ================================
// MAPEO DE PROYECTOS A EQUIPOS
// ================================
const PROJECT_TO_TEAM = {
  'SUMAPAZ': 'op-vial',
  'GICA OP VIAL': 'op-vial',
  'RUTA AL SUR OP VIAL': 'op-vial',
  'VINUS OP VIAL': 'op-vial',

  'ACCENORTE': 'pyb-accenorte-iccu-vigilancia',
  'FRIGORINUS VIGILANCIA': 'pyb-accenorte-iccu-vigilancia',
  'MINEROS LA MARIA VIGILANCIA': 'pyb-accenorte-iccu-vigilancia',
  'APP GICA (VIGILANCIA)': 'pyb-accenorte-iccu-vigilancia',
  'DS EL FARO 118 VIGILANCIA': 'pyb-accenorte-iccu-vigilancia',
  'VINUS - VIGILANCIA': 'pyb-accenorte-iccu-vigilancia',
  'RUTA AL SUR - VIGILANCIA': 'pyb-accenorte-iccu-vigilancia',
  'RUTAS DEL VALLE - VIGILANCIA': 'pyb-accenorte-iccu-vigilancia',
  'ACCENORTE - VIGILANCIA': 'pyb-accenorte-iccu-vigilancia',
  'CONSORCIO PEAJES 2526 - VIGILANCIA': 'pyb-accenorte-iccu-vigilancia',

  'CONSORCIO PEAJES 2526 - PLANTA': 'planta-temporal-canguro',
  'RUTA AL SUR - RECOLECTOR TEMPORADA': 'planta-temporal-canguro',
  'RUTAS DEL VALLE - RECOLECTOR TEMPORADA': 'planta-temporal-canguro',
  'GICA - RECOLECTOR TEMPORADA': 'planta-temporal-canguro',
  'CONSORCIO PEAJES 2526 - CANGUROS': 'planta-temporal-canguro',

  'RUTA AL SUR PLANTA': 'pyb-planta',
  'RUTAS DEL VALLE PLANTA': 'pyb-planta',
  'RUTAS DEL VALLE': 'pyb-planta',
  'GICA PLANTA': 'pyb-planta',
  'VINUS PLANTA': 'pyb-planta',

  'ADMINISTRACION': 'admin-tolis',
  'TOLIS': 'admin-tolis'
};

// ================================
// FLUJO DE ESTADOS
// ================================
const TEMPLATE_FLOW = {
  inicio: 'seleccion_certificado_bachiller',
  seleccion_certificado_bachiller: 'seleccion_ubicacion_desplazamiento',
  seleccion_ubicacion_desplazamiento: 'seleccion_familiares_empresa',
  seleccion_familiares_empresa: 'seleccion_distancia_transporte',
  seleccion_distancia_transporte: 'seleccion_medio_transporte',
  seleccion_medio_transporte: 'seleccion_vinculacion_previa',
  seleccion_vinculacion_previa: 'fin'
};

// ================================
// FUNCIONES CHATWOOT
// ================================
async function sendChatwootMessage(conversationId, content, isPrivate = false) {
  await axios.post(
    `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
    { content, private: isPrivate },
    { headers: { api_access_token: API_KEY } }
  );
}

async function assignLabelByProject(conversationId, proyecto) {
  const normalized = proyecto?.trim().toUpperCase();
  const team = PROJECT_TO_TEAM[normalized];
  if (!team) return;

  await axios.post(
    `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/labels`,
    { labels: [team] },
    { headers: { api_access_token: API_KEY } }
  );

  await sendChatwootMessage(
    conversationId,
    `🏷️ Etiqueta asignada automáticamente: ${team}`,
    true
  );
}

// ================================
// WEBHOOK CHATWOOT
// ================================
app.post('/chatwoot-webhook', async (req, res) => {
  try {
    const { event, message_type, conversation, content } = req.body;

    if (event !== 'message_created' || message_type !== 'incoming') {
      return res.status(200).json({ ignored: true });
    }

    const conversationId = conversation.id;
    const userPhone = conversation.contact_inbox?.source_id;
    const attrs = conversation.custom_attributes || {};
    const currentState = attrs.template_state;
    const proyecto = attrs.proyecto;

    // ============================
    // FINAL DEL FLUJO
    // ============================
    if (TEMPLATE_FLOW[currentState] === 'fin') {
      await sendChatwootMessage(conversationId, FINAL_SUCCESS_MESSAGE);

      // ✅ ÚNICO LUGAR DONDE SE ASIGNA LA ETIQUETA
      if (proyecto) {
        await assignLabelByProject(conversationId, proyecto);
      }

      return res.json({ ok: true, completed: true });
    }

    // ============================
    // CONTINUAR FLUJO NORMAL
    // ============================
    res.json({ ok: true });

  } catch (error) {
    console.error('❌ ERROR GENERAL:', error.message);
    res.status(500).json({ error: 'Webhook error' });
  }
});

// ================================
// SERVER
// ================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Webhook listening on port ${PORT}`);
});
