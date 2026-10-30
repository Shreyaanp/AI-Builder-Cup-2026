import { useEffect, useState } from 'react'
import { Snackbar } from '@mui/material'
import type { Locale } from '../i18n/locales'
import { useLocale } from '../state/hooks'
import type { AppSide } from './appSide'
import { forgetFarewell, readFarewell, type FarewellReason } from './farewellNote'

const copy: Record<Locale, Record<FarewellReason, string>> = {
  en: {
    'signed-out': 'You are signed out.',
    deleted: 'Your data is deleted. You are signed out.',
    'data-deleted': 'Your data is deleted. You are signed out.',
    'data-deleted-signed-in':
      'Your data is deleted, but sign-out didn’t finish. If you still see your name, sign out from your profile.',
  },
  'zh-Hans': {
    'signed-out': '你已退出登录。',
    deleted: '你的数据已删除，你已退出登录。',
    'data-deleted': '你的数据已删除，你已退出登录。',
    'data-deleted-signed-in':
      '你的数据已删除，但退出登录没有完成。如果仍看到你的名字，请在个人资料中退出登录。',
  },
  ms: {
    'signed-out': 'Anda telah log keluar.',
    deleted: 'Data anda telah dipadam. Anda telah log keluar.',
    'data-deleted': 'Data anda telah dipadam. Anda telah log keluar.',
    'data-deleted-signed-in':
      'Data anda telah dipadam, tetapi log keluar tidak selesai. Jika nama anda masih kelihatan, log keluar dari profil anda.',
  },
  ta: {
    'signed-out': 'நீங்கள் வெளியேறிவிட்டீர்கள்.',
    deleted: 'உங்கள் தரவு நீக்கப்பட்டது. நீங்கள் வெளியேறிவிட்டீர்கள்.',
    'data-deleted': 'உங்கள் தரவு நீக்கப்பட்டது. நீங்கள் வெளியேறிவிட்டீர்கள்.',
    'data-deleted-signed-in':
      'உங்கள் தரவு நீக்கப்பட்டது, ஆனால் வெளியேறுவது முடியவில்லை. உங்கள் பெயர் இன்னும் தெரிந்தால், உங்கள் சுயவிவரத்திலிருந்து வெளியேறுங்கள்.',
  },
  ja: {
    'signed-out': 'ログアウトしました。',
    deleted: 'データを削除し、ログアウトしました。',
    'data-deleted': 'データを削除し、ログアウトしました。',
    'data-deleted-signed-in':
      'データは削除しましたが、ログアウトが完了していません。名前がまだ表示される場合は、プロフィールからログアウトしてください。',
  },
  ko: {
    'signed-out': '로그아웃했어요.',
    deleted: '데이터를 삭제하고 로그아웃했어요.',
    'data-deleted': '데이터를 삭제하고 로그아웃했어요.',
    'data-deleted-signed-in':
      '데이터는 삭제했지만 로그아웃이 끝나지 않았어요. 이름이 아직 보이면 프로필에서 로그아웃하세요.',
  },
  id: {
    'signed-out': 'Anda sudah keluar.',
    deleted: 'Data Anda dihapus. Anda sudah keluar.',
    'data-deleted': 'Data Anda dihapus. Anda sudah keluar.',
    'data-deleted-signed-in':
      'Data Anda dihapus, tetapi proses keluar belum selesai. Jika nama Anda masih terlihat, keluar dari profil Anda.',
  },
  th: {
    'signed-out': 'ออกจากระบบแล้ว',
    deleted: 'ลบข้อมูลของคุณแล้ว และออกจากระบบแล้ว',
    'data-deleted': 'ลบข้อมูลของคุณแล้ว และออกจากระบบแล้ว',
    'data-deleted-signed-in':
      'ลบข้อมูลของคุณแล้ว แต่ออกจากระบบไม่สำเร็จ หากยังเห็นชื่อของคุณ ให้ออกจากระบบจากโปรไฟล์',
  },
  vi: {
    'signed-out': 'Bạn đã đăng xuất.',
    deleted: 'Đã xóa dữ liệu của bạn. Bạn đã đăng xuất.',
    'data-deleted': 'Đã xóa dữ liệu của bạn. Bạn đã đăng xuất.',
    'data-deleted-signed-in':
      'Đã xóa dữ liệu của bạn, nhưng chưa đăng xuất xong. Nếu vẫn thấy tên mình, hãy đăng xuất trong hồ sơ.',
  },
  fil: {
    'signed-out': 'Naka-sign out ka na.',
    deleted: 'Nabura na ang iyong data. Naka-sign out ka na.',
    'data-deleted': 'Nabura na ang iyong data. Naka-sign out ka na.',
    'data-deleted-signed-in':
      'Nabura na ang iyong data, pero hindi natapos ang pag-sign out. Kung nakikita mo pa ang pangalan mo, mag-sign out sa iyong profile.',
  },
  hi: {
    'signed-out': 'आप साइन आउट हो गए हैं।',
    deleted: 'आपका डेटा मिटा दिया गया। आप साइन आउट हो गए हैं।',
    'data-deleted': 'आपका डेटा मिटा दिया गया। आप साइन आउट हो गए हैं।',
    'data-deleted-signed-in':
      'आपका डेटा मिटा दिया गया, पर साइन आउट पूरा नहीं हुआ। अगर आपका नाम अब भी दिखे, तो अपनी प्रोफ़ाइल से साइन आउट करें।',
  },
  bn: {
    'signed-out': 'আপনি সাইন আউট হয়েছেন।',
    deleted: 'আপনার ডেটা মুছে ফেলা হয়েছে। আপনি সাইন আউট হয়েছেন।',
    'data-deleted': 'আপনার ডেটা মুছে ফেলা হয়েছে। আপনি সাইন আউট হয়েছেন।',
    'data-deleted-signed-in':
      'আপনার ডেটা মুছে ফেলা হয়েছে, কিন্তু সাইন আউট শেষ হয়নি। আপনার নাম এখনও দেখা গেলে, প্রোফাইল থেকে সাইন আউট করুন।',
  },
  te: {
    'signed-out': 'మీరు సైన్ అవుట్ అయ్యారు.',
    deleted: 'మీ డేటా తొలగించబడింది. మీరు సైన్ అవుట్ అయ్యారు.',
    'data-deleted': 'మీ డేటా తొలగించబడింది. మీరు సైన్ అవుట్ అయ్యారు.',
    'data-deleted-signed-in':
      'మీ డేటా తొలగించబడింది, కానీ సైన్ అవుట్ పూర్తి కాలేదు. మీ పేరు ఇంకా కనిపిస్తే, మీ ప్రొఫైల్ నుండి సైన్ అవుట్ చేయండి.',
  },
  mr: {
    'signed-out': 'तुम्ही साइन आउट झाला आहात.',
    deleted: 'तुमचा डेटा हटवला. तुम्ही साइन आउट झाला आहात.',
    'data-deleted': 'तुमचा डेटा हटवला. तुम्ही साइन आउट झाला आहात.',
    'data-deleted-signed-in':
      'तुमचा डेटा हटवला, पण साइन आउट पूर्ण झाले नाही. तुमचे नाव अजून दिसत असल्यास, तुमच्या प्रोफाइलमधून साइन आउट करा.',
  },
  kn: {
    'signed-out': 'ನೀವು ಸೈನ್ ಔಟ್ ಆಗಿದ್ದೀರಿ.',
    deleted: 'ನಿಮ್ಮ ಡೇಟಾ ಅಳಿಸಲಾಗಿದೆ. ನೀವು ಸೈನ್ ಔಟ್ ಆಗಿದ್ದೀರಿ.',
    'data-deleted': 'ನಿಮ್ಮ ಡೇಟಾ ಅಳಿಸಲಾಗಿದೆ. ನೀವು ಸೈನ್ ಔಟ್ ಆಗಿದ್ದೀರಿ.',
    'data-deleted-signed-in':
      'ನಿಮ್ಮ ಡೇಟಾ ಅಳಿಸಲಾಗಿದೆ, ಆದರೆ ಸೈನ್ ಔಟ್ ಪೂರ್ಣಗೊಂಡಿಲ್ಲ. ನಿಮ್ಮ ಹೆಸರು ಇನ್ನೂ ಕಾಣಿಸಿದರೆ, ನಿಮ್ಮ ಪ್ರೊಫೈಲ್‌ನಿಂದ ಸೈನ್ ಔಟ್ ಮಾಡಿ.',
  },
}

/** The front door's one-line confirmation after sign-out, account or data deletion. */
export function Farewell({ side }: { side: AppSide }) {
  const [reason] = useState(() => readFarewell(side))
  const [open, setOpen] = useState(Boolean(reason))
  const t = copy[useLocale()]
  // Removed only once shown: a render that suspends must not lose it.
  useEffect(() => forgetFarewell(side), [side])
  return (
    <Snackbar
      open={open}
      message={reason ? t[reason] : ''}
      // The unfinished sign-out asks for an action: long enough to read and act on.
      autoHideDuration={reason === 'data-deleted-signed-in' ? 12000 : 5000}
      onClose={(_, why) => {
        if (why !== 'clickaway') setOpen(false)
      }}
      // Under the top bar: at the bottom it covered the docked Ask box and the tab bar on phones.
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      sx={{ top: { xs: 'calc(72px + env(safe-area-inset-top))', sm: 80 } }}
      slotProps={{ content: { role: 'status' } }}
    />
  )
}
