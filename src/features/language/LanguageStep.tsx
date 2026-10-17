import { useEffect, useRef, useState } from 'react'
import { Box, Button, FormControlLabel, Radio, RadioGroup, Stack, Typography } from '@mui/material'
import { LOCALE_NAMES, LOCALES } from '../../i18n/locales'
import type { Locale } from '../../i18n/locales'
import { loadScriptFont } from '../../i18n/fonts'
import { languageChoices, regionAt, shopRegion } from '../../region/region'
import { usePreferencesDispatch } from '../../state/hooks'

const COPY: Record<Locale, [title: string, hint: string, go: string, more: string]> = {
  en: [
    'Choose your language',
    'You can change it later in settings.',
    'Continue',
    'More languages',
  ],
  'zh-Hans': ['选择语言', '以后可以在设置中更改。', '继续', '更多语言'],
  ms: [
    'Pilih bahasa anda',
    'Anda boleh menukarnya kemudian dalam tetapan.',
    'Teruskan',
    'Lagi bahasa',
  ],
  ta: [
    'உங்கள் மொழியைத் தேர்ந்தெடுங்கள்',
    'பின்னர் அமைப்புகளில் மாற்றலாம்.',
    'தொடர்க',
    'மேலும் மொழிகள்',
  ],
  ja: ['言語を選んでください', 'あとで設定から変更できます。', '続ける', 'ほかの言語'],
  ko: ['언어를 선택하세요', '나중에 설정에서 바꿀 수 있어요.', '계속', '다른 언어'],
  id: ['Pilih bahasa Anda', 'Anda bisa mengubahnya nanti di pengaturan.', 'Lanjut', 'Bahasa lain'],
  th: ['เลือกภาษาของคุณ', 'เปลี่ยนได้ภายหลังในการตั้งค่า', 'ดำเนินการต่อ', 'ภาษาอื่น'],
  vi: ['Chọn ngôn ngữ', 'Bạn có thể đổi sau trong phần cài đặt.', 'Tiếp tục', 'Ngôn ngữ khác'],
  fil: [
    'Piliin ang iyong wika',
    'Mapapalitan mo ito mamaya sa mga setting.',
    'Magpatuloy',
    'Iba pang wika',
  ],
  hi: ['अपनी भाषा चुनें', 'आप इसे बाद में सेटिंग में बदल सकते हैं।', 'जारी रखें', 'और भाषाएँ'],
  bn: ['আপনার ভাষা বাছুন', 'পরে সেটিংসে বদলাতে পারবেন।', 'চালিয়ে যান', 'আরও ভাষা'],
  te: [
    'మీ భాషను ఎంచుకోండి',
    'తర్వాత సెట్టింగ్స్‌లో మార్చుకోవచ్చు.',
    'కొనసాగించండి',
    'మరిన్ని భాషలు',
  ],
  mr: ['तुमची भाषा निवडा', 'तुम्ही नंतर सेटिंग्जमध्ये बदलू शकता.', 'पुढे चला', 'आणखी भाषा'],
  kn: [
    'ನಿಮ್ಮ ಭಾಷೆಯನ್ನು ಆರಿಸಿ',
    'ನಂತರ ಸೆಟ್ಟಿಂಗ್ಸ್‌ನಲ್ಲಿ ಬದಲಾಯಿಸಬಹುದು.',
    'ಮುಂದುವರಿಸಿ',
    'ಇನ್ನಷ್ಟು ಭಾಷೆಗಳು',
  ],
}

type Place = {
  lat?: number | null
  lng?: number | null
  timezone?: string | null
  currency?: string | null
}

/**
 * "Choose your language", right after sign-in (owner and customer). The best guess comes first
 * and is selected: the phone's language when the region speaks it, else the area's language
 * (Bengaluru → Kannada), else the region's (India → Hindi, Singapore → English). One tap on
 * Continue confirms it; the choice is the app's single language preference (voice reads it too).
 */
export function LanguageStep({
  place,
  shop,
  inDialog,
}: {
  place?: Place | null
  shop?: boolean
  /** Shown over a page (customer app) rather than as the page. */
  inDialog?: boolean
}) {
  const dispatch = usePreferencesDispatch()
  const region = shop ? shopRegion(place) : regionAt(place?.lat, place?.lng)
  const { suggested, offered } = languageChoices(region, place)
  const [selected, setSelected] = useState<Locale>(suggested)
  const [more, setMore] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const [title, hint, go, moreLabel] = COPY[selected]
  const shown = more ? [...offered, ...LOCALES.filter((code) => !offered.includes(code))] : offered
  useEffect(() => {
    heading.current?.focus()
  }, [])
  useEffect(() => {
    void loadScriptFont(selected)
  }, [selected])
  return (
    <Box
      component={inDialog ? 'div' : 'main'}
      lang={selected}
      sx={{
        minHeight: '100dvh',
        maxWidth: 520,
        mx: 'auto',
        px: 4,
        pt: 'max(48px, env(safe-area-inset-top))',
        pb: 'max(32px, env(safe-area-inset-bottom))',
        bgcolor: 'background.default',
      }}
    >
      <Stack spacing={4}>
        <Typography variant="titleLarge" translate="no">
          Chalkboard
        </Typography>
        <Typography
          id="language-step-title"
          component="h1"
          variant="headlineMedium"
          tabIndex={-1}
          ref={heading}
          sx={{ overflowWrap: 'anywhere' }}
        >
          {title}
        </Typography>
        <Typography variant="bodyLarge" color="text.secondary">
          {hint}
        </Typography>
        <RadioGroup
          aria-labelledby="language-step-title"
          value={selected}
          onChange={(_, value) => {
            const found = LOCALES.find((code) => code === value)
            if (found) setSelected(found)
          }}
        >
          {shown.map((code) => (
            <FormControlLabel
              key={code}
              value={code}
              control={<Radio />}
              label={
                <span lang={code} translate="no">
                  {LOCALE_NAMES[code]}
                </span>
              }
              sx={{ minHeight: 48, m: 0 }}
            />
          ))}
        </RadioGroup>
        {!more && (
          <Button sx={{ alignSelf: 'flex-start' }} onClick={() => setMore(true)}>
            {moreLabel}
          </Button>
        )}
        <Button
          variant="contained"
          size="large"
          onClick={() => dispatch({ type: 'language', language: selected })}
        >
          {go}
        </Button>
      </Stack>
    </Box>
  )
}
