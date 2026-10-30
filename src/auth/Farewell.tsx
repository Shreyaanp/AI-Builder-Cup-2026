import { useEffect, useState } from 'react'
import { Snackbar } from '@mui/material'
import type { Locale } from '../i18n/locales'
import { useLocale } from '../state/hooks'
import type { AppSide } from './appSide'
import { forgetFarewell, readFarewell, type FarewellReason } from './farewellNote'

const copy: Record<Locale, Record<FarewellReason, string>> = {
  en: { 'signed-out': 'You are signed out.', deleted: 'Your data is deleted. You are signed out.' },
  'zh-Hans': { 'signed-out': '你已退出登录。', deleted: '你的数据已删除，你已退出登录。' },
  ms: {
    'signed-out': 'Anda telah log keluar.',
    deleted: 'Data anda telah dipadam. Anda telah log keluar.',
  },
  ta: {
    'signed-out': 'நீங்கள் வெளியேறிவிட்டீர்கள்.',
    deleted: 'உங்கள் தரவு நீக்கப்பட்டது. நீங்கள் வெளியேறிவிட்டீர்கள்.',
  },
  ja: {
    'signed-out': 'ログアウトしました。',
    deleted: 'データを削除し、ログアウトしました。',
  },
  ko: { 'signed-out': '로그아웃했어요.', deleted: '데이터를 삭제하고 로그아웃했어요.' },
  id: { 'signed-out': 'Anda sudah keluar.', deleted: 'Data Anda dihapus. Anda sudah keluar.' },
  th: { 'signed-out': 'ออกจากระบบแล้ว', deleted: 'ลบข้อมูลของคุณแล้ว และออกจากระบบแล้ว' },
  vi: { 'signed-out': 'Bạn đã đăng xuất.', deleted: 'Đã xóa dữ liệu của bạn. Bạn đã đăng xuất.' },
  fil: {
    'signed-out': 'Naka-sign out ka na.',
    deleted: 'Nabura na ang iyong data. Naka-sign out ka na.',
  },
  hi: {
    'signed-out': 'आप साइन आउट हो गए हैं।',
    deleted: 'आपका डेटा मिटा दिया गया। आप साइन आउट हो गए हैं।',
  },
  bn: {
    'signed-out': 'আপনি সাইন আউট হয়েছেন।',
    deleted: 'আপনার ডেটা মুছে ফেলা হয়েছে। আপনি সাইন আউট হয়েছেন।',
  },
  te: {
    'signed-out': 'మీరు సైన్ అవుట్ అయ్యారు.',
    deleted: 'మీ డేటా తొలగించబడింది. మీరు సైన్ అవుట్ అయ్యారు.',
  },
  mr: {
    'signed-out': 'तुम्ही साइन आउट झाला आहात.',
    deleted: 'तुमचा डेटा हटवला. तुम्ही साइन आउट झाला आहात.',
  },
  kn: {
    'signed-out': 'ನೀವು ಸೈನ್ ಔಟ್ ಆಗಿದ್ದೀರಿ.',
    deleted: 'ನಿಮ್ಮ ಡೇಟಾ ಅಳಿಸಲಾಗಿದೆ. ನೀವು ಸೈನ್ ಔಟ್ ಆಗಿದ್ದೀರಿ.',
  },
}

/** The front door's one-line confirmation after sign-out or account deletion. */
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
      autoHideDuration={5000}
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
