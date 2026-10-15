import type { Locale } from '../../i18n/locales'

const en = {
  pinOffer: 'This photo also has a location. Review it separately before adding a shop pin.',
  reviewPin: 'Review photo location',
  dismiss: 'Dismiss',
  galleryOffer: 'Add this photo to your shop gallery?',
  galleryNote: 'Gallery photos are visible to customers when your page is shared.',
  galleryAdd: 'Add to gallery',
  later: 'Not now',
}
const ta: typeof en = {
  pinOffer:
    'இந்தப் படத்தில் இடத் தகவலும் உள்ளது. கடையின் வரைபடப் பின்னைச் சேர்க்கத் தனியாகச் சரிபார்க்கவும்.',
  reviewPin: 'படத்தின் இடத்தைச் சரிபார்',
  dismiss: 'நீக்கு',
  galleryOffer: 'இந்தப் படத்தை உங்கள் கடையின் படத்தொகுப்பில் சேர்க்கவா?',
  galleryNote: 'பகிரப்பட்ட பக்கத்தில் படத்தொகுப்பை வாடிக்கையாளர்கள் பார்க்கலாம்.',
  galleryAdd: 'படத்தொகுப்பில் சேர்',
  later: 'இப்போது வேண்டாம்',
}
const indic: Partial<Record<Locale, typeof en>> = {
  hi: {
    pinOffer: 'इस फ़ोटो में जगह की जानकारी भी है। दुकान का पिन जोड़ने से पहले इसे अलग से जाँचें।',
    reviewPin: 'फ़ोटो की जगह जाँचें',
    dismiss: 'हटाएँ',
    galleryOffer: 'यह फ़ोटो अपनी दुकान की गैलरी में जोड़ें?',
    galleryNote: 'पेज शेयर होने पर गैलरी की फ़ोटो ग्राहकों को दिखती हैं।',
    galleryAdd: 'गैलरी में जोड़ें',
    later: 'अभी नहीं',
  },
  bn: {
    pinOffer: 'এই ছবিতে জায়গার তথ্যও আছে। দোকানের পিন যোগ করার আগে আলাদা করে মিলিয়ে নিন।',
    reviewPin: 'ছবির জায়গা মিলিয়ে নিন',
    dismiss: 'বাদ দিন',
    galleryOffer: 'এই ছবিটি দোকানের গ্যালারিতে যোগ করবেন?',
    galleryNote: 'পেজ শেয়ার করা থাকলে গ্যালারির ছবি ক্রেতারা দেখতে পান।',
    galleryAdd: 'গ্যালারিতে যোগ করুন',
    later: 'এখন নয়',
  },
  te: {
    pinOffer: 'ఈ ఫోటోలో స్థల సమాచారం కూడా ఉంది. షాప్ పిన్ జోడించే ముందు దాన్ని విడిగా చూసుకోండి.',
    reviewPin: 'ఫోటో స్థలాన్ని చూసుకోండి',
    dismiss: 'వద్దు',
    galleryOffer: 'ఈ ఫోటోను మీ షాప్ గ్యాలరీకి జోడించాలా?',
    galleryNote: 'పేజీ షేర్ చేసినప్పుడు గ్యాలరీ ఫోటోలు కస్టమర్లకు కనిపిస్తాయి.',
    galleryAdd: 'గ్యాలరీకి జోడించండి',
    later: 'ఇప్పుడు కాదు',
  },
  mr: {
    pinOffer: 'या फोटोत ठिकाणाची माहितीही आहे. दुकानाचा पिन जोडण्यापूर्वी ती वेगळी तपासा.',
    reviewPin: 'फोटोचे ठिकाण तपासा',
    dismiss: 'काढा',
    galleryOffer: 'हा फोटो तुमच्या दुकानाच्या गॅलरीत जोडायचा?',
    galleryNote: 'पेज शेअर केल्यावर गॅलरीतील फोटो ग्राहकांना दिसतात.',
    galleryAdd: 'गॅलरीत जोडा',
    later: 'आता नको',
  },
  kn: {
    pinOffer:
      'ಈ ಫೋಟೋದಲ್ಲಿ ಸ್ಥಳದ ಮಾಹಿತಿಯೂ ಇದೆ. ಅಂಗಡಿಯ ಪಿನ್ ಸೇರಿಸುವ ಮೊದಲು ಅದನ್ನು ಪ್ರತ್ಯೇಕವಾಗಿ ಪರಿಶೀಲಿಸಿ.',
    reviewPin: 'ಫೋಟೋದ ಸ್ಥಳ ಪರಿಶೀಲಿಸಿ',
    dismiss: 'ಬೇಡ',
    galleryOffer: 'ಈ ಫೋಟೋವನ್ನು ನಿಮ್ಮ ಅಂಗಡಿಯ ಗ್ಯಾಲರಿಗೆ ಸೇರಿಸಬೇಕೇ?',
    galleryNote: 'ಪುಟ ಹಂಚಿಕೊಂಡಾಗ ಗ್ಯಾಲರಿ ಫೋಟೋಗಳು ಗ್ರಾಹಕರಿಗೆ ಕಾಣುತ್ತವೆ.',
    galleryAdd: 'ಗ್ಯಾಲರಿಗೆ ಸೇರಿಸಿ',
    later: 'ಈಗ ಬೇಡ',
  },
}
export const photoCopy = (locale: Locale) => (locale === 'ta' ? ta : (indic[locale] ?? en))
