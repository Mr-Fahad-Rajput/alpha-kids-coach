import type { Metadata, Viewport } from "next";
import { Inter, Noto_Nastaliq_Urdu } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "600", "800"],
});

const urdu = Noto_Nastaliq_Urdu({
  variable: "--font-urdu",
  subsets: ["arabic"],
  weight: ["400", "700"],
  preload: false,
});

export const metadata: Metadata = {
  title: "Alpha Kids Coach",
  description:
    "A short, safe parenting plan with a check-in, in English and Urdu.",
};

export const viewport: Viewport = {
  themeColor: "#E2E8F0",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${urdu.variable}`}>
      <body>{children}</body>
    </html>
  );
}
