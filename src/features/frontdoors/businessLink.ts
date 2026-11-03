import { usePreferences } from '../../state/hooks'

const businessOrigin = 'https://business.chalkboard.shreyaan.work'

/**
 * Links from the public site to the business app. A language picked on the public site rides
 * along as ?lang=, so it stays when the person moves over (OB-270). "Phone setting" adds
 * nothing: the business app reads the same phone.
 */
export function useBusinessLink(): (path?: string) => string {
  const { language } = usePreferences()
  return (path = '') => `${businessOrigin}${path}${language === 'system' ? '' : `?lang=${language}`}`
}
