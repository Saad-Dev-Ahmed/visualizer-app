import type { Metadata } from "next";
import { Poppins, Libre_Baskerville, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toast";

const fontSans = Poppins({
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
  variable: "--font-sans",
});

const fontSerif = Libre_Baskerville({
  subsets: ["latin"],
  variable: "--font-serif",
});

const fontMono = IBM_Plex_Mono({
  weight: ["100", "200", "300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Daltex Resin Bound Visualizer",
  description:
    "See any DALTEX resin bound blend laid on your own driveway, patio or path before you order.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn(`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable} antialiased`)}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider delay={200}>
          <Toaster>{children}</Toaster>
        </TooltipProvider>
      </body>
    </html>
  );
}
