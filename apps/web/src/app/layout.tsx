import type { Metadata } from 'next';
import '@fontsource-variable/inter';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './globals.css';
export const metadata: Metadata = {
  title: 'FRAME — A new perspective on cinema',
  description:
    'Discover extraordinary open films. A curated perspective on cinema, from FRAME.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
