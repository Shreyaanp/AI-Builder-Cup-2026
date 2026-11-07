import type { Locale } from '../../i18n/locales.js'

const en = {
  label: 'How this works',
  forecast: 'Forecasts are based on how your shop sold in recent weeks.',
  coach:
    'The coach uses Google’s Gemini AI to help with your business when live AI is on; otherwise it gives sample replies.',
  voice: 'Gemini Live lets you talk with the coach when live voice is available.',
  photo:
    'Gemini vision reads photos, with Document AI for receipts and invoices when enabled; otherwise it uses samples.',
  places:
    'We look up real places on Google Maps for you; in demo mode you see made-up sample places.',
}

const copy: Record<Locale, typeof en> = {
  en,
  hi: {
    label: 'यह कैसे काम करता है',
    forecast: 'अनुमान पिछले हफ़्तों की आपकी बिक्री पर आधारित होता है।',
    coach:
      'लाइव AI चालू होने पर कोच Google के Gemini AI से आपके कारोबार में मदद करता है; नहीं तो नमूना जवाब मिलते हैं।',
    voice: 'लाइव आवाज़ उपलब्ध होने पर Gemini Live से आप कोच से बात कर सकते हैं।',
    photo:
      'Gemini vision फ़ोटो पढ़ता है और चालू होने पर Document AI रसीदें व बिल पढ़ता है; नहीं तो नमूने मिलते हैं।',
    places:
      'लाइव जगहों के जवाब Google Maps की जानकारी पर आधारित होते हैं; डेमो मोड में नमूने दिखते हैं।',
  },
  ta: {
    label: 'இது எப்படி வேலை செய்கிறது',
    forecast: 'முன்னறிவிப்புகள் சமீப வாரங்களில் உங்கள் கடையின் விற்பனையை அடிப்படையாகக் கொண்டவை.',
    coach:
      'நேரடி AI இயங்கும்போது Google-ன் Gemini AI உங்கள் வணிகத்திற்கு உதவும்; இல்லையெனில் மாதிரி பதில்கள் வரும்.',
    voice: 'நேரடி குரல் கிடைக்கும்போது Gemini Live மூலம் பயிற்சியாளரிடம் பேசலாம்.',
    photo:
      'Gemini vision படங்களைப் படிக்கும்; இயக்கப்பட்டால் Document AI ரசீதுகள் மற்றும் விலைப்பட்டியல்களைப் படிக்கும்; இல்லையெனில் மாதிரிகள் வரும்.',
    places:
      'நேரடி இடப் பதில்கள் Google Maps தகவலை அடிப்படையாகக் கொண்டவை; காட்சி முறையில் மாதிரி இடங்கள் வரும்.',
  },
  'zh-Hans': {
    label: '它是如何运作的',
    forecast: '预测基于您的店铺最近几周的销售情况。',
    coach: '开启实时 AI 后，教练会用 Google 的 Gemini AI 帮助您经营生意；否则会给出示例回复。',
    voice: '实时语音可用时，您可以通过 Gemini Live 与教练交谈。',
    photo: 'Gemini vision 可识别照片，启用后 Document AI 可读取收据和发票；否则会使用示例。',
    places: '实时地点回答基于 Google Maps 信息；演示模式会显示示例地点。',
  },
  ms: {
    label: 'Cara ini berfungsi',
    forecast: 'Ramalan berdasarkan jualan kedai anda dalam beberapa minggu kebelakangan ini.',
    coach:
      'Jurulatih menggunakan Gemini AI Google untuk membantu perniagaan anda apabila AI langsung dihidupkan; jika tidak, ia memberi jawapan contoh.',
    voice:
      'Anda boleh bercakap dengan jurulatih melalui Gemini Live apabila suara langsung tersedia.',
    photo:
      'Gemini vision membaca foto dan Document AI membaca resit serta invois apabila diaktifkan; jika tidak, contoh digunakan.',
    places:
      'Jawapan tempat langsung berdasarkan maklumat Google Maps; mod demo menunjukkan tempat contoh.',
  },
  bn: {
    label: 'এটি যেভাবে কাজ করে',
    forecast: 'পূর্বাভাস আপনার দোকানের গত কয়েক সপ্তাহের বিক্রির ওপর ভিত্তি করে।',
    coach:
      'লাইভ AI চালু থাকলে কোচ Google-এর Gemini AI দিয়ে আপনার ব্যবসায় সাহায্য করে; না হলে নমুনা উত্তর দেয়।',
    voice: 'লাইভ ভয়েস পাওয়া গেলে Gemini Live দিয়ে কোচের সঙ্গে কথা বলতে পারেন।',
    photo:
      'Gemini vision ছবি পড়ে, আর চালু থাকলে Document AI রসিদ ও চালান পড়ে; না হলে নমুনা ব্যবহার হয়।',
    places: 'লাইভ স্থানের উত্তর Google Maps-এর তথ্যের ওপর ভিত্তি করে; ডেমোতে নমুনা স্থান দেখায়।',
  },
  te: {
    label: 'ఇది ఎలా పనిచేస్తుంది',
    forecast: 'అంచనాలు గత కొన్ని వారాల్లో మీ దుకాణం అమ్మకాల ఆధారంగా ఉంటాయి.',
    coach:
      'లైవ్ AI ఆన్‌లో ఉంటే కోచ్ Google Gemini AI తో మీ వ్యాపారానికి తోడ్పడుతుంది; లేకపోతే నమూనా సమాధానాలు ఇస్తుంది.',
    voice: 'లైవ్ వాయిస్ అందుబాటులో ఉన్నప్పుడు Gemini Live ద్వారా కోచ్‌తో మాట్లాడవచ్చు.',
    photo:
      'Gemini vision ఫోటోలను చదువుతుంది; ప్రారంభిస్తే Document AI రసీదులు, ఇన్‌వాయిస్‌లను చదువుతుంది; లేకపోతే నమూనాలు వస్తాయి.',
    places:
      'లైవ్ ప్రదేశాల సమాధానాలు Google Maps సమాచారంపై ఆధారపడతాయి; డెమోలో నమూనా ప్రదేశాలు కనిపిస్తాయి.',
  },
  mr: {
    label: 'हे कसे काम करते',
    forecast: 'अंदाज तुमच्या दुकानाच्या गेल्या काही आठवड्यांतील विक्रीवर आधारित असतात.',
    coach:
      'लाइव्ह AI सुरू असल्यास कोच Google च्या Gemini AI ने तुमच्या व्यवसायाला मदत करतो; नाहीतर नमुना उत्तरे देतो.',
    voice: 'लाइव्ह आवाज उपलब्ध असल्यास Gemini Live वर प्रशिक्षकाशी बोलता येते.',
    photo:
      'Gemini vision फोटो वाचते आणि सुरू केल्यावर Document AI पावत्या व बिले वाचते; नाहीतर नमुने मिळतात.',
    places:
      'लाइव्ह ठिकाणांची उत्तरे Google Maps माहितीवर आधारित असतात; डेमोमध्ये नमुना ठिकाणे दिसतात.',
  },
  kn: {
    label: 'ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ',
    forecast: 'ಅಂದಾಜುಗಳು ಕಳೆದ ಕೆಲವು ವಾರಗಳಲ್ಲಿ ನಿಮ್ಮ ಅಂಗಡಿಯ ಮಾರಾಟವನ್ನು ಆಧರಿಸಿವೆ.',
    coach:
      'ಲೈವ್ AI ಆನ್ ಆಗಿದ್ದಾಗ ಕೋಚ್ Google ನ Gemini AI ಮೂಲಕ ನಿಮ್ಮ ವ್ಯಾಪಾರಕ್ಕೆ ನೆರವಾಗುತ್ತದೆ; ಇಲ್ಲದಿದ್ದರೆ ಮಾದರಿ ಉತ್ತರಗಳನ್ನು ಕೊಡುತ್ತದೆ.',
    voice: 'ಲೈವ್ ಧ್ವನಿ ಲಭ್ಯವಿದ್ದಾಗ Gemini Live ಮೂಲಕ ಕೋಚ್ ಜೊತೆ ಮಾತನಾಡಬಹುದು.',
    photo:
      'Gemini vision ಫೋಟೋಗಳನ್ನು ಓದುತ್ತದೆ; ಸಕ್ರಿಯಗೊಳಿಸಿದಾಗ Document AI ರಸೀದಿ ಮತ್ತು ಇನ್‌ವಾಯ್ಸ್ ಓದುತ್ತದೆ; ಇಲ್ಲದಿದ್ದರೆ ಮಾದರಿಗಳು ಬರುತ್ತವೆ.',
    places:
      'ಲೈವ್ ಸ್ಥಳಗಳ ಉತ್ತರಗಳು Google Maps ಮಾಹಿತಿಯನ್ನು ಆಧರಿಸಿವೆ; ಡೆಮೊದಲ್ಲಿ ಮಾದರಿ ಸ್ಥಳಗಳು ಕಾಣುತ್ತವೆ.',
  },
  ja: {
    label: '仕組みを見る',
    forecast: '予測は、お店の最近数週間の売れ方をもとにしています。',
    coach:
      'ライブ AI が有効なときは、コーチが Google の Gemini AI で商売をサポートし、そうでないときはサンプル回答を返します。',
    voice: 'ライブ音声が使えるときは Gemini Live でコーチと話せます。',
    photo:
      'Gemini vision が写真を読み取り、有効な場合は Document AI がレシートや請求書を読み取り、そうでない場合はサンプルを使います。',
    places:
      'リアルタイムの場所の回答は Google Maps の情報に基づき、デモではサンプルの場所を表示します。',
  },
  ko: {
    label: '작동 방식 보기',
    forecast: '예측은 최근 몇 주 동안의 매장 판매를 바탕으로 합니다.',
    coach:
      '실시간 AI가 켜져 있으면 코치가 Google의 Gemini AI로 비즈니스를 돕고, 꺼져 있으면 예시 답변을 줍니다.',
    voice: '실시간 음성을 사용할 수 있으면 Gemini Live로 코치와 대화할 수 있습니다.',
    photo:
      'Gemini vision이 사진을 읽고, 사용 설정 시 Document AI가 영수증과 송장을 읽으며 그렇지 않으면 예시를 사용합니다.',
    places:
      '실시간 장소 답변은 Google Maps 정보를 바탕으로 하며, 데모 모드에서는 예시 장소를 보여줍니다.',
  },
  id: {
    label: 'Cara kerjanya',
    forecast: 'Perkiraan didasarkan pada penjualan toko Anda beberapa minggu terakhir.',
    coach:
      'Pelatih memakai Gemini AI dari Google untuk membantu bisnis Anda saat AI langsung aktif; jika tidak, jawaban contoh yang diberikan.',
    voice: 'Anda dapat berbicara dengan pelatih lewat Gemini Live saat suara langsung tersedia.',
    photo:
      'Gemini vision membaca foto dan Document AI membaca struk serta faktur jika diaktifkan; jika tidak, contoh yang digunakan.',
    places:
      'Jawaban tempat langsung berdasarkan info Google Maps; mode demo menampilkan tempat contoh.',
  },
  th: {
    label: 'วิธีการทำงาน',
    forecast: 'การคาดการณ์อิงจากยอดขายของร้านคุณในช่วงไม่กี่สัปดาห์ที่ผ่านมา',
    coach:
      'เมื่อเปิดใช้ AI สด โค้ชจะใช้ Gemini AI ของ Google ช่วยดูแลธุรกิจของคุณ มิฉะนั้นจะให้คำตอบตัวอย่าง',
    voice: 'เมื่อใช้เสียงสดได้ คุณจะพูดคุยกับโค้ชผ่าน Gemini Live ได้',
    photo:
      'Gemini vision อ่านรูปภาพ และ Document AI อ่านใบเสร็จกับใบแจ้งหนี้เมื่อเปิดใช้ มิฉะนั้นจะใช้ตัวอย่าง',
    places: 'คำตอบสถานที่สดอ้างอิงข้อมูลจาก Google Maps ส่วนโหมดสาธิตจะแสดงสถานที่ตัวอย่าง',
  },
  vi: {
    label: 'Cách hoạt động',
    forecast: 'Dự báo dựa trên doanh số cửa hàng của bạn trong vài tuần gần đây.',
    coach:
      'Huấn luyện viên dùng Gemini AI của Google để hỗ trợ việc kinh doanh khi AI trực tiếp được bật; nếu không, sẽ đưa ra câu trả lời mẫu.',
    voice: 'Bạn có thể trò chuyện với huấn luyện viên qua Gemini Live khi có giọng nói trực tiếp.',
    photo:
      'Gemini vision đọc ảnh và Document AI đọc biên lai, hóa đơn khi được bật; nếu không, hệ thống dùng dữ liệu mẫu.',
    places:
      'Câu trả lời địa điểm trực tiếp dựa trên thông tin Google Maps; chế độ demo dùng địa điểm mẫu.',
  },
  fil: {
    label: 'Paano ito gumagana',
    forecast: 'Batay ang mga forecast sa benta ng tindahan mo nitong mga nakaraang linggo.',
    coach:
      'Gumagamit ang coach ng Gemini AI ng Google para tulungan ang negosyo mo kapag naka-on ang live AI; kung hindi, mga halimbawang sagot ang ibibigay.',
    voice: 'Makakausap mo ang coach sa Gemini Live kapag available ang live na boses.',
    photo:
      'Nagbabasa ng mga larawan ang Gemini vision at nagbabasa ng resibo at invoice ang Document AI kapag naka-enable; kung hindi, mga halimbawa ang gamit.',
    places:
      'Batay sa Google Maps ang mga live na sagot tungkol sa lugar; mga halimbawang lugar ang gamit sa demo mode.',
  },
}

export type AiFeature = Exclude<keyof typeof en, 'label'>

export function aiInfoCopy(locale: Locale): typeof en {
  return copy[locale]
}
