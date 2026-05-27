import Link from 'next/link';

export default function PricingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Cennik</h1>
        <Link href="/#pricing" className="text-blue-600 hover:underline">
          Sprawdź ceny na stronie głownej
        </Link>
      </div>
    </div>
  );
}
