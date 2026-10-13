import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Personal Finance', description: 'Your money, with a clearer plan.', manifest: '/manifest.webmanifest' };
export const viewport: Viewport = { themeColor: '#143d32' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
