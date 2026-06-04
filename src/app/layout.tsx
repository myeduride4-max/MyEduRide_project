import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'MyEduRide - Gate Manager',
  description: 'School gate management system with facial recognition',
  icons: {
    icon: 'https://www.image2url.com/r2/default/images/1779230378321-292c7b74-6217-41ff-832a-180a535ea4cb.png',
    apple: 'https://www.image2url.com/r2/default/images/1779230378321-292c7b74-6217-41ff-832a-180a535ea4cb.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 antialiased">
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
