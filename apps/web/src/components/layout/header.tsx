'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { Menu, X, Search, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';

const links = [
  { href: '/discover', label: 'Discover' },
  { href: '#films', label: 'Films' },
  { href: '#collections', label: 'Collections' },
];

export function Header({
  context = 'home',
}: {
  context?: 'home' | 'search' | 'discover';
}) {
  const searchPage = context === 'search';
  const secondary = context !== 'home';
  const home = secondary ? '/' : '';
  const destination = (href: string) =>
    href.startsWith('/') ? href : home + href;
  return (
    <header className={`site-header${secondary ? ' site-header-page' : ''}`}>
      <div className="header-inner container-shell">
        <a href={`${home}#discover`} aria-label="FRAME home" className="brand">
          FRAME<span>.</span>
        </a>
        <nav aria-label="Main navigation" className="desktop-nav">
          {links.map((link) => (
            <a
              className={`nav-link ${context === 'discover' && link.href === '/discover' ? 'nav-current' : ''}`}
              key={link.href}
              aria-current={
                context === 'discover' && link.href === '/discover'
                  ? 'page'
                  : undefined
              }
              href={destination(link.href)}
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="header-actions">
          <Button
            variant="header"
            size="icon"
            className={searchPage ? 'text-primary' : undefined}
            asChild
          >
            <a
              href="/search"
              aria-label="Search"
              aria-current={searchPage ? 'page' : undefined}
            >
              <Search aria-hidden="true" />
            </a>
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
                      <a
                        className="py-2 text-xl"
                        href={destination(link.href)}
                        aria-current={
                          context === 'discover' && link.href === '/discover'
                            ? 'page'
                            : undefined
                        }
                      >
                        {link.label}
                      </a>
                    </Dialog.Close>
                  ))}
                  <Dialog.Close asChild>
                    <a
                      className="py-2 text-xl"
                      href="/search"
                      aria-current={searchPage ? 'page' : undefined}
                    >
                      Search
                    </a>
                  </Dialog.Close>
                </nav>
                <p className="mobile-account-note">
                  Accounts are not available yet.
                </p>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </header>
  );
}
