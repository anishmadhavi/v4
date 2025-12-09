import React, { useState, useEffect } from 'react';
import { UserProfile, UserRole, VideoLog, CreditRequest, IntegrationConfig } from '../types';
import { api } from '../services/api';
import { 
  LayoutDashboard, Users, CreditCard, Settings, LogOut, 
  Plus, Video, Trash2, Key 
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface AdminDashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

const DashboardTab: React.FC<{ user: UserProfile }> = ({ user }) => {
  const [logs, setLogs] = useState<VideoLog[]>([]);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const data = await api.getLogs(user.id, UserRole.ADMIN);
        setLogs(data);
      } catch (e) {
        console.error(e);
      }
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 10000); 
    return () => clearInterval(interval);
  }, [user.id]);

  const stats = {
    total: logs.length,
    failed: logs.filter(l => l.whatsapp_status === 'failed').length,
    creditsUsed: logs.length, 
    pending: logs.filter(l => l.status === 'pending').length
  };

  const chartData = logs.slice(0, 7).reverse().map((log) => ({
    name: new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
    value: 1
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Credits Used</div>
            <div className="text-2xl font-bold text-slate-800">{stats.creditsUsed}</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Failed Notifications</div>
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Available Credits</div>
            <div className="text-2xl font-bold text-blue-600">{user.credits || 0}</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Pending</div>
            <div className="text-2xl font-bold text-orange-500">{stats.pending}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-semibold text-slate-800">Recent Videos</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3">AWB</th>
                  <th className="px-4 py-3">Packer</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.slice(0, 5).map(log => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-700">{log.awb}</td>
                    <td className="px-4 py-3 text-slate-600">{log.packer_name}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(log.created_at).toLocaleTimeString()}</td>
                    <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            log.whatsapp_status === 'sent' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                            {log.whatsapp_status}
                        </span>
                    </td>
                    <td className="px-4 py-3">
                         <a href={log.video_url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-600">
                             <Video size={16} />
                         </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-800 mb-4">Activity Trend</h3>
            <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip />
                        <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={{r: 4}} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
      </div>
    </div>
  );
};

const PackersTab: React.FC<{ user: UserProfile }> = ({ user }) => {
  const [packers, setPackers] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newPacker, setNewPacker] = useState({ name: '', mobile: '', pin: '' });
  const [loading, setLoading] = useState(false);
  
  // State for Edit PIN
  const [editPacker, setEditPacker] = useState<any | null>(null);
  const [newPin, setNewPin] = useState('');

  const fetchPackers = () => {
      api.getPackers(user.id).then(setPackers).catch(console.error);
  };

  useEffect(() => {
    fetchPackers();
  }, [user.id]);

  const handleCreatePacker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPacker.pin.length < 6) {
        alert("PIN must be 6 digits");
        return;
    }
    setLoading(true);
    try {
        await api.createPacker(user.id, newPacker);
        setShowModal(false);
        setNewPacker({ name: '', mobile: '', pin: '' });
        fetchPackers();
        alert('Packer Created Successfully');
    } catch (err: any) {
        alert('Failed to create packer: ' + err.message);
    } finally {
        setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete packer "${name}"? This cannot be undone.`)) {
        try {
            await api.deletePacker(id);
            fetchPackers();
            alert('Packer deleted');
        } catch (e: any) {
            alert('Delete failed: ' + e.message);
        }
    }
  };

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPacker) return;
    if (newPin.length < 6) {
        alert("PIN must be 6 digits");
        return;
    }
    try {
        await api.updatePackerPin(editPacker.id, newPin);
        alert('PIN Updated Successfully');
        setEditPacker(null);
        setNewPin('');
    } catch (e: any) {
        alert('Update failed: ' + e.message);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-slate-800">Team Management</h2>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus size={18} /> Add Packer
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {packers.map(packer => (
          <div key={packer.id} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 relative group">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                    {packer.name.charAt(0)}
                </div>
                <div>
                    <h3 className="font-semibold text-slate-800">{packer.name}</h3>
                    <p className="text-sm text-slate-500">Packer</p>
                </div>
              </div>
              <div className="space-y-2 mt-4">
                <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Mobile</span>
                    <span className="font-medium text-slate-700">{packer.mobile || 'N/A'}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-slate-500">PIN</span>
                    <span className="font-medium text-slate-700 tracking-widest">••••••</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-100">
                  <button 
                      onClick={() => { setEditPacker(packer); setNewPin(''); }}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Change PIN"
                  >
                      <Key size={18} />
                  </button>
                  <button 
                      onClick={() => handleDelete(packer.id, packer.name)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete Packer"
                  >
                      <Trash2 size={18} />
                  </button>
              </div>
          </div>
        ))}
      </div>

      {/* Add Packer Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
                <h3 className="text-lg font-bold mb-4">Add New Packer</h3>
                <form onSubmit={handleCreatePacker} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Full Name</label>
                        <input required type="text" className="w-full border rounded-lg p-2" 
                            value={newPacker.name} onChange={e => setNewPacker({...newPacker, name: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Mobile Number</label>
                        <input required type="text" className="w-full border rounded-lg p-2" 
                            value={newPacker.mobile} onChange={e => setNewPacker({...newPacker, mobile: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">6-Digit PIN</label>
                        <input 
                            required 
                            type="text" 
                            maxLength={6} 
                            minLength={6}
                            className="w-full border rounded-lg p-2" 
                            value={newPacker.pin} 
                            onChange={e => setNewPacker({...newPacker, pin: e.target.value.replace(/\D/g,'')})} 
                            placeholder="123456"
                        />
                    </div>
                    <div className="flex gap-3 mt-6">
                        <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border rounded-lg hover:bg-slate-50">Cancel</button>
                        <button type="submit" disabled={loading} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                            {loading ? 'Creating...' : 'Create'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Change PIN Modal */}
      {editPacker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl">
                <h3 className="text-lg font-bold mb-4">Change PIN for {editPacker.name}</h3>
                <form onSubmit={handleUpdatePin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">New 6-Digit PIN</label>
                        <input 
                            required 
                            type="text" 
                            maxLength={6} 
                            minLength={6}
                            className="w-full border rounded-lg p-2 text-center text-2xl tracking-widest" 
                            value={newPin} 
                            onChange={e => setNewPin(e.target.value.replace(/\D/g,''))} 
                            placeholder="******"
                        />
                    </div>
                    <div className="flex gap-3 mt-6">
                        <button type="button" onClick={() => setEditPacker(null)} className="flex-1 px-4 py-2 border rounded-lg hover:bg-slate-50">Cancel</button>
                        <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Update</button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

const BillingTab: React.FC<{ user: UserProfile }> = ({ user }) => {
    const [amount, setAmount] = useState(500); 
    const [requests, setRequests] = useState<CreditRequest[]>([]);

    useEffect(() => {
        api.getCreditRequests(UserRole.ADMIN, user.id).then(setRequests);
    }, [user.id]);

    const handleRequest = async () => {
        try {
            await api.requestCredits(user.id, amount);
            setRequests(await api.getCreditRequests(UserRole.ADMIN, user.id));
            alert('Request Sent');
        } catch (e) {
            alert('Error sending request');
        }
    };

    return (
        <div className="space-y-8">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-8 text-white shadow-lg">
                <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                    <div>
                        <h2 className="text-3xl font-bold">{user.credits || 0} Credits</h2>
                        <p className="text-blue-100 mt-1">Available Balance</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-lg mb-4 text-slate-800">Recharge Wallet</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-1 text-slate-700">Amount (INR)</label>
                            <input 
                                type="number" 
                                value={amount}
                                onChange={e => setAmount(Number(e.target.value))}
                                className="w-full border border-slate-300 rounded-lg p-2.5" 
                            />
                        </div>
                        <button onClick={handleRequest} className="w-full bg-slate-900 text-white py-2.5 rounded-lg hover:bg-slate-800 transition-colors">
                            Request Credits
                        </button>
                    </div>
                </div>
                {/* History List omitted for brevity but would map 'requests' */}
            </div>
        </div>
    );
};

const SettingsTab: React.FC<{ user: UserProfile }> = ({ user }) => {
    const [config, setConfig] = useState<IntegrationConfig>(user.integrations || {
        googleDriveConnected: false,
        googleSheetConnected: false,
        whatsappProvider: 'None',
        ecommercePlatform: 'None'
    });

    const handleSave = async () => {
        await api.updateIntegrationConfig(user.id, config);
        alert('Settings saved!');
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-lg mb-4">Integrations</h3>
                <div className="space-y-4">
                     <div>
                        <label className="block text-sm font-medium mb-1">WhatsApp Provider</label>
                        <select 
                            value={config.whatsappProvider}
                            onChange={(e: any) => setConfig({...config, whatsappProvider: e.target.value})}
                            className="w-full border rounded-lg p-2.5 bg-white"
                        >
                            <option value="None">None</option>
                            <option value="Interakt">Interakt</option>
                            <option value="Wati">Wati</option>
                        </select>
                    </div>
                </div>
                <button onClick={handleSave} className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg">Save Changes</button>
            </div>
        </div>
    );
};

const AdminPanel: React.FC<AdminDashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'packers' | 'billing' | 'settings'>('dashboard');
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'packers', label: 'Packers', icon: Users },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen flex bg-slate-50">
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
