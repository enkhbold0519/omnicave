/** Thin outline icons in the spirit of the Android app's Ionicons outlines. Drawn here so the app stays offline. */
const PATHS = {
  cellar: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M4 15h16" /><circle cx="8.5" cy="6" r=".9" /><circle cx="12" cy="6" r=".9" /><circle cx="8.5" cy="12" r=".9" /><circle cx="15.5" cy="18" r=".9" /></>,
  inventory: <><path d="M7.5 3h9l.5 4.5a5 5 0 0 1-10 0z" /><path d="M12 12.5V20M8.5 20.5h7" /></>,
  sommelier: <><path d="M10 3.5l1.6 4.4L16 9.5l-4.4 1.6L10 15.5l-1.6-4.4L4 9.5l4.4-1.6z" /><path d="M17.5 13.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" /></>,
  briefing: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  value: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  bell: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  back: <path d="M15 5l-7 7 7 7" />,
  chevron: <path d="M9 5l7 7-7 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
} as const

export type IconName = keyof typeof PATHS

export default function Icon({ name, size = 32 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}
