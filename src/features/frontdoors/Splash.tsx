import { useEffect, useState } from 'react'
import { Alert, Box, Button, Typography, useTheme } from '@mui/material'
import type { Locale } from '../../i18n/locales'
import { useLocale } from '../../state/hooks'
import { useFrontCopy } from './strings'
import { BrandLogo } from '../../design/BrandLogo'

const LOAD_TIMEOUT_MS = 15_000
const failedCopy: Record<Locale, { message: string; retry: string }> = {
  en: {
    message: 'Could not load this screen. Check your connection and try again.',
    retry: 'Retry',
  },
  hi: {
    message: 'यह स्क्रीन लोड नहीं हुई। कनेक्शन जाँचें और फिर कोशिश करें।',
    retry: 'फिर कोशिश करें',
  },
  bn: {
    message: 'এই স্ক্রিনটি লোড করা যায়নি। সংযোগ দেখে আবার চেষ্টা করুন।',
    retry: 'আবার চেষ্টা করুন',
  },
  te: {
    message: 'ఈ స్క్రీన్‌ను లోడ్ చేయలేకపోయాం. కనెక్షన్ చూసి మళ్లీ ప్రయత్నించండి.',
    retry: 'మళ్లీ ప్రయత్నించండి',
  },
  mr: {
    message: 'हे पेज लोड करता आले नाही. जोडणी तपासून पुन्हा प्रयत्न करा.',
    retry: 'पुन्हा प्रयत्न करा',
  },
  kn: {
    message: 'ಈ ಪುಟವನ್ನು ಲೋಡ್ ಮಾಡಲು ಆಗಲಿಲ್ಲ. ಸಂಪರ್ಕ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    retry: 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',
  },
  ta: {
    message: 'இந்தப் பக்கத்தை ஏற்ற முடியவில்லை. இணைப்பைச் சரிபார்த்து மீண்டும் முயலுங்கள்.',
    retry: 'மீண்டும் முயலுங்கள்',
  },
  id: {
    message: 'Halaman ini tidak dapat dimuat. Periksa koneksi lalu coba lagi.',
    retry: 'Coba lagi',
  },
  ms: {
    message: 'Halaman ini tidak dapat dimuatkan. Semak sambungan dan cuba lagi.',
    retry: 'Cuba lagi',
  },
  'zh-Hans': { message: '无法加载此页面。请检查网络连接后重试。', retry: '重试' },
  ja: {
    message: '画面を読み込めませんでした。接続を確認して再試行してください。',
    retry: '再試行',
  },
  ko: {
    message: '화면을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.',
    retry: '다시 시도',
  },
  th: { message: 'โหลดหน้านี้ไม่ได้ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง', retry: 'ลองอีกครั้ง' },
  vi: { message: 'Không tải được trang này. Hãy kiểm tra kết nối rồi thử lại.', retry: 'Thử lại' },
  fil: {
    message: 'Hindi ma-load ang screen na ito. Tingnan ang koneksyon at subukan muli.',
    retry: 'Subukan muli',
  },
}

/** A slow app shell becomes a retryable state instead of an endless loading screen. */
export function BrandSplash({
  business = false,
  failed = false,
}: {
  business?: boolean
  failed?: boolean
}) {
  const roles = useTheme().material
  const t = useFrontCopy()
  const locale = useLocale()
  const [timedOut, setTimedOut] = useState(false)
  useEffect(() => {
    if (failed) return
    const timer = window.setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [failed])
  const hasFailed = failed || timedOut
  const error = failedCopy[locale]
  return (
    <Box
      role={hasFailed ? undefined : 'status'}
      data-testid="brand-splash"
      sx={{
        minHeight: '100dvh',
        display: 'grid',
        placeContent: 'center',
        justifyItems: 'center',
        gap: 3,
        bgcolor: roles.surface,
        color: roles.onSurface,
        '@keyframes chalkMark': {
          from: { transform: 'scale(.8) rotate(-8deg)', opacity: 0 },
          to: { transform: 'none', opacity: 1 },
        },
      }}
    >
      {/* The same logo as every header (the tilted chalk tile and the name), not a second mark. */}
      <Box
        sx={{
          animation: 'chalkMark 800ms ease-out both',
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      >
        <BrandLogo name={business ? 'Chalkboard Business' : 'Chalkboard'} />
      </Box>
      {hasFailed ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" onClick={() => location.reload()} sx={{ minHeight: 48 }}>
              {error.retry}
            </Button>
          }
        >
          {error.message}
        </Alert>
      ) : (
        <Typography variant="bodyMedium">{t.loading}</Typography>
      )}
    </Box>
  )
}
