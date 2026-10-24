'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { Menu, X, Search, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';

const links = [
  { href: '#discover', label: 'Discover' },
  { href: '#films', label: 'Films' },
  { href: '#collections', label: 'Collections' },
];

export function Header() {
  return (
    <header className="site-header">
      <div className="header-inner container-shell">
        <a href="#discover" aria-label="FRAME home" className="brand">
          FRAME<span>.</span>
        </a>
        <nav aria-label="Main navigation" className="desktop-nav">
          {links.map((link, index) => (
            <a
              className={`nav-link ${index === 0 ? 'nav-current' : ''}`}
              key={link.href}
              href={link.href}
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="header-actions">
          <Button
            variant="header"
            size="icon"
            disabled
            aria-label="Search — coming soon"
            title="Search is not available yet"
          >
            <Search aria-hidden="true" />
          </Button>
          <Button
            variant="header"
            size="icon"
            className="hidden md:inline-flex"
            disabled
            aria-label="Account — coming soon"
            title="Accounts are not available yet"
          >
            <UserRound aria-hidden="true" />
          </Button>
          <Dialog.Root>
            <Dialog.Trigger asChild>
              <Button
                variant="header"
                size="icon"
                className="md:hidden"
                aria-label="Open navigation"
              >
                <Menu aria-hidden="true" />
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="dialog-overlay" />
              <Dialog.Content className="mobile-dialog">
                <Dialog.Title className="brand">FRAME.</Dialog.Title>
                <Dialog.Description className="mt-3 text-sm text-muted-foreground">
                  Find a different perspective on cinema.
                </Dialog.Description>
                <Dialog.Close asChild>
                  <Button
                    variant="header"
                    size="icon"
                    aria-label="Close navigation"
                    className="dialog-close"
                  >
                    <X aria-hidden="true" />
                  </Button>
                </Dialog.Close>
                <nav
                  aria-label="Mobile navigation"
                  className="mt-12 flex flex-col gap-6"
                >
                  {links.map((link) => (
                    <Dialog.Close key={link.href} asChild>
                      <a className="py-2 text-xl" href={link.href}>
                        {link.label}
                      </a>
                    </Dialog.Close>
                  ))}
                </nav>
                <p className="mobile-account-note">
                  Search and accounts are not available yet.
                </p>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </header>
  );
}
