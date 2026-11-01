import type { Locale } from '../../i18n/locales.js'

const en = {
  label: 'How this works',
  forecast: 'Forecasts are based on how your shop sold in recent weeks.',
  coach:
    'Gemini with ADK agents helps with your business when live AI is on; offline mode uses sample replies.',
  voice: 'Gemini Live lets you talk with the coach when live voice is available.',
  photo:
    'Gemini vision reads photos, with Document AI for receipts and invoices when enabled; offline mode uses samples.',
  places:
    'We look up real places on Google Maps for you; in demo mode you see made-up sample places.',
}

const copy: Record<Locale, typeof en> = {
  en,
  hi: {
    label: 'यह कैसे काम करता है',
    forecast: 'अनुमान पिछले हफ़्तों की आपकी बिक्री पर आधारित होता है।',
    coach:
      'लाइव AI चालू होने पर Gemini और ADK एजेंट आपके कारोबार में मदद करते हैं; ऑफ़लाइन मोड में नमूना जवाब मिलते हैं।',
    voice: 'लाइव आवाज़ उपलब्ध होने पर Gemini Live से आप कोच से बात कर सकते हैं।',
    photo:
      'Gemini vision फ़ोटो पढ़ता है और चालू होने पर Document AI रसीदें व बिल पढ़ता है; ऑफ़लाइन मोड में नमूने मिलते हैं।',
    places:
      'लाइव जगहों के जवाब Google Maps की जानकारी पर आधारित होते हैं; डेमो मोड में नमूने दिखते हैं।',
  },
  ta: {
    label: 'இது எப்படி வேலை செய்கிறது',
    forecast:
      'TimesFM மற்றும் BigQuery கிடைக்கும்போது விற்பனையை கணிக்கின்றன; இல்லையெனில் வாரநாள் சராசரி பயன்படுத்தப்படும்.',
    coach:
      'நேரடி AI இயங்கும்போது Gemini மற்றும் ADK agents உங்கள் வணிகத்திற்கு உதவும்; இணையமில்லா நிலையில் மாதிரி பதில்கள் வரும்.',
    voice: 'நேரடி குரல் கிடைக்கும்போது Gemini Live மூலம் பயிற்சியாளரிடம் பேசலாம்.',
    photo:
      'Gemini vision படங்களைப் படிக்கும்; இயக்கப்பட்டால் Document AI ரசீதுகள் மற்றும் விலைப்பட்டியல்களைப் படிக்கும்; இணையமில்லா நிலையில் மாதிரிகள் வரும்.',
    places:
      'நேரடி இடப் பதில்கள் Google Maps தகவலை அடிப்படையாகக் கொண்டவை; காட்சி முறையில் மாதிரி இடங்கள் வரும்.',
  },
  'zh-Hans': {
    label: '它是如何运作的',
    forecast: 'TimesFM 和 BigQuery 会在可用时预测销量，否则会按星期几使用平均销量。',
    coach: '开启实时 AI 后，Gemini 和 ADK 智能体会帮助您经营生意；离线时会使用示例回复。',
    voice: '实时语音可用时，您可以通过 Gemini Live 与教练交谈。',
    photo: 'Gemini vision 可识别照片，启用后 Document AI 可读取收据和发票；离线时会使用示例。',
    places: '实时地点回答基于 Google Maps 信息；演示模式会显示示例地点。',
  },
  ms: {
    label: 'Cara ini berfungsi',
    forecast:
      'TimesFM dan BigQuery meramalkan jualan apabila tersedia; jika tidak, purata hari bekerja digunakan.',
    coach:
      'Gemini dengan ejen ADK membantu perniagaan anda apabila AI langsung tersedia; mod luar talian menggunakan jawapan contoh.',
    voice:
      'Anda boleh bercakap dengan jurulatih melalui Gemini Live apabila suara langsung tersedia.',
    photo:
      'Gemini vision membaca foto dan Document AI membaca resit serta invois apabila diaktifkan; mod luar talian menggunakan contoh.',
    places:
      'Jawapan tempat langsung berdasarkan maklumat Google Maps; mod demo menunjukkan tempat contoh.',
  },
  bn: {
    label: 'এটি যেভাবে কাজ করে',
    forecast:
      'TimesFM ও BigQuery পাওয়া গেলে বিক্রির পূর্বাভাস দেয়; না হলে সপ্তাহের দিনের গড় বিক্রি ব্যবহার হয়।',
    coach:
      'লাইভ AI চালু থাকলে Gemini ও ADK এজেন্ট আপনার ব্যবসায় সাহায্য করে; অফলাইনে নমুনা উত্তর দেয়।',
    voice: 'লাইভ ভয়েস পাওয়া গেলে Gemini Live দিয়ে কোচের সঙ্গে কথা বলতে পারেন।',
    photo:
      'Gemini vision ছবি পড়ে, আর চালু থাকলে Document AI রসিদ ও চালান পড়ে; অফলাইনে নমুনা ব্যবহার হয়।',
    places: 'লাইভ স্থানের উত্তর Google Maps-এর তথ্যের ওপর ভিত্তি করে; ডেমোতে নমুনা স্থান দেখায়।',
  },
  te: {
    label: 'ఇది ఎలా పనిచేస్తుంది',
    forecast:
      'TimesFM, BigQuery అందుబాటులో ఉంటే అమ్మకాలను అంచనా వేస్తాయి; లేకపోతే వారంలోని రోజు సగటును ఉపయోగిస్తాయి.',
    coach:
      'లైవ్ AI ఆన్‌లో ఉంటే Gemini, ADK ఏజెంట్లు మీ వ్యాపారానికి తోడ్పడతాయి; ఆఫ్‌లైన్‌లో నమూనా సమాధానాలు వస్తాయి.',
    voice: 'లైవ్ వాయిస్ అందుబాటులో ఉన్నప్పుడు Gemini Live ద్వారా కోచ్‌తో మాట్లాడవచ్చు.',
    photo:
      'Gemini vision ఫోటోలను చదువుతుంది; ప్రారంభిస్తే Document AI రసీదులు, ఇన్‌వాయిస్‌లను చదువుతుంది; ఆఫ్‌లైన్‌లో నమూనాలు వస్తాయి.',
    places:
      'లైవ్ ప్రదేశాల సమాధానాలు Google Maps సమాచారంపై ఆధారపడతాయి; డెమోలో నమూనా ప్రదేశాలు కనిపిస్తాయి.',
  },
  mr: {
    label: 'हे कसे काम करते',
    forecast:
      'TimesFM आणि BigQuery उपलब्ध असल्यास विक्रीचा अंदाज देतात; अन्यथा वाराच्या दिवसाची सरासरी वापरली जाते.',
    coach:
      'लाइव्ह AI सुरू असल्यास Gemini आणि ADK एजंट तुमच्या व्यवसायाला मदत करतात; ऑफलाइन नमुना उत्तरे मिळतात.',
    voice: 'लाइव्ह आवाज उपलब्ध असल्यास Gemini Live वर प्रशिक्षकाशी बोलता येते.',
    photo:
      'Gemini vision फोटो वाचते आणि सुरू केल्यावर Document AI पावत्या व बिले वाचते; ऑफलाइन नमुने मिळतात.',
    places:
      'लाइव्ह ठिकाणांची उत्तरे Google Maps माहितीवर आधारित असतात; डेमोमध्ये नमुना ठिकाणे दिसतात.',
  },
  kn: {
    label: 'ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ',
    forecast:
      'TimesFM ಮತ್ತು BigQuery ಲಭ್ಯವಿದ್ದಾಗ ಮಾರಾಟವನ್ನು ಅಂದಾಜಿಸುತ್ತವೆ; ಇಲ್ಲದಿದ್ದರೆ ವಾರದ ದಿನದ ಸರಾಸರಿ ಬಳಸಲಾಗುತ್ತದೆ.',
    coach:
      'ಲೈವ್ AI ಆನ್ ಆಗಿದ್ದಾಗ Gemini ಮತ್ತು ADK ಏಜೆಂಟ್‌ಗಳು ನಿಮ್ಮ ವ್ಯಾಪಾರಕ್ಕೆ ನೆರವಾಗುತ್ತವೆ; ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿ ಮಾದರಿ ಉತ್ತರಗಳು ಬರುತ್ತವೆ.',
    voice: 'ಲೈವ್ ಧ್ವನಿ ಲಭ್ಯವಿದ್ದಾಗ Gemini Live ಮೂಲಕ ಕೋಚ್ ಜೊತೆ ಮಾತನಾಡಬಹುದು.',
    photo:
      'Gemini vision ಫೋಟೋಗಳನ್ನು ಓದುತ್ತದೆ; ಸಕ್ರಿಯಗೊಳಿಸಿದಾಗ Document AI ರಸೀದಿ ಮತ್ತು ಇನ್‌ವಾಯ್ಸ್ ಓದುತ್ತದೆ; ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿ ಮಾದರಿಗಳು ಬರುತ್ತವೆ.',
    places:
      'ಲೈವ್ ಸ್ಥಳಗಳ ಉತ್ತರಗಳು Google Maps ಮಾಹಿತಿಯನ್ನು ಆಧರಿಸಿವೆ; ಡೆಮೊದಲ್ಲಿ ಮಾದರಿ ಸ್ಥಳಗಳು ಕಾಣುತ್ತವೆ.',
  },
  ja: {
    label: '仕組みを見る',
    forecast:
      'TimesFM と BigQuery が使える場合は売上を予測し、使えない場合は曜日ごとの平均を使います。',
    coach:
      'ライブ AI が有効なときは Gemini と ADK エージェントが商売をサポートし、オフラインではサンプル回答を使います。',
    voice: 'ライブ音声が使えるときは Gemini Live でコーチと話せます。',
    photo:
      'Gemini vision が写真を読み取り、有効な場合は Document AI がレシートや請求書を読み取り、オフラインではサンプルを使います。',
    places:
      'リアルタイムの場所の回答は Google Maps の情報に基づき、デモではサンプルの場所を表示します。',
  },
  ko: {
    label: '작동 방식 보기',
    forecast:
      'TimesFM과 BigQuery를 사용할 수 있으면 매출을 예측하고, 그렇지 않으면 요일별 평균을 사용합니다.',
    coach:
      '실시간 AI가 켜져 있으면 Gemini와 ADK 에이전트가 비즈니스를 돕고, 오프라인에서는 예시 답변을 사용합니다.',
    voice: '실시간 음성을 사용할 수 있으면 Gemini Live로 코치와 대화할 수 있습니다.',
    photo:
      'Gemini vision이 사진을 읽고, 사용 설정 시 Document AI가 영수증과 송장을 읽으며 오프라인에서는 예시를 사용합니다.',
    places:
      '실시간 장소 답변은 Google Maps 정보를 바탕으로 하며, 데모 모드에서는 예시 장소를 보여줍니다.',
  },
  id: {
    label: 'Cara kerjanya',
    forecast:
      'TimesFM dan BigQuery memperkirakan penjualan jika tersedia; jika tidak, perkiraan memakai rata-rata hari yang sama.',
    coach:
      'Gemini dengan agen ADK membantu bisnis Anda saat AI langsung aktif; saat offline, jawaban contoh digunakan.',
    voice: 'Anda dapat berbicara dengan pelatih lewat Gemini Live saat suara langsung tersedia.',
    photo:
      'Gemini vision membaca foto dan Document AI membaca struk serta faktur jika diaktifkan; saat offline, contoh digunakan.',
    places:
      'Jawaban tempat langsung berdasarkan info Google Maps; mode demo menampilkan tempat contoh.',
  },
  th: {
    label: 'วิธีการทำงาน',
    forecast:
      'TimesFM และ BigQuery ใช้คาดการณ์ยอดขายเมื่อพร้อมใช้งาน มิฉะนั้นจะใช้ค่าเฉลี่ยตามวันในสัปดาห์',
    coach:
      'เมื่อเปิดใช้ AI สด Gemini และเอเจนต์ ADK จะช่วยดูแลธุรกิจของคุณ ส่วนโหมดออฟไลน์จะใช้คำตอบตัวอย่าง',
    voice: 'เมื่อใช้เสียงสดได้ คุณจะพูดคุยกับโค้ชผ่าน Gemini Live ได้',
    photo:
      'Gemini vision อ่านรูปภาพ และ Document AI อ่านใบเสร็จกับใบแจ้งหนี้เมื่อเปิดใช้ ส่วนโหมดออฟไลน์จะใช้ตัวอย่าง',
    places: 'คำตอบสถานที่สดอ้างอิงข้อมูลจาก Google Maps ส่วนโหมดสาธิตจะแสดงสถานที่ตัวอย่าง',
  },
  vi: {
    label: 'Cách hoạt động',
    forecast:
      'TimesFM và BigQuery dự báo doanh số khi có sẵn; nếu không, hệ thống dùng mức trung bình theo ngày trong tuần.',
    coach:
      'Gemini cùng tác nhân ADK hỗ trợ việc kinh doanh khi AI trực tiếp được bật; chế độ ngoại tuyến dùng câu trả lời mẫu.',
    voice: 'Bạn có thể trò chuyện với huấn luyện viên qua Gemini Live khi có giọng nói trực tiếp.',
    photo:
      'Gemini vision đọc ảnh và Document AI đọc biên lai, hóa đơn khi được bật; chế độ ngoại tuyến dùng dữ liệu mẫu.',
    places:
      'Câu trả lời địa điểm trực tiếp dựa trên thông tin Google Maps; chế độ demo dùng địa điểm mẫu.',
  },
  fil: {
    label: 'Paano ito gumagana',
    forecast:
      'Tinataya ng TimesFM at BigQuery ang benta kapag available; kung hindi, karaniwang benta sa kaparehong araw ang gamit.',
    coach:
      'Tumutulong sa negosyo mo ang Gemini at mga ADK agent kapag naka-on ang live AI; mga halimbawang sagot ang gamit offline.',
    voice: 'Makakausap mo ang coach sa Gemini Live kapag available ang live na boses.',
    photo:
      'Nagbabasa ng mga larawan ang Gemini vision at nagbabasa ng resibo at invoice ang Document AI kapag naka-enable; mga halimbawa ang gamit offline.',
    places:
      'Batay sa Google Maps ang mga live na sagot tungkol sa lugar; mga halimbawang lugar ang gamit sa demo mode.',
  },
}

export type AiFeature = Exclude<keyof typeof en, 'label'>

export function aiInfoCopy(locale: Locale): typeof en {
  return copy[locale]
}
