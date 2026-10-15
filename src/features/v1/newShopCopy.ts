import { useLocale } from '../../state/hooks'
import type { Locale } from '../../i18n/locales'

type FlowCopy = {
  title: string
  heroBody: string
  begin: string
  open: string
  ready: string
  photos: string
  tour: string
  current: string
  near: (area: string) => string
  /** Conversation screen. */
  listening: string
  micOff: string
  micOn: string
  micStop: string
  mute: string
  unmute: string
  captions: string
  skip: string
  photo: string
  location: string
  review: string
  soFar: string
  unnamed: string
  /** Agent action cards. */
  added: string
  menuRead: (count: number) => string
  locationSaved: (place: string) => string
  described: string
  /** Full-screen review. */
  reviewTitle: string
  backToChat: string
  /** Empty My shop. */
  createShop: string
  /**
   * What the app says to the coach on the owner's behalf (never shown as the owner's bubble):
   * opening the flow, no answer, a photo it read and a location the owner shared.
   */
  start: string
  silence: string
  photoNote: (summary: string) => string
  locationNote: (place: string) => string
}

const copy: Record<Locale, FlowCopy> = {
  en: {
    title: 'Let’s open your shop', heroBody: 'I’ll ask a few quick questions and build your shop while we talk. Just answer out loud, or type.',
    begin: 'Let’s begin', open: 'Open my shop', ready: 'Your shop is ready', photos: 'Add photos', tour: 'Take the tour',
    current: 'Your current location', near: (area) => `Near ${area}`,
    listening: 'Listening… just answer', micOff: 'Mic is off. Type, or tap the mic to talk.', micOn: 'Turn on the mic', micStop: 'Turn off the mic',
    mute: 'Mute the coach’s voice', unmute: 'Turn on the coach’s voice', captions: 'Captions', skip: 'Skip', photo: 'Menu photo',
    location: 'My location', review: 'Review my shop', soFar: 'Your shop so far', unnamed: 'Your new shop',
    added: 'Added to your shop', menuRead: (n) => `I read your menu: ${n === 1 ? '1 item' : `${n} items`}`,
    locationSaved: (place) => `Saved your location: ${place}`, described: 'Wrote a short description for customers',
    reviewTitle: 'Check your shop', backToChat: 'Back to the chat', createShop: 'Create your shop',
    start: 'Hello! I want to open a new shop.', silence: 'I’m not sure. Suggest something or skip it, and ask me the next question.',
    photoNote: (summary) => `I added a photo. You read: ${summary}. Ask me the next question.`,
    locationNote: (place) => `I shared my location: ${place}. Ask me the next question.`,
  },
  hi: {
    title: 'आइए आपकी दुकान खोलें', heroBody: 'मैं कुछ छोटे सवाल पूछूँगा और बात करते-करते आपकी दुकान बना दूँगा। बस बोलकर जवाब दें, या लिखें।',
    begin: 'शुरू करें', open: 'मेरी दुकान खोलें', ready: 'आपकी दुकान तैयार है', photos: 'फ़ोटो जोड़ें', tour: 'सैर करें',
    current: 'आपकी वर्तमान जगह', near: (area) => `${area} के पास`,
    listening: 'सुन रहा हूँ… बस जवाब दें', micOff: 'माइक बंद है। लिखें, या बोलने के लिए माइक दबाएँ।', micOn: 'माइक चालू करें', micStop: 'माइक बंद करें',
    mute: 'कोच की आवाज़ बंद करें', unmute: 'कोच की आवाज़ चालू करें', captions: 'कैप्शन', skip: 'छोड़ें', photo: 'मेन्यू की फ़ोटो',
    location: 'मेरी जगह', review: 'मेरी दुकान देखें', soFar: 'अब तक आपकी दुकान', unnamed: 'आपकी नई दुकान',
    added: 'आपकी दुकान में जोड़ा गया', menuRead: (n) => `मैंने आपका मेन्यू पढ़ा: ${n} चीज़ें`,
    locationSaved: (place) => `आपकी जगह सहेजी: ${place}`, described: 'ग्राहकों के लिए छोटा विवरण लिखा',
    reviewTitle: 'अपनी दुकान जाँचें', backToChat: 'बातचीत पर लौटें', createShop: 'अपनी दुकान बनाएँ',
    start: 'नमस्ते! मैं एक नई दुकान खोलना चाहता हूँ।', silence: 'मुझे पक्का नहीं पता। कुछ सुझाइए या इसे छोड़ दीजिए, और अगला सवाल पूछिए।',
    photoNote: (summary) => `मैंने एक फ़ोटो जोड़ी। आपने पढ़ा: ${summary}। अगला सवाल पूछिए।`,
    locationNote: (place) => `मैंने अपनी जगह साझा की: ${place}। अगला सवाल पूछिए।`,
  },
  bn: {
    title: 'চলুন আপনার দোকান খুলি', heroBody: 'আমি কয়েকটি ছোট প্রশ্ন করব আর কথা বলতে বলতে আপনার দোকান তৈরি করব। মুখে উত্তর দিন, বা লিখুন।',
    begin: 'শুরু করুন', open: 'আমার দোকান খুলুন', ready: 'আপনার দোকান প্রস্তুত', photos: 'ছবি যোগ করুন', tour: 'ঘুরে দেখুন',
    current: 'আপনার বর্তমান অবস্থান', near: (area) => `${area}-এর কাছে`,
    listening: 'শুনছি… শুধু উত্তর দিন', micOff: 'মাইক বন্ধ। লিখুন, বা কথা বলতে মাইকে চাপুন।', micOn: 'মাইক চালু করুন', micStop: 'মাইক বন্ধ করুন',
    mute: 'কোচের কণ্ঠ বন্ধ করুন', unmute: 'কোচের কণ্ঠ চালু করুন', captions: 'ক্যাপশন', skip: 'বাদ দিন', photo: 'মেনুর ছবি',
    location: 'আমার অবস্থান', review: 'আমার দোকান দেখুন', soFar: 'এখন পর্যন্ত আপনার দোকান', unnamed: 'আপনার নতুন দোকান',
    added: 'আপনার দোকানে যোগ হয়েছে', menuRead: (n) => `আপনার মেনু পড়েছি: ${n}টি আইটেম`,
    locationSaved: (place) => `আপনার অবস্থান সংরক্ষিত: ${place}`, described: 'গ্রাহকদের জন্য ছোট বিবরণ লিখেছি',
    reviewTitle: 'আপনার দোকান দেখে নিন', backToChat: 'কথোপকথনে ফিরুন', createShop: 'আপনার দোকান তৈরি করুন',
    start: 'হ্যালো! আমি একটি নতুন দোকান খুলতে চাই।', silence: 'আমি নিশ্চিত নই। কিছু প্রস্তাব দিন বা এটা বাদ দিন, আর পরের প্রশ্ন করুন।',
    photoNote: (summary) => `আমি একটি ছবি যোগ করেছি। আপনি পড়েছেন: ${summary}। পরের প্রশ্ন করুন।`,
    locationNote: (place) => `আমি আমার অবস্থান শেয়ার করেছি: ${place}। পরের প্রশ্ন করুন।`,
  },
  te: {
    title: 'మీ దుకాణాన్ని తెరుద్దాం', heroBody: 'నేను కొన్ని చిన్న ప్రశ్నలు అడిగి, మాట్లాడుతూనే మీ దుకాణాన్ని తయారు చేస్తాను. గట్టిగా సమాధానం చెప్పండి, లేదా టైప్ చేయండి.',
    begin: 'ప్రారంభిద్దాం', open: 'నా దుకాణాన్ని తెరవండి', ready: 'మీ దుకాణం సిద్ధంగా ఉంది', photos: 'ఫోటోలు జోడించండి', tour: 'టూర్ చూడండి',
    current: 'మీ ప్రస్తుత స్థానం', near: (area) => `${area} సమీపంలో`,
    listening: 'వింటున్నాను… సమాధానం చెప్పండి', micOff: 'మైక్ ఆఫ్‌లో ఉంది. టైప్ చేయండి, లేదా మాట్లాడటానికి మైక్ నొక్కండి.', micOn: 'మైక్ ఆన్ చేయండి', micStop: 'మైక్ ఆఫ్ చేయండి',
    mute: 'కోచ్ గొంతు ఆపండి', unmute: 'కోచ్ గొంతు ఆన్ చేయండి', captions: 'క్యాప్షన్లు', skip: 'దాటవేయండి', photo: 'మెనూ ఫోటో',
    location: 'నా స్థానం', review: 'నా దుకాణం చూడండి', soFar: 'ఇప్పటివరకు మీ దుకాణం', unnamed: 'మీ కొత్త దుకాణం',
    added: 'మీ దుకాణానికి జోడించాను', menuRead: (n) => `మీ మెనూ చదివాను: ${n} అంశాలు`,
    locationSaved: (place) => `మీ స్థానం సేవ్ చేశాను: ${place}`, described: 'కస్టమర్ల కోసం చిన్న వివరణ రాశాను',
    reviewTitle: 'మీ దుకాణాన్ని తనిఖీ చేయండి', backToChat: 'సంభాషణకు తిరిగి వెళ్ళండి', createShop: 'మీ దుకాణాన్ని సృష్టించండి',
    start: 'నమస్తే! నేను కొత్త దుకాణం తెరవాలనుకుంటున్నాను.', silence: 'నాకు ఖచ్చితంగా తెలియదు. ఏదైనా సూచించండి లేదా దాటవేయండి, తర్వాతి ప్రశ్న అడగండి.',
    photoNote: (summary) => `నేను ఒక ఫోటో జోడించాను. మీరు చదివింది: ${summary}. తర్వాతి ప్రశ్న అడగండి.`,
    locationNote: (place) => `నా స్థానాన్ని పంచుకున్నాను: ${place}. తర్వాతి ప్రశ్న అడగండి.`,
  },
  mr: {
    title: 'चला तुमचे दुकान उघडूया', heroBody: 'मी काही छोटे प्रश्न विचारेन आणि बोलता बोलता तुमचे दुकान तयार करेन. फक्त बोलून उत्तर द्या, किंवा टाइप करा.',
    begin: 'सुरू करूया', open: 'माझे दुकान उघडा', ready: 'तुमचे दुकान तयार आहे', photos: 'फोटो जोडा', tour: 'फेरफटका घ्या',
    current: 'तुमचे सध्याचे स्थान', near: (area) => `${area} जवळ`,
    listening: 'ऐकत आहे… फक्त उत्तर द्या', micOff: 'माइक बंद आहे. टाइप करा, किंवा बोलण्यासाठी माइक दाबा.', micOn: 'माइक सुरू करा', micStop: 'माइक बंद करा',
    mute: 'कोचचा आवाज बंद करा', unmute: 'कोचचा आवाज सुरू करा', captions: 'कॅप्शन', skip: 'वगळा', photo: 'मेनूचा फोटो',
    location: 'माझे स्थान', review: 'माझे दुकान पाहा', soFar: 'आतापर्यंत तुमचे दुकान', unnamed: 'तुमचे नवीन दुकान',
    added: 'तुमच्या दुकानात जोडले', menuRead: (n) => `तुमचा मेनू वाचला: ${n} पदार्थ`,
    locationSaved: (place) => `तुमचे स्थान जतन केले: ${place}`, described: 'ग्राहकांसाठी छोटे वर्णन लिहिले',
    reviewTitle: 'तुमचे दुकान तपासा', backToChat: 'संभाषणाकडे परत', createShop: 'तुमचे दुकान तयार करा',
    start: 'नमस्कार! मला नवीन दुकान उघडायचे आहे.', silence: 'मला खात्री नाही. काहीतरी सुचवा किंवा हे वगळा, आणि पुढचा प्रश्न विचारा.',
    photoNote: (summary) => `मी एक फोटो जोडला. तुम्ही वाचले: ${summary}. पुढचा प्रश्न विचारा.`,
    locationNote: (place) => `मी माझे स्थान शेअर केले: ${place}. पुढचा प्रश्न विचारा.`,
  },
  kn: {
    title: 'ನಿಮ್ಮ ಅಂಗಡಿಯನ್ನು ತೆರೆಯೋಣ', heroBody: 'ನಾನು ಕೆಲವು ಚಿಕ್ಕ ಪ್ರಶ್ನೆಗಳನ್ನು ಕೇಳಿ, ಮಾತನಾಡುತ್ತಲೇ ನಿಮ್ಮ ಅಂಗಡಿಯನ್ನು ಸಿದ್ಧಪಡಿಸುತ್ತೇನೆ. ಮಾತಿನಲ್ಲಿ ಉತ್ತರಿಸಿ, ಅಥವಾ ಟೈಪ್ ಮಾಡಿ.',
    begin: 'ಪ್ರಾರಂಭಿಸೋಣ', open: 'ನನ್ನ ಅಂಗಡಿ ತೆರೆಯಿರಿ', ready: 'ನಿಮ್ಮ ಅಂಗಡಿ ಸಿದ್ಧವಾಗಿದೆ', photos: 'ಫೋಟೋಗಳನ್ನು ಸೇರಿಸಿ', tour: 'ಪ್ರವಾಸ ಮಾಡಿ',
    current: 'ನಿಮ್ಮ ಪ್ರಸ್ತುತ ಸ್ಥಳ', near: (area) => `${area} ಬಳಿ`,
    listening: 'ಕೇಳುತ್ತಿದ್ದೇನೆ… ಉತ್ತರಿಸಿ', micOff: 'ಮೈಕ್ ಆಫ್ ಆಗಿದೆ. ಟೈಪ್ ಮಾಡಿ, ಅಥವಾ ಮಾತನಾಡಲು ಮೈಕ್ ಒತ್ತಿ.', micOn: 'ಮೈಕ್ ಆನ್ ಮಾಡಿ', micStop: 'ಮೈಕ್ ಆಫ್ ಮಾಡಿ',
    mute: 'ಕೋಚ್ ಧ್ವನಿ ನಿಲ್ಲಿಸಿ', unmute: 'ಕೋಚ್ ಧ್ವನಿ ಆನ್ ಮಾಡಿ', captions: 'ಶೀರ್ಷಿಕೆಗಳು', skip: 'ಬಿಟ್ಟುಬಿಡಿ', photo: 'ಮೆನು ಫೋಟೋ',
    location: 'ನನ್ನ ಸ್ಥಳ', review: 'ನನ್ನ ಅಂಗಡಿ ನೋಡಿ', soFar: 'ಇಲ್ಲಿಯವರೆಗೆ ನಿಮ್ಮ ಅಂಗಡಿ', unnamed: 'ನಿಮ್ಮ ಹೊಸ ಅಂಗಡಿ',
    added: 'ನಿಮ್ಮ ಅಂಗಡಿಗೆ ಸೇರಿಸಲಾಗಿದೆ', menuRead: (n) => `ನಿಮ್ಮ ಮೆನು ಓದಿದೆ: ${n} ಐಟಂಗಳು`,
    locationSaved: (place) => `ನಿಮ್ಮ ಸ್ಥಳ ಉಳಿಸಲಾಗಿದೆ: ${place}`, described: 'ಗ್ರಾಹಕರಿಗಾಗಿ ಚಿಕ್ಕ ವಿವರಣೆ ಬರೆದಿದ್ದೇನೆ',
    reviewTitle: 'ನಿಮ್ಮ ಅಂಗಡಿ ಪರಿಶೀಲಿಸಿ', backToChat: 'ಸಂಭಾಷಣೆಗೆ ಹಿಂತಿರುಗಿ', createShop: 'ನಿಮ್ಮ ಅಂಗಡಿ ರಚಿಸಿ',
    start: 'ನಮಸ್ಕಾರ! ನಾನು ಹೊಸ ಅಂಗಡಿ ತೆರೆಯಲು ಬಯಸುತ್ತೇನೆ.', silence: 'ನನಗೆ ಖಚಿತವಿಲ್ಲ. ಏನಾದರೂ ಸೂಚಿಸಿ ಅಥವಾ ಬಿಟ್ಟುಬಿಡಿ, ಮುಂದಿನ ಪ್ರಶ್ನೆ ಕೇಳಿ.',
    photoNote: (summary) => `ನಾನು ಫೋಟೋ ಸೇರಿಸಿದ್ದೇನೆ. ನೀವು ಓದಿದ್ದು: ${summary}. ಮುಂದಿನ ಪ್ರಶ್ನೆ ಕೇಳಿ.`,
    locationNote: (place) => `ನನ್ನ ಸ್ಥಳ ಹಂಚಿಕೊಂಡಿದ್ದೇನೆ: ${place}. ಮುಂದಿನ ಪ್ರಶ್ನೆ ಕೇಳಿ.`,
  },
  'zh-Hans': {
    title: '一起开启你的店铺', heroBody: '我会问几个简单的问题，边聊边帮你建好店铺。直接说出答案，或打字也可以。',
    begin: '开始吧', open: '开启我的店铺', ready: '你的店铺已准备好', photos: '添加照片', tour: '查看导览',
    current: '你当前的位置', near: (area) => `${area}附近`,
    listening: '正在听… 直接回答就好', micOff: '麦克风已关闭。可以打字，或点麦克风说话。', micOn: '打开麦克风', micStop: '关闭麦克风',
    mute: '关闭教练语音', unmute: '打开教练语音', captions: '字幕', skip: '跳过', photo: '菜单照片',
    location: '我的位置', review: '查看我的店铺', soFar: '目前的店铺', unnamed: '你的新店铺',
    added: '已添加到你的店铺', menuRead: (n) => `我读取了你的菜单：${n} 项`,
    locationSaved: (place) => `已保存你的位置：${place}`, described: '为顾客写了一段简短介绍',
    reviewTitle: '检查你的店铺', backToChat: '返回对话', createShop: '创建你的店铺',
    start: '你好！我想开一家新店。', silence: '我不太确定。请给个建议或先跳过，然后问下一个问题。',
    photoNote: (summary) => `我添加了一张照片。你读到了：${summary}。请问下一个问题。`,
    locationNote: (place) => `我分享了我的位置：${place}。请问下一个问题。`,
  },
  ms: {
    title: 'Mari buka kedai anda', heroBody: 'Saya akan tanya beberapa soalan ringkas dan bina kedai anda sambil kita berbual. Jawab sahaja dengan suara, atau taip.',
    begin: 'Mari mula', open: 'Buka kedai saya', ready: 'Kedai anda sudah sedia', photos: 'Tambah gambar', tour: 'Ikuti lawatan',
    current: 'Lokasi semasa anda', near: (area) => `Berhampiran ${area}`,
    listening: 'Sedang mendengar… jawab sahaja', micOff: 'Mikrofon dimatikan. Taip, atau tekan mikrofon untuk bercakap.', micOn: 'Hidupkan mikrofon', micStop: 'Matikan mikrofon',
    mute: 'Senyapkan suara jurulatih', unmute: 'Hidupkan suara jurulatih', captions: 'Kapsyen', skip: 'Langkau', photo: 'Gambar menu',
    location: 'Lokasi saya', review: 'Semak kedai saya', soFar: 'Kedai anda setakat ini', unnamed: 'Kedai baharu anda',
    added: 'Ditambah ke kedai anda', menuRead: (n) => `Saya telah baca menu anda: ${n} item`,
    locationSaved: (place) => `Lokasi anda disimpan: ${place}`, described: 'Menulis penerangan ringkas untuk pelanggan',
    reviewTitle: 'Semak kedai anda', backToChat: 'Kembali ke perbualan', createShop: 'Cipta kedai anda',
    start: 'Helo! Saya mahu buka kedai baharu.', silence: 'Saya tidak pasti. Cadangkan sesuatu atau langkau, dan tanya soalan seterusnya.',
    photoNote: (summary) => `Saya tambah gambar. Anda baca: ${summary}. Tanya soalan seterusnya.`,
    locationNote: (place) => `Saya kongsi lokasi saya: ${place}. Tanya soalan seterusnya.`,
  },
  ta: {
    title: 'உங்கள் கடையைத் திறப்போம்', heroBody: 'சில சிறு கேள்விகள் கேட்டு, பேசிக்கொண்டே உங்கள் கடையை உருவாக்குவேன். பேசியே பதில் சொல்லுங்கள், அல்லது தட்டச்சு செய்யுங்கள்.',
    begin: 'தொடங்குவோம்', open: 'என் கடையைத் திற', ready: 'உங்கள் கடை தயார்', photos: 'படங்களைச் சேர்க்க', tour: 'சுற்றிப்பார்க்க',
    current: 'உங்கள் தற்போதைய இருப்பிடம்', near: (area) => `${area} அருகில்`,
    listening: 'கேட்கிறேன்… பதில் சொல்லுங்கள்', micOff: 'மைக் அணைக்கப்பட்டுள்ளது. தட்டச்சு செய்யுங்கள், அல்லது பேச மைக்கைத் தட்டுங்கள்.', micOn: 'மைக்கை இயக்கு', micStop: 'மைக்கை அணை',
    mute: 'பயிற்சியாளர் குரலை நிறுத்து', unmute: 'பயிற்சியாளர் குரலை இயக்கு', captions: 'தலைப்புகள்', skip: 'தவிர்', photo: 'மெனு படம்',
    location: 'என் இருப்பிடம்', review: 'என் கடையைப் பார்', soFar: 'இதுவரை உங்கள் கடை', unnamed: 'உங்கள் புதிய கடை',
    added: 'உங்கள் கடையில் சேர்க்கப்பட்டது', menuRead: (n) => `உங்கள் மெனுவைப் படித்தேன்: ${n} பொருட்கள்`,
    locationSaved: (place) => `உங்கள் இருப்பிடம் சேமிக்கப்பட்டது: ${place}`, described: 'வாடிக்கையாளர்களுக்கு சிறு விளக்கம் எழுதினேன்',
    reviewTitle: 'உங்கள் கடையைச் சரிபாருங்கள்', backToChat: 'உரையாடலுக்குத் திரும்பு', createShop: 'உங்கள் கடையை உருவாக்குங்கள்',
    start: 'வணக்கம்! நான் புதிய கடை திறக்க விரும்புகிறேன்.', silence: 'எனக்கு உறுதியாகத் தெரியவில்லை. ஏதாவது பரிந்துரையுங்கள் அல்லது தவிருங்கள், அடுத்த கேள்வியைக் கேளுங்கள்.',
    photoNote: (summary) => `நான் ஒரு படம் சேர்த்தேன். நீங்கள் படித்தது: ${summary}. அடுத்த கேள்வியைக் கேளுங்கள்.`,
    locationNote: (place) => `என் இருப்பிடத்தைப் பகிர்ந்தேன்: ${place}. அடுத்த கேள்வியைக் கேளுங்கள்.`,
  },
  ja: {
    title: 'あなたのお店を始めましょう', heroBody: 'いくつか簡単な質問をして、話しながらお店を作ります。声で答えても、入力してもかまいません。',
    begin: 'はじめる', open: 'お店を開く', ready: 'お店の準備ができました', photos: '写真を追加', tour: 'ツアーを見る',
    current: '現在地', near: (area) => `${area}の近く`,
    listening: '聞いています… そのまま答えてください', micOff: 'マイクはオフです。入力するか、マイクをタップして話してください。', micOn: 'マイクをオンにする', micStop: 'マイクをオフにする',
    mute: 'コーチの音声をミュート', unmute: 'コーチの音声をオン', captions: '字幕', skip: 'スキップ', photo: 'メニューの写真',
    location: '現在地を使う', review: 'お店を確認する', soFar: 'ここまでのお店', unnamed: '新しいお店',
    added: 'お店に追加しました', menuRead: (n) => `メニューを読み取りました：${n} 品`,
    locationSaved: (place) => `場所を保存しました：${place}`, described: 'お客様向けの短い紹介文を書きました',
    reviewTitle: 'お店を確認', backToChat: '会話に戻る', createShop: 'お店を作成',
    start: 'こんにちは！新しいお店を開きたいです。', silence: 'よくわかりません。何か提案するか、飛ばして次の質問をしてください。',
    photoNote: (summary) => `写真を追加しました。読み取った内容：${summary}。次の質問をしてください。`,
    locationNote: (place) => `現在地を共有しました：${place}。次の質問をしてください。`,
  },
  ko: {
    title: '가게를 열어 볼까요', heroBody: '간단한 질문 몇 가지를 드리고, 대화하면서 가게를 만들어 드릴게요. 말로 답하거나 입력하세요.',
    begin: '시작하기', open: '내 가게 열기', ready: '가게가 준비됐어요', photos: '사진 추가', tour: '둘러보기',
    current: '현재 위치', near: (area) => `${area} 근처`,
    listening: '듣고 있어요… 그냥 답해 주세요', micOff: '마이크가 꺼져 있어요. 입력하거나 마이크를 눌러 말하세요.', micOn: '마이크 켜기', micStop: '마이크 끄기',
    mute: '코치 음성 끄기', unmute: '코치 음성 켜기', captions: '자막', skip: '건너뛰기', photo: '메뉴 사진',
    location: '내 위치', review: '내 가게 확인', soFar: '지금까지의 가게', unnamed: '새 가게',
    added: '가게에 추가했어요', menuRead: (n) => `메뉴를 읽었어요: ${n}개 항목`,
    locationSaved: (place) => `위치를 저장했어요: ${place}`, described: '손님을 위한 짧은 소개를 썼어요',
    reviewTitle: '가게 확인하기', backToChat: '대화로 돌아가기', createShop: '가게 만들기',
    start: '안녕하세요! 새 가게를 열고 싶어요.', silence: '잘 모르겠어요. 제안해 주시거나 건너뛰고 다음 질문을 해 주세요.',
    photoNote: (summary) => `사진을 추가했어요. 읽은 내용: ${summary}. 다음 질문을 해 주세요.`,
    locationNote: (place) => `제 위치를 공유했어요: ${place}. 다음 질문을 해 주세요.`,
  },
  id: {
    title: 'Mari buka toko Anda', heroBody: 'Saya akan mengajukan beberapa pertanyaan singkat dan membangun toko Anda sambil kita mengobrol. Jawab saja dengan suara, atau ketik.',
    begin: 'Ayo mulai', open: 'Buka toko saya', ready: 'Toko Anda sudah siap', photos: 'Tambah foto', tour: 'Ikuti tur',
    current: 'Lokasi Anda saat ini', near: (area) => `Dekat ${area}`,
    listening: 'Mendengarkan… jawab saja', micOff: 'Mikrofon mati. Ketik, atau ketuk mikrofon untuk bicara.', micOn: 'Nyalakan mikrofon', micStop: 'Matikan mikrofon',
    mute: 'Bisukan suara pelatih', unmute: 'Nyalakan suara pelatih', captions: 'Teks', skip: 'Lewati', photo: 'Foto menu',
    location: 'Lokasi saya', review: 'Tinjau toko saya', soFar: 'Toko Anda sejauh ini', unnamed: 'Toko baru Anda',
    added: 'Ditambahkan ke toko Anda', menuRead: (n) => `Saya membaca menu Anda: ${n} item`,
    locationSaved: (place) => `Lokasi Anda disimpan: ${place}`, described: 'Menulis deskripsi singkat untuk pelanggan',
    reviewTitle: 'Periksa toko Anda', backToChat: 'Kembali ke obrolan', createShop: 'Buat toko Anda',
    start: 'Halo! Saya ingin membuka toko baru.', silence: 'Saya tidak yakin. Sarankan sesuatu atau lewati, lalu ajukan pertanyaan berikutnya.',
    photoNote: (summary) => `Saya menambahkan foto. Yang Anda baca: ${summary}. Ajukan pertanyaan berikutnya.`,
    locationNote: (place) => `Saya membagikan lokasi saya: ${place}. Ajukan pertanyaan berikutnya.`,
  },
  th: {
    title: 'มาเปิดร้านของคุณกัน', heroBody: 'ฉันจะถามคำถามสั้นๆ ไม่กี่ข้อ แล้วสร้างร้านของคุณไปพร้อมกับการคุย ตอบด้วยเสียงหรือพิมพ์ก็ได้',
    begin: 'เริ่มกันเลย', open: 'เปิดร้านของฉัน', ready: 'ร้านของคุณพร้อมแล้ว', photos: 'เพิ่มรูปภาพ', tour: 'ชมการแนะนำ',
    current: 'ตำแหน่งปัจจุบันของคุณ', near: (area) => `ใกล้ ${area}`,
    listening: 'กำลังฟัง… ตอบได้เลย', micOff: 'ไมค์ปิดอยู่ พิมพ์ หรือแตะไมค์เพื่อพูด', micOn: 'เปิดไมค์', micStop: 'ปิดไมค์',
    mute: 'ปิดเสียงโค้ช', unmute: 'เปิดเสียงโค้ช', captions: 'คำบรรยาย', skip: 'ข้าม', photo: 'รูปเมนู',
    location: 'ตำแหน่งของฉัน', review: 'ตรวจดูร้านของฉัน', soFar: 'ร้านของคุณตอนนี้', unnamed: 'ร้านใหม่ของคุณ',
    added: 'เพิ่มลงในร้านของคุณแล้ว', menuRead: (n) => `อ่านเมนูของคุณแล้ว: ${n} รายการ`,
    locationSaved: (place) => `บันทึกตำแหน่งของคุณแล้ว: ${place}`, described: 'เขียนคำอธิบายสั้นๆ สำหรับลูกค้าแล้ว',
    reviewTitle: 'ตรวจสอบร้านของคุณ', backToChat: 'กลับไปที่การสนทนา', createShop: 'สร้างร้านของคุณ',
    start: 'สวัสดี! ฉันอยากเปิดร้านใหม่', silence: 'ฉันไม่แน่ใจ ช่วยแนะนำหรือข้ามไปก่อน แล้วถามคำถามถัดไป',
    photoNote: (summary) => `ฉันเพิ่มรูปแล้ว สิ่งที่คุณอ่านได้: ${summary} ถามคำถามถัดไปได้เลย`,
    locationNote: (place) => `ฉันแชร์ตำแหน่งแล้ว: ${place} ถามคำถามถัดไปได้เลย`,
  },
  vi: {
    title: 'Cùng mở cửa hàng của bạn', heroBody: 'Tôi sẽ hỏi vài câu ngắn và dựng cửa hàng cho bạn ngay trong lúc trò chuyện. Cứ trả lời bằng giọng nói, hoặc gõ.',
    begin: 'Bắt đầu nào', open: 'Mở cửa hàng của tôi', ready: 'Cửa hàng của bạn đã sẵn sàng', photos: 'Thêm ảnh', tour: 'Xem hướng dẫn',
    current: 'Vị trí hiện tại của bạn', near: (area) => `Gần ${area}`,
    listening: 'Đang nghe… cứ trả lời', micOff: 'Micrô đang tắt. Hãy gõ, hoặc chạm micrô để nói.', micOn: 'Bật micrô', micStop: 'Tắt micrô',
    mute: 'Tắt giọng huấn luyện viên', unmute: 'Bật giọng huấn luyện viên', captions: 'Phụ đề', skip: 'Bỏ qua', photo: 'Ảnh thực đơn',
    location: 'Vị trí của tôi', review: 'Xem lại cửa hàng', soFar: 'Cửa hàng của bạn đến giờ', unnamed: 'Cửa hàng mới của bạn',
    added: 'Đã thêm vào cửa hàng', menuRead: (n) => `Tôi đã đọc thực đơn: ${n} món`,
    locationSaved: (place) => `Đã lưu vị trí: ${place}`, described: 'Đã viết một đoạn giới thiệu ngắn cho khách',
    reviewTitle: 'Kiểm tra cửa hàng', backToChat: 'Quay lại trò chuyện', createShop: 'Tạo cửa hàng của bạn',
    start: 'Xin chào! Tôi muốn mở một cửa hàng mới.', silence: 'Tôi không chắc. Hãy gợi ý hoặc bỏ qua, rồi hỏi câu tiếp theo.',
    photoNote: (summary) => `Tôi đã thêm một ảnh. Bạn đọc được: ${summary}. Hãy hỏi câu tiếp theo.`,
    locationNote: (place) => `Tôi đã chia sẻ vị trí: ${place}. Hãy hỏi câu tiếp theo.`,
  },
  fil: {
    title: 'Buksan natin ang iyong tindahan', heroBody: 'Magtatanong ako ng ilang maiikling tanong at bubuuin ko ang tindahan mo habang nag-uusap tayo. Sumagot lang nang malakas, o mag-type.',
    begin: 'Simulan na', open: 'Buksan ang tindahan ko', ready: 'Handa na ang tindahan mo', photos: 'Magdagdag ng mga larawan', tour: 'Sumali sa tour',
    current: 'Kasalukuyan mong lokasyon', near: (area) => `Malapit sa ${area}`,
    listening: 'Nakikinig… sumagot lang', micOff: 'Naka-off ang mic. Mag-type, o i-tap ang mic para magsalita.', micOn: 'I-on ang mic', micStop: 'I-off ang mic',
    mute: 'I-mute ang boses ng coach', unmute: 'I-on ang boses ng coach', captions: 'Caption', skip: 'Laktawan', photo: 'Larawan ng menu',
    location: 'Lokasyon ko', review: 'Suriin ang tindahan ko', soFar: 'Ang tindahan mo sa ngayon', unnamed: 'Ang bago mong tindahan',
    added: 'Idinagdag sa tindahan mo', menuRead: (n) => `Nabasa ko ang menu mo: ${n} item`,
    locationSaved: (place) => `Na-save ang lokasyon mo: ${place}`, described: 'Sumulat ng maikling paglalarawan para sa mga customer',
    reviewTitle: 'Suriin ang tindahan mo', backToChat: 'Bumalik sa usapan', createShop: 'Gawin ang tindahan mo',
    start: 'Kumusta! Gusto kong magbukas ng bagong tindahan.', silence: 'Hindi ako sigurado. Magmungkahi ka o laktawan ito, at itanong ang susunod.',
    photoNote: (summary) => `Nagdagdag ako ng larawan. Nabasa mo: ${summary}. Itanong ang susunod.`,
    locationNote: (place) => `Ibinahagi ko ang lokasyon ko: ${place}. Itanong ang susunod.`,
  },
}

export function useNewShopCopy() {
  return copy[useLocale()]
}
