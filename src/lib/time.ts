import { getLang } from './i18n'

/** "3 minutes ago", "2 hours ago", or a date for anything older than a day. */
export const timeAgo = (iso: string) => {
  const lang = getLang()
  const diffMinutes = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000))
  if (diffMinutes < 60) {
    return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(-diffMinutes, 'minute')
  }
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) {
    return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(-diffHours, 'hour')
  }
  return new Date(iso).toLocaleDateString(lang === 'vi' ? 'vi-VN' : undefined)
}
