import type { Metadata, Viewport } from "next";
import { Archivo, Big_Shoulders, Newsreader } from "next/font/google";
import "./globals.css";

const display = Big_Shoulders({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-big-shoulders",
});
const serif = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
});
const label = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-archivo",
});

export const metadata: Metadata = {
  title: "Headliner — route the tour your fans already want",
  description: "A tour-routing agent built on Qloo's taste graph: fan heatmaps, routed cities, openers and booking pitches.",
};

export const viewport: Viewport = {
  themeColor: "#f2ebdc",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${serif.variable} ${label.variable}`}>
      <body>{children}</body>
    </html>
  );
}
