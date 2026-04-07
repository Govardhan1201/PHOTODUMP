import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'PhotoMind — AI Photo Organizer',
  description: 'Automatically organize your photo collection with AI. Detect faces, cluster people, and sort by category.',
  keywords: ['photo organizer', 'AI photos', 'face detection', 'Google Drive photos'],
  openGraph: {
    title: 'PhotoMind — AI Photo Organizer',
    description: 'Automatically organize your photo collection with AI.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  );
}
