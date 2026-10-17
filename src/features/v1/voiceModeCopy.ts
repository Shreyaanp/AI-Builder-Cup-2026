import { useLocale } from '../../state/hooks'
import type { Locale } from '../../i18n/locales'

/** The new-shop "voice mode" stage: orb states, controls, the filling shop card and alerts. */
type VoiceModeCopy = {
  /** What the orb is doing (also its accessible status). */
  connecting: string
  listening: string
  thinking: string
  speaking: string
  reconnecting: string
  paused: string
  typing: string
  /** Controls. */
  typeInstead: string
  talkInstead: string
  pauseMic: string
  resumeMic: string
  endVoice: string
  conversation: string
  /** The shop card. */
  cardHint: string
  more: (count: number) => string
  /** Alerts: every failure says what happened and what to do. */
  tryAgain: string
  reconnect: string
  close: string
  micBlockedTitle: string
  micBlockedBody: string
  noMicTitle: string
  noMicBody: string
  connectionTitle: string
  connectionBody: string
  rateTitle: string
  rateBody: (seconds: number) => string
  unavailableTitle: string
  unavailableBody: string
}

const copy: Record<Locale, VoiceModeCopy> = {
  en: {
    connecting: 'Connecting…',
    listening: 'Listening… just talk',
    thinking: 'Thinking…',
    speaking: 'Speaking',
    reconnecting: 'Reconnecting…',
    paused: 'Mic paused',
    typing: 'Type your answer',
    typeInstead: 'Type instead',
    talkInstead: 'Talk instead',
    pauseMic: 'Pause the mic',
    resumeMic: 'Resume the mic',
    endVoice: 'End voice',
    conversation: 'Conversation',
    cardHint: 'What you tell me appears here.',
    more: (n) => `+${n} more`,
    tryAgain: 'Try again',
    reconnect: 'Retry',
    close: 'Close',
    micBlockedTitle: 'Your microphone is blocked',
    micBlockedBody:
      'To talk, allow the microphone for this site: tap the lock icon next to the web address, choose Microphone, then Allow. We’ll carry on by typing until then.',
    noMicTitle: 'No microphone found',
    noMicBody:
      'Connect a microphone or close other apps that are using it, then try again. You can type meanwhile.',
    connectionTitle: 'Voice paused',
    connectionBody:
      'The connection dropped. Voice comes back by itself when your internet does, or tap Retry. We carry on from the same question, and you can keep typing.',
    rateTitle: 'Voice is busy',
    rateBody: (s) => `Too many voice sessions just now. Try again in ${s} s, or type meanwhile.`,
    unavailableTitle: 'Voice isn’t available right now',
    unavailableBody: 'Let’s carry on by typing. I’ll still read my replies aloud.',
  },
  hi: {
    connecting: 'जुड़ रही हूँ…',
    listening: 'सुन रही हूँ… बस बोलिए',
    thinking: 'सोच रही हूँ…',
    speaking: 'बोल रही हूँ',
    reconnecting: 'फिर से जुड़ रही हूँ…',
    paused: 'माइक रुका है',
    typing: 'अपना जवाब लिखें',
    typeInstead: 'लिखकर बताएँ',
    talkInstead: 'बोलकर बताएँ',
    pauseMic: 'माइक रोकें',
    resumeMic: 'माइक फिर चालू करें',
    endVoice: 'आवाज़ बंद करें',
    conversation: 'बातचीत',
    cardHint: 'आप जो बताएँगे, वह यहाँ दिखेगा।',
    more: (n) => `+${n} और`,
    tryAgain: 'फिर कोशिश करें',
    reconnect: 'फिर से कोशिश करें',
    close: 'बंद करें',
    micBlockedTitle: 'आपका माइक ब्लॉक है',
    micBlockedBody:
      'बात करने के लिए इस साइट को माइक की अनुमति दें: वेब पते के पास ताले के आइकन पर टैप करें, माइक्रोफ़ोन चुनें, फिर अनुमति दें। तब तक हम लिखकर बात करेंगे।',
    noMicTitle: 'कोई माइक नहीं मिला',
    noMicBody:
      'माइक जोड़ें या उसे इस्तेमाल कर रहे दूसरे ऐप बंद करें, फिर कोशिश करें। तब तक आप लिख सकते हैं।',
    connectionTitle: 'आवाज़ रुकी है',
    connectionBody:
      'कनेक्शन टूट गया। इंटरनेट लौटते ही आवाज़ अपने आप लौट आएगी, या फिर से कोशिश करें दबाएँ। हम उसी सवाल से आगे बढ़ेंगे, और आप लिखते रह सकते हैं।',
    rateTitle: 'आवाज़ अभी व्यस्त है',
    rateBody: (s) => `अभी बहुत सारे वॉइस सत्र हैं। ${s} सेकंड बाद फिर कोशिश करें, या तब तक लिखें।`,
    unavailableTitle: 'आवाज़ अभी उपलब्ध नहीं है',
    unavailableBody: 'चलिए लिखकर आगे बढ़ते हैं। मैं अपने जवाब फिर भी पढ़कर सुनाऊँगी।',
  },
  bn: {
    connecting: 'সংযোগ হচ্ছে…',
    listening: 'শুনছি… শুধু বলুন',
    thinking: 'ভাবছি…',
    speaking: 'বলছি',
    reconnecting: 'আবার সংযোগ হচ্ছে…',
    paused: 'মাইক থামানো',
    typing: 'আপনার উত্তর লিখুন',
    typeInstead: 'লিখে বলুন',
    talkInstead: 'মুখে বলুন',
    pauseMic: 'মাইক থামান',
    resumeMic: 'মাইক আবার চালু করুন',
    endVoice: 'কণ্ঠ বন্ধ করুন',
    conversation: 'কথোপকথন',
    cardHint: 'আপনি যা বলবেন, এখানে দেখা যাবে।',
    more: (n) => `আরও ${n}টি`,
    tryAgain: 'আবার চেষ্টা করুন',
    reconnect: 'আবার চেষ্টা করুন',
    close: 'বন্ধ করুন',
    micBlockedTitle: 'আপনার মাইক ব্লক করা আছে',
    micBlockedBody:
      'কথা বলতে এই সাইটকে মাইকের অনুমতি দিন: ওয়েব ঠিকানার পাশে তালার আইকনে চাপুন, মাইক্রোফোন বেছে নিন, তারপর অনুমতি দিন। ততক্ষণ আমরা লিখে কথা বলব।',
    noMicTitle: 'কোনো মাইক পাওয়া যায়নি',
    noMicBody:
      'একটি মাইক যুক্ত করুন বা যে অ্যাপগুলো এটি ব্যবহার করছে সেগুলো বন্ধ করুন, তারপর আবার চেষ্টা করুন। ততক্ষণ লিখতে পারেন।',
    connectionTitle: 'ভয়েস থেমে আছে',
    connectionBody:
      'সংযোগ বিচ্ছিন্ন হয়েছে। ইন্টারনেট ফিরলে ভয়েস নিজেই ফিরবে, অথবা আবার চেষ্টা করুন চাপুন। আমরা একই প্রশ্ন থেকে চালিয়ে যাব, আর আপনি লিখতে থাকতে পারেন।',
    rateTitle: 'কণ্ঠ এখন ব্যস্ত',
    rateBody: (s) =>
      `এই মুহূর্তে অনেক ভয়েস সেশন। ${s} সেকেন্ড পরে আবার চেষ্টা করুন, বা ততক্ষণ লিখুন।`,
    unavailableTitle: 'কণ্ঠ এখন পাওয়া যাচ্ছে না',
    unavailableBody: 'চলুন লিখে এগোই। আমি তবুও আমার উত্তর পড়ে শোনাব।',
  },
  te: {
    connecting: 'కనెక్ట్ అవుతోంది…',
    listening: 'వింటున్నాను… మాట్లాడండి',
    thinking: 'ఆలోచిస్తున్నాను…',
    speaking: 'మాట్లాడుతున్నాను',
    reconnecting: 'మళ్ళీ కనెక్ట్ అవుతోంది…',
    paused: 'మైక్ ఆపబడింది',
    typing: 'మీ సమాధానం టైప్ చేయండి',
    typeInstead: 'టైప్ చేయండి',
    talkInstead: 'మాట్లాడండి',
    pauseMic: 'మైక్ ఆపండి',
    resumeMic: 'మైక్ మళ్ళీ ఆన్ చేయండి',
    endVoice: 'వాయిస్ ముగించండి',
    conversation: 'సంభాషణ',
    cardHint: 'మీరు చెప్పేది ఇక్కడ కనిపిస్తుంది.',
    more: (n) => `+${n} మరిన్ని`,
    tryAgain: 'మళ్ళీ ప్రయత్నించండి',
    reconnect: 'మళ్ళీ ప్రయత్నించండి',
    close: 'మూసివేయండి',
    micBlockedTitle: 'మీ మైక్ బ్లాక్ చేయబడింది',
    micBlockedBody:
      'మాట్లాడటానికి ఈ సైట్‌కు మైక్ అనుమతి ఇవ్వండి: వెబ్ చిరునామా పక్కన ఉన్న తాళం గుర్తును నొక్కి, మైక్రోఫోన్ ఎంచుకుని, అనుమతించండి. అప్పటిదాకా టైప్ చేస్తూ కొనసాగుదాం.',
    noMicTitle: 'మైక్ కనబడలేదు',
    noMicBody:
      'మైక్ కనెక్ట్ చేయండి లేదా దాన్ని వాడుతున్న ఇతర యాప్‌లను మూసివేసి మళ్ళీ ప్రయత్నించండి. అప్పటిదాకా టైప్ చేయవచ్చు.',
    connectionTitle: 'వాయిస్ ఆగింది',
    connectionBody:
      'కనెక్షన్ పోయింది. ఇంటర్నెట్ రాగానే వాయిస్ దానంతట అదే వస్తుంది, లేదా మళ్ళీ ప్రయత్నించండి నొక్కండి. అదే ప్రశ్న నుంచి కొనసాగిస్తాం, మీరు టైప్ చేస్తూ ఉండవచ్చు.',
    rateTitle: 'వాయిస్ బిజీగా ఉంది',
    rateBody: (s) =>
      `ప్రస్తుతం చాలా వాయిస్ సెషన్లు ఉన్నాయి. ${s} సెకన్ల తర్వాత మళ్ళీ ప్రయత్నించండి, లేదా టైప్ చేయండి.`,
    unavailableTitle: 'ప్రస్తుతం వాయిస్ అందుబాటులో లేదు',
    unavailableBody: 'టైప్ చేస్తూ కొనసాగుదాం. నా సమాధానాలు నేను చదివి వినిపిస్తాను.',
  },
  mr: {
    connecting: 'जोडत आहे…',
    listening: 'ऐकत आहे… फक्त बोला',
    thinking: 'विचार करत आहे…',
    speaking: 'बोलत आहे',
    reconnecting: 'पुन्हा जोडत आहे…',
    paused: 'माइक थांबवला आहे',
    typing: 'तुमचे उत्तर लिहा',
    typeInstead: 'लिहून सांगा',
    talkInstead: 'बोलून सांगा',
    pauseMic: 'माइक थांबवा',
    resumeMic: 'माइक पुन्हा सुरू करा',
    endVoice: 'आवाज बंद करा',
    conversation: 'संभाषण',
    cardHint: 'तुम्ही जे सांगाल ते इथे दिसेल.',
    more: (n) => `+${n} आणखी`,
    tryAgain: 'पुन्हा प्रयत्न करा',
    reconnect: 'पुन्हा प्रयत्न करा',
    close: 'बंद करा',
    micBlockedTitle: 'तुमचा माइक ब्लॉक आहे',
    micBlockedBody:
      'बोलण्यासाठी या साइटला माइकची परवानगी द्या: वेब पत्त्याजवळील कुलूप चिन्हावर टॅप करा, मायक्रोफोन निवडा, मग परवानगी द्या. तोपर्यंत आपण लिहून बोलू.',
    noMicTitle: 'माइक सापडला नाही',
    noMicBody:
      'माइक जोडा किंवा तो वापरणारे इतर अ‍ॅप बंद करा, मग पुन्हा प्रयत्न करा. तोपर्यंत तुम्ही लिहू शकता.',
    connectionTitle: 'आवाज थांबला आहे',
    connectionBody:
      'जोडणी तुटली. इंटरनेट परत आले की आवाज आपोआप परत येईल, किंवा पुन्हा प्रयत्न करा दाबा. आपण त्याच प्रश्नापासून पुढे जाऊ, आणि तुम्ही लिहीत राहू शकता.',
    rateTitle: 'आवाज सध्या व्यस्त आहे',
    rateBody: (s) =>
      `सध्या खूप व्हॉइस सत्रे आहेत. ${s} सेकंदांनी पुन्हा प्रयत्न करा, किंवा तोपर्यंत लिहा.`,
    unavailableTitle: 'आवाज सध्या उपलब्ध नाही',
    unavailableBody: 'चला लिहून पुढे जाऊया. मी माझी उत्तरे तरीही वाचून दाखवेन.',
  },
  kn: {
    connecting: 'ಸಂಪರ್ಕಿಸುತ್ತಿದೆ…',
    listening: 'ಕೇಳುತ್ತಿದ್ದೇನೆ… ಮಾತನಾಡಿ',
    thinking: 'ಯೋಚಿಸುತ್ತಿದ್ದೇನೆ…',
    speaking: 'ಮಾತನಾಡುತ್ತಿದ್ದೇನೆ',
    reconnecting: 'ಮತ್ತೆ ಸಂಪರ್ಕಿಸುತ್ತಿದೆ…',
    paused: 'ಮೈಕ್ ನಿಲ್ಲಿಸಲಾಗಿದೆ',
    typing: 'ನಿಮ್ಮ ಉತ್ತರ ಬರೆಯಿರಿ',
    typeInstead: 'ಬರೆದು ತಿಳಿಸಿ',
    talkInstead: 'ಮಾತನಾಡಿ ತಿಳಿಸಿ',
    pauseMic: 'ಮೈಕ್ ನಿಲ್ಲಿಸಿ',
    resumeMic: 'ಮೈಕ್ ಮತ್ತೆ ಆನ್ ಮಾಡಿ',
    endVoice: 'ಧ್ವನಿ ಮುಗಿಸಿ',
    conversation: 'ಸಂಭಾಷಣೆ',
    cardHint: 'ನೀವು ಹೇಳುವುದು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.',
    more: (n) => `+${n} ಇನ್ನಷ್ಟು`,
    tryAgain: 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',
    reconnect: 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',
    close: 'ಮುಚ್ಚಿ',
    micBlockedTitle: 'ನಿಮ್ಮ ಮೈಕ್ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ',
    micBlockedBody:
      'ಮಾತನಾಡಲು ಈ ಸೈಟ್‌ಗೆ ಮೈಕ್ ಅನುಮತಿ ನೀಡಿ: ವೆಬ್ ವಿಳಾಸದ ಪಕ್ಕದ ಬೀಗದ ಚಿಹ್ನೆ ಒತ್ತಿ, ಮೈಕ್ರೊಫೋನ್ ಆಯ್ಕೆಮಾಡಿ, ನಂತರ ಅನುಮತಿಸಿ. ಅಲ್ಲಿಯವರೆಗೆ ಬರೆದು ಮುಂದುವರಿಯೋಣ.',
    noMicTitle: 'ಮೈಕ್ ಸಿಗಲಿಲ್ಲ',
    noMicBody:
      'ಮೈಕ್ ಸಂಪರ್ಕಿಸಿ ಅಥವಾ ಅದನ್ನು ಬಳಸುತ್ತಿರುವ ಇತರ ಆ್ಯಪ್‌ಗಳನ್ನು ಮುಚ್ಚಿ, ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. ಅಲ್ಲಿಯವರೆಗೆ ಬರೆಯಬಹುದು.',
    connectionTitle: 'ಧ್ವನಿ ನಿಂತಿದೆ',
    connectionBody:
      'ಸಂಪರ್ಕ ಕಡಿತಗೊಂಡಿದೆ. ಇಂಟರ್ನೆಟ್ ಬಂದ ಕೂಡಲೇ ಧ್ವನಿ ತಾನಾಗಿ ಮರಳುತ್ತದೆ, ಅಥವಾ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ ಒತ್ತಿ. ಅದೇ ಪ್ರಶ್ನೆಯಿಂದ ಮುಂದುವರಿಯುತ್ತೇವೆ, ನೀವು ಟೈಪ್ ಮಾಡುತ್ತಿರಬಹುದು.',
    rateTitle: 'ಧ್ವನಿ ಈಗ ಬ್ಯುಸಿಯಾಗಿದೆ',
    rateBody: (s) =>
      `ಈಗ ತುಂಬಾ ಧ್ವನಿ ಸೆಷನ್‌ಗಳಿವೆ. ${s} ಸೆಕೆಂಡುಗಳ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ, ಅಥವಾ ಬರೆಯಿರಿ.`,
    unavailableTitle: 'ಧ್ವನಿ ಈಗ ಲಭ್ಯವಿಲ್ಲ',
    unavailableBody: 'ಬರೆದು ಮುಂದುವರಿಯೋಣ. ನನ್ನ ಉತ್ತರಗಳನ್ನು ನಾನು ಓದಿ ಹೇಳುತ್ತೇನೆ.',
  },
  'zh-Hans': {
    connecting: '正在连接…',
    listening: '正在听… 直接说吧',
    thinking: '正在思考…',
    speaking: '正在说话',
    reconnecting: '正在重新连接…',
    paused: '麦克风已暂停',
    typing: '输入你的回答',
    typeInstead: '改为打字',
    talkInstead: '改为说话',
    pauseMic: '暂停麦克风',
    resumeMic: '恢复麦克风',
    endVoice: '结束语音',
    conversation: '对话',
    cardHint: '你告诉我的内容会显示在这里。',
    more: (n) => `还有 ${n} 项`,
    tryAgain: '重试',
    reconnect: '重试',
    close: '关闭',
    micBlockedTitle: '麦克风已被阻止',
    micBlockedBody:
      '如需说话，请允许本网站使用麦克风：点按网址旁的锁形图标，选择“麦克风”，然后选择“允许”。在此之前我们先打字继续。',
    noMicTitle: '未找到麦克风',
    noMicBody: '请连接麦克风，或关闭正在使用它的其他应用，然后重试。你也可以先打字。',
    connectionTitle: '语音已暂停',
    connectionBody:
      '连接已断开。网络恢复后语音会自动回来，也可以点“重试”。我们会从同一个问题继续，你也可以继续打字。',
    rateTitle: '语音繁忙',
    rateBody: (s) => `当前语音会话过多。请在 ${s} 秒后重试，或先打字。`,
    unavailableTitle: '语音暂时不可用',
    unavailableBody: '我们先打字继续。我仍会把回复读给你听。',
  },
  ms: {
    connecting: 'Menyambung…',
    listening: 'Mendengar… cakap sahaja',
    thinking: 'Sedang berfikir…',
    speaking: 'Sedang bercakap',
    reconnecting: 'Menyambung semula…',
    paused: 'Mikrofon dijeda',
    typing: 'Taip jawapan anda',
    typeInstead: 'Taip sahaja',
    talkInstead: 'Cakap sahaja',
    pauseMic: 'Jeda mikrofon',
    resumeMic: 'Sambung mikrofon',
    endVoice: 'Tamatkan suara',
    conversation: 'Perbualan',
    cardHint: 'Apa yang anda beritahu akan muncul di sini.',
    more: (n) => `+${n} lagi`,
    tryAgain: 'Cuba lagi',
    reconnect: 'Cuba lagi',
    close: 'Tutup',
    micBlockedTitle: 'Mikrofon anda disekat',
    micBlockedBody:
      'Untuk bercakap, benarkan mikrofon untuk laman ini: ketik ikon kunci di sebelah alamat web, pilih Mikrofon, kemudian Benarkan. Sementara itu kita teruskan dengan menaip.',
    noMicTitle: 'Tiada mikrofon ditemui',
    noMicBody:
      'Sambungkan mikrofon atau tutup aplikasi lain yang menggunakannya, kemudian cuba lagi. Anda boleh menaip sementara itu.',
    connectionTitle: 'Suara dijeda',
    connectionBody:
      'Sambungan terputus. Suara akan kembali sendiri apabila internet pulih, atau ketik Cuba lagi. Kita sambung dari soalan yang sama, dan anda boleh terus menaip.',
    rateTitle: 'Suara sedang sibuk',
    rateBody: (s) =>
      `Terlalu banyak sesi suara sekarang. Cuba lagi dalam ${s} saat, atau taip sementara itu.`,
    unavailableTitle: 'Suara tidak tersedia sekarang',
    unavailableBody: 'Mari teruskan dengan menaip. Saya tetap akan membacakan jawapan saya.',
  },
  ta: {
    connecting: 'இணைக்கிறது…',
    listening: 'கேட்கிறேன்… பேசுங்கள்',
    thinking: 'யோசிக்கிறேன்…',
    speaking: 'பேசுகிறேன்',
    reconnecting: 'மீண்டும் இணைக்கிறது…',
    paused: 'மைக் நிறுத்தப்பட்டது',
    typing: 'உங்கள் பதிலைத் தட்டச்சு செய்யுங்கள்',
    typeInstead: 'தட்டச்சு செய்யுங்கள்',
    talkInstead: 'பேசுங்கள்',
    pauseMic: 'மைக்கை நிறுத்து',
    resumeMic: 'மைக்கை மீண்டும் இயக்கு',
    endVoice: 'குரலை முடி',
    conversation: 'உரையாடல்',
    cardHint: 'நீங்கள் சொல்வது இங்கே தோன்றும்.',
    more: (n) => `+${n} மேலும்`,
    tryAgain: 'மீண்டும் முயலவும்',
    reconnect: 'மீண்டும் முயல்',
    close: 'மூடு',
    micBlockedTitle: 'உங்கள் மைக் தடுக்கப்பட்டுள்ளது',
    micBlockedBody:
      'பேச, இந்தத் தளத்திற்கு மைக் அனுமதி தாருங்கள்: இணைய முகவரிக்கு அருகிலுள்ள பூட்டு ஐகானைத் தட்டி, மைக்ரோஃபோனைத் தேர்ந்தெடுத்து, அனுமதியுங்கள். அதுவரை தட்டச்சு செய்து தொடரலாம்.',
    noMicTitle: 'மைக் கிடைக்கவில்லை',
    noMicBody:
      'மைக்கை இணைக்கவும் அல்லது அதைப் பயன்படுத்தும் பிற ஆப்களை மூடவும், பின் மீண்டும் முயலவும். அதுவரை தட்டச்சு செய்யலாம்.',
    connectionTitle: 'குரல் நின்றுள்ளது',
    connectionBody:
      'இணைப்பு துண்டிக்கப்பட்டது. இணையம் வந்ததும் குரல் தானாகத் திரும்பும், அல்லது மீண்டும் முயல் என்பதைத் தட்டவும். அதே கேள்வியிலிருந்து தொடர்வோம், நீங்கள் தட்டச்சு செய்துகொண்டே இருக்கலாம்.',
    rateTitle: 'குரல் பிஸியாக உள்ளது',
    rateBody: (s) =>
      `இப்போது அதிக குரல் அமர்வுகள் உள்ளன. ${s} விநாடிகளில் மீண்டும் முயலவும், அல்லது தட்டச்சு செய்யவும்.`,
    unavailableTitle: 'குரல் இப்போது கிடைக்கவில்லை',
    unavailableBody: 'தட்டச்சு செய்து தொடரலாம். என் பதில்களை நான் படித்துக் காட்டுவேன்.',
  },
  ja: {
    connecting: '接続中…',
    listening: '聞いています… どうぞ話してください',
    thinking: '考え中…',
    speaking: '話しています',
    reconnecting: '再接続中…',
    paused: 'マイク一時停止中',
    typing: '回答を入力してください',
    typeInstead: '入力で答える',
    talkInstead: '声で答える',
    pauseMic: 'マイクを一時停止',
    resumeMic: 'マイクを再開',
    endVoice: '音声を終了',
    conversation: '会話',
    cardHint: '教えてくれた内容がここに表示されます。',
    more: (n) => `ほか ${n} 件`,
    tryAgain: 'もう一度試す',
    reconnect: '再試行',
    close: '閉じる',
    micBlockedTitle: 'マイクがブロックされています',
    micBlockedBody:
      '話すには、このサイトでマイクを許可してください。アドレスの横の鍵アイコンをタップし、「マイク」を選んで「許可」にします。それまでは入力で続けましょう。',
    noMicTitle: 'マイクが見つかりません',
    noMicBody:
      'マイクを接続するか、マイクを使っている他のアプリを閉じてから、もう一度お試しください。その間は入力できます。',
    connectionTitle: '音声を一時停止中',
    connectionBody:
      '接続が切れました。インターネットが戻ると音声も自動で戻ります。「再試行」を押しても大丈夫です。同じ質問から続けます。入力はそのまま続けられます。',
    rateTitle: '音声が混み合っています',
    rateBody: (s) =>
      `音声セッションが多すぎます。${s} 秒後にもう一度試すか、その間は入力してください。`,
    unavailableTitle: '現在、音声は利用できません',
    unavailableBody: '入力で続けましょう。返事は引き続き読み上げます。',
  },
  ko: {
    connecting: '연결 중…',
    listening: '듣고 있어요… 편하게 말씀하세요',
    thinking: '생각 중…',
    speaking: '말하는 중',
    reconnecting: '다시 연결 중…',
    paused: '마이크 일시중지됨',
    typing: '답변을 입력하세요',
    typeInstead: '입력으로 답하기',
    talkInstead: '말로 답하기',
    pauseMic: '마이크 일시중지',
    resumeMic: '마이크 다시 켜기',
    endVoice: '음성 종료',
    conversation: '대화',
    cardHint: '말씀하신 내용이 여기에 표시됩니다.',
    more: (n) => `외 ${n}개`,
    tryAgain: '다시 시도',
    reconnect: '다시 시도',
    close: '닫기',
    micBlockedTitle: '마이크가 차단되어 있어요',
    micBlockedBody:
      '말하려면 이 사이트의 마이크를 허용하세요. 웹 주소 옆 자물쇠 아이콘을 누르고 마이크를 선택한 뒤 허용을 누르세요. 그동안은 입력으로 계속해요.',
    noMicTitle: '마이크를 찾을 수 없어요',
    noMicBody:
      '마이크를 연결하거나 마이크를 사용 중인 다른 앱을 닫은 뒤 다시 시도하세요. 그동안 입력할 수 있어요.',
    connectionTitle: '음성이 잠시 멈췄어요',
    connectionBody:
      '연결이 끊어졌어요. 인터넷이 돌아오면 음성도 자동으로 돌아와요. 다시 시도를 눌러도 돼요. 같은 질문부터 이어가고, 입력은 계속할 수 있어요.',
    rateTitle: '음성이 혼잡해요',
    rateBody: (s) => `지금 음성 세션이 너무 많아요. ${s}초 후 다시 시도하거나 그동안 입력하세요.`,
    unavailableTitle: '지금은 음성을 사용할 수 없어요',
    unavailableBody: '입력으로 계속해요. 답변은 계속 읽어 드릴게요.',
  },
  id: {
    connecting: 'Menghubungkan…',
    listening: 'Mendengarkan… bicara saja',
    thinking: 'Sedang berpikir…',
    speaking: 'Sedang berbicara',
    reconnecting: 'Menghubungkan ulang…',
    paused: 'Mikrofon dijeda',
    typing: 'Ketik jawaban Anda',
    typeInstead: 'Ketik saja',
    talkInstead: 'Bicara saja',
    pauseMic: 'Jeda mikrofon',
    resumeMic: 'Lanjutkan mikrofon',
    endVoice: 'Akhiri suara',
    conversation: 'Percakapan',
    cardHint: 'Apa yang Anda ceritakan muncul di sini.',
    more: (n) => `+${n} lagi`,
    tryAgain: 'Coba lagi',
    reconnect: 'Coba lagi',
    close: 'Tutup',
    micBlockedTitle: 'Mikrofon Anda diblokir',
    micBlockedBody:
      'Untuk berbicara, izinkan mikrofon untuk situs ini: ketuk ikon gembok di samping alamat web, pilih Mikrofon, lalu Izinkan. Sementara itu kita lanjut dengan mengetik.',
    noMicTitle: 'Mikrofon tidak ditemukan',
    noMicBody:
      'Sambungkan mikrofon atau tutup aplikasi lain yang memakainya, lalu coba lagi. Anda bisa mengetik sementara itu.',
    connectionTitle: 'Suara dijeda',
    connectionBody:
      'Koneksi terputus. Suara akan kembali sendiri saat internet pulih, atau ketuk Coba lagi. Kita lanjut dari pertanyaan yang sama, dan Anda bisa terus mengetik.',
    rateTitle: 'Suara sedang sibuk',
    rateBody: (s) =>
      `Terlalu banyak sesi suara saat ini. Coba lagi dalam ${s} detik, atau ketik sementara itu.`,
    unavailableTitle: 'Suara sedang tidak tersedia',
    unavailableBody: 'Mari lanjut dengan mengetik. Saya tetap akan membacakan jawaban saya.',
  },
  th: {
    connecting: 'กำลังเชื่อมต่อ…',
    listening: 'กำลังฟัง… พูดได้เลย',
    thinking: 'กำลังคิด…',
    speaking: 'กำลังพูด',
    reconnecting: 'กำลังเชื่อมต่อใหม่…',
    paused: 'หยุดไมค์ชั่วคราว',
    typing: 'พิมพ์คำตอบของคุณ',
    typeInstead: 'พิมพ์แทน',
    talkInstead: 'พูดแทน',
    pauseMic: 'หยุดไมค์ชั่วคราว',
    resumeMic: 'เปิดไมค์ต่อ',
    endVoice: 'จบการใช้เสียง',
    conversation: 'บทสนทนา',
    cardHint: 'สิ่งที่คุณบอกจะแสดงที่นี่',
    more: (n) => `อีก ${n} รายการ`,
    tryAgain: 'ลองอีกครั้ง',
    reconnect: 'ลองอีกครั้ง',
    close: 'ปิด',
    micBlockedTitle: 'ไมโครโฟนถูกบล็อก',
    micBlockedBody:
      'หากต้องการพูด ให้อนุญาตไมโครโฟนสำหรับเว็บไซต์นี้: แตะไอคอนแม่กุญแจข้างที่อยู่เว็บ เลือกไมโครโฟน แล้วเลือกอนุญาต ระหว่างนี้เราพิมพ์คุยกันไปก่อน',
    noMicTitle: 'ไม่พบไมโครโฟน',
    noMicBody: 'เชื่อมต่อไมโครโฟนหรือปิดแอปอื่นที่ใช้งานอยู่ แล้วลองอีกครั้ง ระหว่างนี้พิมพ์ได้',
    connectionTitle: 'เสียงหยุดชั่วคราว',
    connectionBody:
      'การเชื่อมต่อขาดหาย เสียงจะกลับมาเองเมื่ออินเทอร์เน็ตกลับมา หรือแตะลองอีกครั้ง เราจะต่อจากคำถามเดิม และคุณพิมพ์ต่อได้เลย',
    rateTitle: 'ระบบเสียงไม่ว่าง',
    rateBody: (s) => `ขณะนี้มีการใช้เสียงมากเกินไป ลองอีกครั้งใน ${s} วินาที หรือพิมพ์ไปก่อน`,
    unavailableTitle: 'ยังใช้เสียงไม่ได้ในขณะนี้',
    unavailableBody: 'พิมพ์คุยกันต่อเลย ฉันจะยังอ่านคำตอบให้ฟัง',
  },
  vi: {
    connecting: 'Đang kết nối…',
    listening: 'Đang nghe… cứ nói nhé',
    thinking: 'Đang suy nghĩ…',
    speaking: 'Đang nói',
    reconnecting: 'Đang kết nối lại…',
    paused: 'Đã tạm dừng micrô',
    typing: 'Nhập câu trả lời của bạn',
    typeInstead: 'Nhập thay vì nói',
    talkInstead: 'Nói thay vì nhập',
    pauseMic: 'Tạm dừng micrô',
    resumeMic: 'Bật lại micrô',
    endVoice: 'Kết thúc giọng nói',
    conversation: 'Cuộc trò chuyện',
    cardHint: 'Những gì bạn kể sẽ hiện ở đây.',
    more: (n) => `+${n} nữa`,
    tryAgain: 'Thử lại',
    reconnect: 'Thử lại',
    close: 'Đóng',
    micBlockedTitle: 'Micrô của bạn đang bị chặn',
    micBlockedBody:
      'Để nói, hãy cho phép micrô cho trang này: chạm vào biểu tượng ổ khóa cạnh địa chỉ web, chọn Micrô, rồi chọn Cho phép. Trong lúc đó mình tiếp tục bằng cách nhập.',
    noMicTitle: 'Không tìm thấy micrô',
    noMicBody:
      'Hãy kết nối micrô hoặc đóng các ứng dụng khác đang dùng nó, rồi thử lại. Trong lúc đó bạn có thể nhập.',
    connectionTitle: 'Giọng nói tạm dừng',
    connectionBody:
      'Mất kết nối. Giọng nói sẽ tự quay lại khi có Internet, hoặc chạm Thử lại. Chúng ta sẽ tiếp tục từ đúng câu hỏi đó, và bạn vẫn có thể gõ.',
    rateTitle: 'Giọng nói đang bận',
    rateBody: (s) =>
      `Hiện có quá nhiều phiên giọng nói. Hãy thử lại sau ${s} giây, hoặc nhập trong lúc chờ.`,
    unavailableTitle: 'Hiện chưa dùng được giọng nói',
    unavailableBody: 'Mình tiếp tục bằng cách nhập nhé. Tôi vẫn sẽ đọc to câu trả lời.',
  },
  fil: {
    connecting: 'Kumokonekta…',
    listening: 'Nakikinig… magsalita lang',
    thinking: 'Nag-iisip…',
    speaking: 'Nagsasalita',
    reconnecting: 'Kumokonektang muli…',
    paused: 'Naka-pause ang mic',
    typing: 'I-type ang sagot mo',
    typeInstead: 'Mag-type na lang',
    talkInstead: 'Magsalita na lang',
    pauseMic: 'I-pause ang mic',
    resumeMic: 'Ituloy ang mic',
    endVoice: 'Tapusin ang boses',
    conversation: 'Usapan',
    cardHint: 'Lalabas dito ang mga sinasabi mo.',
    more: (n) => `+${n} pa`,
    tryAgain: 'Subukan muli',
    reconnect: 'Subukang muli',
    close: 'Isara',
    micBlockedTitle: 'Naka-block ang mikropono mo',
    micBlockedBody:
      'Para makapagsalita, payagan ang mikropono para sa site na ito: i-tap ang icon ng kandado sa tabi ng web address, piliin ang Mikropono, saka Payagan. Habang wala pa, mag-type muna tayo.',
    noMicTitle: 'Walang nahanap na mikropono',
    noMicBody:
      'Magkonekta ng mikropono o isara ang ibang app na gumagamit nito, saka subukan muli. Puwede kang mag-type habang naghihintay.',
    connectionTitle: 'Naka-pause ang boses',
    connectionBody:
      'Naputol ang koneksyon. Babalik ang boses kapag bumalik ang internet, o i-tap ang Subukang muli. Itutuloy natin mula sa parehong tanong, at puwede kang mag-type habang naghihintay.',
    rateTitle: 'Abala ang boses',
    rateBody: (s) =>
      `Masyadong maraming voice session ngayon. Subukan muli pagkalipas ng ${s} segundo, o mag-type muna.`,
    unavailableTitle: 'Hindi available ang boses ngayon',
    unavailableBody: 'Mag-type muna tayo. Babasahin ko pa rin nang malakas ang mga sagot ko.',
  },
}

export function useVoiceModeCopy() {
  return copy[useLocale()]
}

/** The voice-mode words in one language (tests read them through Vite). */
export function voiceModeCopyFor(locale: Locale) {
  return copy[locale]
}
