import React, { useState, useEffect } from 'react';
import { UserProfile, CreditRequest, UserRole } from '../types';
import { api } from '../services/api';
import { Check, X, LogOut, Shield } from 'lucide-react';

interface SuperAdminDashboardProps {
  onLogout: () => void;
}

const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ onLogout }) => {
  const [requests, setRequests] = useState<CreditRequest[]>([]);
  const [admins, setAdmins] = useState<UserProfile[]>([]);

  useEffect(() => {
    refreshData();
  }, []);

  const refreshData = async () => {
    try {
        setRequests(await api.getCreditRequests(UserRole.SUPER_ADMIN));
        setAdmins(await api.getAllAdmins());
    } catch (e) {
        console.error(e);
    }
  };

  const handleProcess = async (req: CreditRequest, status: 'approved' | 'rejected') => {
      await api.processCreditRequest(req.id, status);
      refreshData();
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
                <Shield className="text-blue-500" /> Super Admin Panel
            </h1>
          </div>
          <button onClick={onLogout} className="px-4 py-2 bg-slate-800 rounded hover:bg-slate-700 flex items-center gap-2">
            <LogOut size={16} /> Logout
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Credit Requests */}
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <h2 className="text-xl font-bold mb-4">Pending Credit Requests</h2>
            <div className="space-y-4">
              {requests.length === 0 && <p className="text-slate-500 italic">No pending requests.</p>}
              {requests.map(req => (
                <div key={req.id} className="bg-slate-700/50 p-4 rounded-lg flex justify-between items-center">
                  <div>
                    <div className="font-semibold">{req.admin_name}</div>
                    <div className="text-sm text-slate-400">Req: ₹{req.amount}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleProcess(req, 'rejected')} className="p-2 bg-red-900/50 text-red-400 rounded hover:bg-red-900"><X size={18} /></button>
                    <button onClick={() => handleProcess(req, 'approved')} className="p-2 bg-green-900/50 text-green-400 rounded hover:bg-green-900"><Check size={18} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Admin List */}
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <h2 className="text-xl font-bold mb-4">Active Organizations</h2>
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
              {admins.map(admin => (
                <div key={admin.id} className="border-b border-slate-700 pb-4 last:border-0">
                  <div className="flex justify-between items-start">
                    <div>
                        <div className="font-semibold text-lg">{admin.company_details?.name || admin.name}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-bold text-blue-400">{admin.credits || 0}</div>
                        <div className="text-xs text-slate-500 uppercase">Credits</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;