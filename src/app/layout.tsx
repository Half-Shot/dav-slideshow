export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
    return <html lang="en">
        <head />
        <body style={{margin: 0}}>{children}</body>
    </html>;
}
