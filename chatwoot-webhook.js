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
// MENSAJE FINAL DE ÉXITO (ÚNICO)
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

const TEMPLATE_NAMES = {
  seleccion_certificado_bachiller: 'Certificado de bachiller',
  seleccion_ubicacion_desplazamiento: 'Ubicación y desplazamiento',
  seleccion_familiares_empresa: 'Familiares en la empresa',
  seleccion_distancia_transporte: 'Distancia al trabajo',
  seleccion_medio_transporte: 'Medio de transporte',
  seleccion_vinculacion_previa: 'Vinculación previa'
};

const VALID_RESPONSES = {
  seleccion_distancia_transporte: ['menos_15', '15_30', '30_60', 'mas_60'],
  seleccion_medio_transporte: ['moto', 'carro', 'publico', 'bicicleta', 'pie']
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
  const team = PROJECT_TO_TEAM[proyecto?.trim().toUpperCase()];
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
    const { event, message_type, conversation } = req.body;

    if (event !== 'message_created' || message_type !== 'incoming') {
      return res.status(200).json({ ignored: true });
    }

    const conversationId = conversation.id;
    const proyecto = conversation.custom_attributes?.proyecto;

    const currentState = conversation.custom_attributes?.template_state;
    const nextStep = TEMPLATE_FLOW[currentState];

    if (nextStep === 'fin') {
      // 👉 MENSAJE FINAL
      await sendChatwootMessage(conversationId, FINAL_SUCCESS_MESSAGE);
      
      // 👉 ASIGNAR ETIQUETA SOLO AQUÍ
      if (proyecto) {
        await assignLabelByProject(conversationId, proyecto);
      }

      return res.json({ ok: true, completed: true });
    }

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
