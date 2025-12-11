import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { LayoutDashboard, Users, CreditCard, Settings, LogOut, Video } from 'lucide-react';

// Import split tabs
import { DashboardTab } from './admin-tabs/DashboardTab';
import { PackersTab } from './admin-tabs/PackersTab';
import { BillingTab } from './admin-tabs/BillingTab';
import { SettingsTab } from './admin-tabs/SettingsTab';

interface AdminDashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

const AdminPanel: React.FC<AdminDashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'packers' | 'billing' | 'settings'>('dashboard');
  
  // --- CRITICAL FIX: AUTO-SWITCH TAB ON OAUTH REDIRECT ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // If Google sends us back with a code, we MUST show the Settings tab immediately
    // otherwise the listener inside SettingsTab will never run.
    if (params.get('code') && params.get('state')) {
      setActiveTab('settings');
    }
  }, []);
  // -------------------------------------------------------

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'packers', label: 'Packers', icon: Users },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col fixed h-full z-10 hidden md:flex">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-2 text-blue-600 font-bold text-xl">
             <Video className="w-8 h-8" /> VideoVerify
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all ${
                activeTab === item.id ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <item.icon size={20} /> {item.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-100">
            <button onClick={onLogout} className="flex items-center gap-2 text-slate-500 hover:text-red-600">
                <LogOut size={18} /> Logout
            </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 md:ml-64 p-4 md:p-8 pt-16 md:pt-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
            {activeTab === 'dashboard' && <DashboardTab user={user} />}
            {activeTab === 'packers' && <PackersTab user={user} />}
            {activeTab === 'billing' && <BillingTab user={user} />}
            {activeTab === 'settings' && <SettingsTab user={user} />}
        </div>
      </main>
    </div>
  );
};

export default AdminPanel;
