import { ReactNode, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

interface LayoutProps {
  children: ReactNode
}

const navItems = [
  { path: '/', label: 'Dashboard' },
  { path: '/objects', label: 'Objects' },
  { path: '/images', label: 'Images' },
  { path: '/catalogue', label: 'Catalogue' },
  { path: '/indexer', label: 'Indexer' },
  { path: '/settings', label: 'Settings' },
]

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen">
      <nav className="bg-space-800 border-b border-space-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="flex items-center">
                <span className="text-xl font-bold text-blue-400">Astro</span>
                <span className="text-xl font-bold text-gray-100">DB</span>
              </Link>
              {/* Desktop navigation */}
              <div className="hidden md:flex ml-10 items-baseline space-x-4">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      location.pathname === item.path
                        ? 'bg-space-700 text-white'
                        : 'text-gray-300 hover:bg-space-700 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
            {/* Mobile menu button */}
            <div className="md:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-space-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                aria-expanded={mobileMenuOpen}
              >
                <span className="sr-only">Open main menu</span>
                {mobileMenuOpen ? (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        <div className={`md:hidden ${mobileMenuOpen ? 'block' : 'hidden'}`}>
          <div className="px-2 pt-2 pb-3 space-y-1 border-t border-space-600">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
                  location.pathname === item.path
                    ? 'bg-space-700 text-white'
                    : 'text-gray-300 hover:bg-space-700 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        {children}
      </main>
    </div>
  )
}
