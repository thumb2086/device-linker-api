import { Outlet, Link } from 'react-router-dom';

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-slate-800 text-white p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">Device Linker</h1>
        <nav className="space-x-4">
          <Link to="/app" className="hover:text-slate-300">Lobby</Link>
          <Link to="/app/wallet" className="hover:text-slate-300">Wallet</Link>
          <Link to="/app/market" className="hover:text-slate-300">Market</Link>
          <Link to="/app/rewards" className="hover:text-slate-300">Rewards</Link>
          <Link to="/app/admin" className="hover:text-slate-300">Admin</Link>
        </nav>
      </header>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
      <footer className="bg-slate-100 p-4 text-center text-sm text-slate-500">
        &copy; 2024 Device Linker Monolith
      </footer>
    </div>
  );
}
