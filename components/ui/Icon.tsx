import { cn } from "@/lib/utils";

/**
 * Professionele line-iconen (Lucide-stijl, 24x24, stroke 2).
 * Gebruik: <Icon name="clock" className="h-5 w-5" />
 * Vervangt de emoji's in de UI voor een zakelijke uitstraling.
 */
export type IconName =
  | "clock"
  | "wallet"
  | "users"
  | "user"
  | "inbox"
  | "chat"
  | "invoice"
  | "receipt"
  | "chart"
  | "trend"
  | "car"
  | "folder"
  | "check"
  | "check-circle"
  | "x-circle"
  | "calendar"
  | "sun"
  | "thermometer"
  | "heart"
  | "euro"
  | "send"
  | "mail"
  | "alert"
  | "star"
  | "zap"
  | "shield"
  | "download"
  | "trash"
  | "plus"
  | "search"
  | "briefcase"
  | "timer"
  | "settings"
  | "building"
  | "phone"
  | "lock"
  | "piggy-bank"
  | "hourglass"
  | "monitor";

const PATHS: Record<IconName, React.ReactNode> = {
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></>),
  wallet: (<><path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" /><path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2z" /><circle cx="16.5" cy="14.5" r="1" /></>),
  users: (<><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.5a3 3 0 0 1 0 5.8" /><path d="M20.5 20a5.5 5.5 0 0 0-4-5.3" /></>),
  user: (<><circle cx="12" cy="8" r="3.5" /><path d="M5 20.5a7 7 0 0 1 14 0" /></>),
  inbox: (<><path d="M3 13l3-8h12l3 8" /><path d="M3 13v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" /><path d="M3 13h5a4 4 0 0 0 8 0h5" /></>),
  chat: (<><path d="M21 12a8 8 0 0 1-11.6 7.2L4 21l1.8-5.4A8 8 0 1 1 21 12z" /></>),
  invoice: (<><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M9.5 13h5M9.5 17h5" /></>),
  receipt: (<><path d="M6 2h12v20l-2-1.5L14 22l-2-1.5L10 22l-2-1.5L6 22z" /><path d="M9 7h6M9 11h6M9 15h4" /></>),
  chart: (<><path d="M4 20V6M4 20h16" /><rect x="7.5" y="11" width="3" height="6" rx="0.5" /><rect x="12.5" y="8" width="3" height="9" rx="0.5" /><rect x="17.5" y="13" width="3" height="4" rx="0.5" /></>),
  trend: (<><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>),
  car: (<><path d="M5 13l1.6-4.5a2 2 0 0 1 1.9-1.3h7a2 2 0 0 1 1.9 1.3L19 13" /><path d="M4 13h16v4H4z" /><circle cx="7.5" cy="17.5" r="1.4" /><circle cx="16.5" cy="17.5" r="1.4" /></>),
  folder: (<><path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /></>),
  check: (<path d="M5 12.5l4.5 4.5L19 7.5" />),
  "check-circle": (<><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>),
  "x-circle": (<><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5l5 5M14.5 9.5l-5 5" /></>),
  calendar: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>),
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>),
  thermometer: (<><path d="M10 4a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z" /><path d="M12 9v5" /></>),
  heart: (<path d="M12 20s-7-4.6-9-9a4.8 4.8 0 0 1 9-2.5A4.8 4.8 0 0 1 21 11c-2 4.4-9 9-9 9z" />),
  euro: (<><path d="M18 6.5A7 7 0 1 0 18 17.5" /><path d="M4.5 10.5h8M4.5 13.5h8" /></>),
  send: (<><path d="M21 3L10 14" /><path d="M21 3l-7 18-3.5-7.5L3 10z" /></>),
  mail: (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>),
  alert: (<><path d="M12 3l10 17H2z" /><path d="M12 10v4M12 17.5v.5" /></>),
  star: (<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9z" />),
  zap: (<path d="M13 2L4 14h7l-1 8 9-12h-7z" />),
  shield: (<path d="M12 3l8 3v5c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" />),
  download: (<><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 19h16" /></>),
  trash: (<><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" /></>),
  plus: (<path d="M12 5v14M5 12h14" />),
  search: (<><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>),
  briefcase: (<><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /><path d="M3 13h18" /></>),
  timer: (<><circle cx="12" cy="13" r="7" /><path d="M12 10v3.5l2.2 1.5" /><path d="M10 2.5h4" /></>),
  settings: (<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>),
  building: (<><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /><path d="M10 21v-3h4v3" /></>),
  phone: (<path d="M5 4h4l1.5 4.5L8 10a12 12 0 0 0 6 6l1.5-2.5L20 15v4a1.5 1.5 0 0 1-1.7 1.5A16.5 16.5 0 0 1 3.5 5.7 1.5 1.5 0 0 1 5 4z" />),
  lock: (<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>),
  "piggy-bank": (<><path d="M5 11a7 6.5 0 0 1 13.4-2.2c1 .3 1.6.6 2.1 1.2l-1 2v3.5l-2 .6a7 7 0 0 1-1.7 2.4V21h-2.5v-1.5h-3.6V21H7.2v-2.6A6.5 6.5 0 0 1 5 13.5" /><circle cx="15.5" cy="11" r=".6" /><path d="M9.5 8.5a5.5 5.5 0 0 1 4 0" /></>),
  hourglass: (<><path d="M6 3h12" /><path d="M6 21h12" /><path d="M7 3v3.5L12 12l5-5.5V3" /><path d="M7 21v-3.5L12 12l5 5.5V21" /></>),
  monitor: (<><rect x="2.5" y="4" width="19" height="13" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></>),
};

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
