type SocialLink = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

const links: SocialLink[] = [
  {
    label: "Instagram",
    href: "https://instagram.com",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="17.2" cy="6.8" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    label: "YouTube",
    href: "https://youtube.com",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
        <rect x="2.5" y="5.5" width="19" height="13" rx="4" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10.5 9.5L14.8 12L10.5 14.5V9.5Z" fill="currentColor" />
      </svg>
    ),
  },
  {
    label: "Spotify",
    href: "https://spotify.com",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
        <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M7 10.2C10 9.2 15 9.4 17.3 11.4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <path
          d="M7.6 13.2C10 12.4 14 12.5 16 14"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <path
          d="M8.2 16C10 15.4 13 15.5 14.7 16.6"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

export default function SocialLinks() {
  return (
    <div className="glass-chip flex items-center gap-1 rounded-pill px-2 py-2">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={link.label}
          className="flex h-8 w-8 items-center justify-center rounded-full text-amber-100/80 transition-colors duration-200 hover:bg-amber-100/10 hover:text-amber-100"
        >
          {link.icon}
        </a>
      ))}
    </div>
  );
}
