import type { Metadata } from "next";
import "./globals.css";
import DashboardLayout from "./components/DashboardLayout";

export const metadata: Metadata = {
  title: "GarminSights - Analytics Dashboard",
  description: "Comprehensive fitness and health data analytics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-gray-50 dark:bg-gray-900 antialiased">
        <DashboardLayout>
          {children}
        </DashboardLayout>
      </body>
    </html>
  );
}

