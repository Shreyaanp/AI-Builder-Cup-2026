import { IconButton, Tooltip, useTheme } from '@mui/material'
import { Moon, Sun } from 'lucide-react'
import type { Locale } from '../../i18n/locales'
import { useLocale, usePreferencesDispatch } from '../../state/hooks'

const labels: Record<Locale, { light: string; dark: string }> = {
  en: { light: 'Switch to light mode', dark: 'Switch to dark mode' },
  'zh-Hans': { light: '切换到浅色模式', dark: '切换到深色模式' },
  ms: { light: 'Tukar ke mod cerah', dark: 'Tukar ke mod gelap' },
  ta: { light: 'ஒளி பயன்முறைக்கு மாற்று', dark: 'இருள் பயன்முறைக்கு மாற்று' },
  ja: { light: 'ライトモードに切り替え', dark: 'ダークモードに切り替え' },
  ko: { light: '라이트 모드로 전환', dark: '다크 모드로 전환' },
  id: { light: 'Beralih ke mode terang', dark: 'Beralih ke mode gelap' },
  th: { light: 'เปลี่ยนเป็นโหมดสว่าง', dark: 'เปลี่ยนเป็นโหมดมืด' },
  vi: { light: 'Chuyển sang chế độ sáng', dark: 'Chuyển sang chế độ tối' },
  fil: { light: 'Lumipat sa light mode', dark: 'Lumipat sa dark mode' },
}

/** Customer pages: one tap between light and dark (remembered with the other preferences). */
export function AppearanceToggle() {
  const dark = useTheme().palette.mode === 'dark'
  const dispatch = usePreferencesDispatch()
  const t = labels[useLocale()] ?? labels.en
  const label = dark ? t.light : t.dark
  return (
    <Tooltip title={label}>
      <IconButton
        aria-label={label}
        onClick={() => dispatch({ type: 'appearance', appearance: dark ? 'light' : 'dark' })}
        sx={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
          right: 'calc(env(safe-area-inset-right, 0px) + 8px)',
          zIndex: 1200,
          width: 44,
          height: 44,
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
          '&:hover': { bgcolor: 'background.paper' },
        }}
      >
        {dark ? <Sun size={20} /> : <Moon size={20} />}
      </IconButton>
    </Tooltip>
  )
}
