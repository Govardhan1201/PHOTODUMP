import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Vision Obsidian — Stateless AI Face Search',
  description: '100% private, session-only face search and photo organization. Runs entirely in your browser using ONNX AI models.',
  keywords: ['photo organizer', 'AI photos', 'face detection', 'privacy', 'stateless', 'ONNX', 'Vision Obsidian'],
  openGraph: {
    title: 'Vision Obsidian — Stateless AI Face Search',
    description: '100% private, session-only face search. Runs entirely in your browser.',
    type: 'website',
    images: ['/favicon.ico'], // Replace with actual OG image if available
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vision Obsidian',
    description: '100% private, session-only face search. Runs entirely in your browser.',
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>{children}</body>
    </html>
  );
}
