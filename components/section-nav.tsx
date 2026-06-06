'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { signOut } from 'next-auth/react';
import { LogOut, Package, Headphones, ChevronDown, Settings, ShieldCheck } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface SectionNavProps {
  userEmail?: string | null;
  userName?: string | null;
  userImage?: string | null;
  /** Admins see the Onboarding section + the Settings menu link. */
  isAdmin?: boolean;
}

type Section = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Hidden from non-admins. */
  adminOnly?: boolean;
};

const SECTIONS: Section[] = [
  {
    href: '/customer-service',
    label: 'Customer Service',
    icon: <Headphones className="w-3.5 h-3.5" />,
  },
  {
    href: '/onboarding',
    label: 'Onboarding',
    icon: <Package className="w-3.5 h-3.5" />,
    adminOnly: true,
  },
];

export function SectionNav({ userEmail, userName, userImage, isAdmin = false }: SectionNavProps) {
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const initials = userName
    ? userName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : userEmail?.[0]?.toUpperCase() ?? '?';

  const visibleSections = SECTIONS.filter(s => !s.adminOnly || isAdmin);

  return (
    <nav
      className="flex-shrink-0 flex items-center justify-between px-4 border-b border-white/10 z-50"
      style={{ height: 48, background: 'var(--brand-navy)' }}
    >
      {/* Left — logo + app name */}
      <div className="flex items-center gap-3">
        <Image
          src="/shipbots-icon.png"
          alt="ShipBots"
          width={26}
          height={26}
          className="rounded-sm flex-shrink-0"
        />
        <span className="text-white font-semibold text-sm tracking-wide hidden sm:block">
          ShipBots
        </span>
        {/* Divider */}
        <span className="hidden sm:block w-px h-4 bg-white/20" />
        {/* Section tabs */}
        <div className="flex items-center gap-0.5">
          {visibleSections.map(section => {
            const active = pathname.startsWith(section.href);
            return (
              <Link
                key={section.href}
                href={section.href}
                className={[
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors select-none',
                  active
                    ? 'bg-white/15 text-white'
                    : 'text-white/60 hover:text-white/90 hover:bg-white/10',
                ].join(' ')}
              >
                {section.icon}
                {section.label}
                {section.adminOnly && (
                  <span
                    title="Admin-only section"
                    className="ml-0.5 text-[9px] font-semibold uppercase tracking-wider bg-white/10 text-white/40 px-1 py-0.5 rounded inline-flex items-center gap-0.5"
                  >
                    <ShieldCheck className="w-2.5 h-2.5" />
                    Admin
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Right — user menu */}
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setUserMenuOpen(o => !o)}
          className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/10 transition-colors"
        >
          {userImage ? (
            <Image src={userImage} alt={userName ?? ''} width={26} height={26} className="rounded-full" />
          ) : (
            <div className="w-[26px] h-[26px] rounded-full bg-[#43c7ff] flex items-center justify-center text-[#015280] text-xs font-bold flex-shrink-0">
              {initials}
            </div>
          )}
          <span className="text-white/80 text-xs hidden md:block max-w-[140px] truncate">
            {userName ?? userEmail}
          </span>
          <ChevronDown className="w-3 h-3 text-white/50 flex-shrink-0" />
        </button>

        {userMenuOpen && (
          <div className="absolute right-0 top-full mt-1 w-60 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50">
            <div className="px-3 py-2.5 border-b border-gray-100">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold text-gray-800 truncate flex-1">{userName}</p>
                {isAdmin && (
                  <span
                    title="Admin role"
                    className="text-[9px] font-semibold uppercase tracking-wider bg-[#e6f8ff] text-[#015280] px-1 py-0.5 rounded inline-flex items-center gap-0.5"
                  >
                    <ShieldCheck className="w-2.5 h-2.5" />
                    Admin
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-400 truncate">{userEmail}</p>
            </div>
            {isAdmin && (
              <Link
                href="/settings"
                onClick={() => setUserMenuOpen(false)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100"
              >
                <Settings className="w-3.5 h-3.5 text-gray-400" />
                Settings
              </Link>
            )}
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
