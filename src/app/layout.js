import { Geist, Geist_Mono } from "next/font/google";
import { ReactFlowProvider } from '@xyflow/react';
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Graph Image Editor",
  description: "Interactive node-graph editor for image editing",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ReactFlowProvider>
          {children}
        </ReactFlowProvider>
      </body>
    </html>
  );
}
