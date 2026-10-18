import type { Locale } from '../../i18n/locales.js'

const en = {
  label: 'How this works',
  forecast: 'Forecasts use TimesFM on BigQuery when available, or a weekday average of your sales.',
  coach:
    'Gemini with ADK agents helps with your business when live AI is on; offline mode uses sample replies.',
  voice: 'Gemini Live lets you talk with the coach when live voice is available.',
  photo:
    'Gemini vision reads photos, with Document AI for receipts and invoices when enabled; offline mode uses samples.',
  places: 'Live place answers are grounded with Google Maps; demo mode uses sample places.',
}

const hi: typeof en = {
  label: 'यह कैसे काम करता है',
  forecast:
    'उपलब्ध होने पर TimesFM और BigQuery से, वरना उसी वार की आपकी औसत बिक्री से अनुमान मिलता है।',
  coach:
    'लाइव AI चालू होने पर Gemini और ADK एजेंट आपके कारोबार में मदद करते हैं; ऑफ़लाइन मोड में नमूना जवाब मिलते हैं।',
  voice: 'लाइव आवाज़ उपलब्ध होने पर Gemini Live से आप कोच से बात कर सकते हैं।',
  photo:
    'Gemini vision फ़ोटो पढ़ता है और चालू होने पर Document AI रसीदें और बिल पढ़ता है; ऑफ़लाइन मोड में नमूने मिलते हैं।',
  places:
    'लाइव जगहों के जवाब Google Maps की जानकारी पर आधारित हैं; डेमो मोड में नमूना जगहें मिलती हैं।',
}

export type AiFeature = Exclude<keyof typeof en, 'label'>

// This disclosure's initial copy is English and Hindi, following the selected app language.
export function aiInfoCopy(locale: Locale): typeof en {
  return locale === 'hi' ? hi : en
}
