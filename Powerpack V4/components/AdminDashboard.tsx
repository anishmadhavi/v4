import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { UserProfile, UserRole, VideoLog, CreditRequest } from '../types';
import { api } from '../services/api';
import { 
  LayoutDashboard, Users, CreditCard, Settings, LogOut, 
  Plus, Video, Trash2, Key, ExternalLink, Copy, HelpCircle,
  Folder, FileSpreadsheet, Check, Clock
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface AdminDashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

// --- DASHBOARD TAB ---
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

// --- PACKERS TAB ---
const PackersTab: React.FC<{ user: UserProfile }> = ({ user }) => {
  const [packers, setPackers] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newPacker, setNewPacker] = useState({ name: '', mobile: '', pin: '' });
  const [loading, setLoading] = useState(false);
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

// --- BILLING TAB ---
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
            </div>
        </div>
    );
};

// --- SETTINGS TAB (UPDATED) ---
const SettingsTab: React.FC<{ user: UserProfile }> = ({ user }) => {
    const [platform, setPlatform] = useState(user.integrations?.ecommercePlatform || 'None');
    const [platformConfig, setPlatformConfig] = useState(user.integrations?.platformConfig || {});
    
    // NEW: Fulfillment Delay State
    const [fulfillmentDelay, setFulfillmentDelay] = useState<number>(user.integrations?.fulfillmentDelay || 60);

    const [whatsapp, setWhatsapp] = useState(user.integrations?.whatsappProvider || 'None');
    const [whatsappConfig, setWhatsappConfig] = useState(user.integrations?.whatsappConfig || {});

    // Google State
    const [googleConnected, setGoogleConnected] = useState(user.integrations?.googleConnected || false);
    const [driveFolders, setDriveFolders] = useState<{id: string, name: string}[]>([]);
    const [selectedFolder, setSelectedFolder] = useState(user.integrations?.googleFolderId || '');
    const [loading, setLoading] = useState(false);

    // 1. LISTEN FOR OAUTH REDIRECT
    useEffect(() => {
        const handleOAuthRedirect = async () => {
            const params = new URLSearchParams(window.location.search);
            const authCode = params.get('code');
            const state = params.get('state'); 

            if (authCode && state === user.id) {
                window.history.replaceState({}, document.title, window.location.pathname);
                setLoading(true);

                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (!session?.access_token) throw new Error("Session expired");

                    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-auth`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${session.access_token}`
                        },
                        body: JSON.stringify({ 
                            action: 'exchange_code', 
                            code: authCode, 
                            admin_id: user.id 
                        })
                    });

                    if (!response.ok) throw new Error('Token exchange failed');

                    setGoogleConnected(true);
                    alert("Google Account Connected Successfully!");
                    const folders = await api.getDriveFolders();
                    setDriveFolders(folders);

                } catch (e: any) {
                    console.error(e);
                    alert(`Connection Failed: ${e.message}`);
                } finally {
                    setLoading(false);
                }
            }
        };

        handleOAuthRedirect();
    }, [user.id]);

    useEffect(() => {
        if (googleConnected) {
            api.getDriveFolders().then(setDriveFolders).catch(console.error);
        }
    }, [googleConnected]);

    const handleSave = async () => {
        let finalFolderId = selectedFolder;
        if (selectedFolder === 'create_new') {
            const folderName = prompt("Enter new folder name:", "VideoVerify Proofs");
            if (folderName) {
                try {
                    const newFolder = await api.createDriveFolder(folderName);
                    setDriveFolders([...driveFolders, newFolder]);
                    finalFolderId = newFolder.id;
                    setSelectedFolder(newFolder.id);
                } catch (e) {
                    alert("Failed to create folder");
                    return;
                }
            } else {
                return;
            }
        }

        const config = {
            ecommercePlatform: platform,
            platformConfig,
            fulfillmentDelay, // SAVE THE DELAY
            whatsappProvider: whatsapp,
            whatsappConfig,
            googleConnected,
            googleFolderId: finalFolderId,
            googleSheetId: user.integrations?.googleSheetId
        };
        try {
            await api.updateIntegrationConfig(user.id, config);
            alert('Settings saved successfully!');
        } catch (e: any) {
            alert('Failed to save settings: ' + e.message);
        }
    };

    const copyTemplate = () => {
        const template = `Hi {{1}},

Your Order #{{2}} has been packed and is ready for dispatch! 📦

To ensure quality, we have recorded a video proof of your package.

You can watch your packing video here: {{3}}`;
        navigator.clipboard.writeText(template);
        alert('Template copied to clipboard!');
    };

    const getHelpLink = (provider: string) => {
        const links: Record<string, string> = {
            'Shopify': 'https://help.shopify.com/en/manual/apps/custom-apps',
            'WooCommerce': 'https://woocommerce.com/document/woocommerce-rest-api/',
            'Interakt': 'https://www.interakt.ai/help-center',
            'Wati': 'https://docs.wati.io/reference/introduction',
            'AiSensy': 'https://docs.aisensy.com/',
        };
        return links[provider] || '#';
    };

    const handleGoogleConnect = () => {
        api.initiateGoogleAuth(user.id);
    };

    if (loading) return <div className="p-10 text-center text-blue-600 font-bold">Connecting to Google... Please wait...</div>;

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            
            {/* 1. Website Integration */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
                    <div className="bg-blue-100 p-2 rounded-lg text-blue-600"><LayoutDashboard size={20} /></div>
                    <h3 className="font-bold text-lg text-slate-800">Website Integration</h3>
                </div>
                
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1 text-slate-700">E-commerce Platform</label>
                            <select 
                                value={platform}
                                onChange={(e) => setPlatform(e.target.value)}
                                className="w-full border rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                                <option value="None">Select Platform</option>
                                <option value="Shopify">Shopify</option>
                                <option value="WooCommerce">WooCommerce</option>
                                <option value="BigCommerce">BigCommerce</option>
                                <option value="Other">Other (Custom)</option>
                            </select>
                        </div>

                        {/* NEW: FULFILLMENT DELAY DROPDOWN */}
                        <div>
                            <label className="block text-sm font-medium mb-1 text-slate-700">Process Delay (Pause)</label>
                            <div className="relative">
                                <select 
                                    value={fulfillmentDelay}
                                    onChange={(e) => setFulfillmentDelay(Number(e.target.value))}
                                    className="w-full border rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none pl-9"
                                >
                                    <option value={1}>1 Minutes</option>
                                    <option value={15}>15 Minutes</option>
                                    <option value={30}>30 Minutes</option>
                                    <option value={60}>1 Hour</option>
                                    <option value={120}>2 Hours</option>
                                </select>
                                <Clock size={16} className="absolute left-3 top-3 text-slate-400" />
                            </div>
                            <p className="text-xs text-slate-500 mt-1">Wait time before fetching customer details & sending WhatsApp.</p>
                        </div>
                    </div>

                    {platform !== 'None' && (
                        <div className="bg-slate-50 p-4 rounded-lg space-y-4 border border-slate-200 animate-in fade-in slide-in-from-top-2">
                            <div className="flex justify-between items-center text-xs text-blue-600">
                                <span className="font-semibold uppercase tracking-wider">Credentials Required</span>
                                <a href={getHelpLink(platform)} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:underline">
                                    <HelpCircle size={12} /> How to find keys?
                                </a>
                            </div>

                            {platform === 'Shopify' && (
                                <>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Shop Domain (e.g., store.myshopify.com)</label>
                                        <input type="text" className="w-full border rounded-lg p-2" placeholder="my-store.myshopify.com"
                                            value={platformConfig.domain || ''} onChange={e => setPlatformConfig({...platformConfig, domain: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Admin API Access Token</label>
                                        <input type="password" className="w-full border rounded-lg p-2" placeholder="shpat_..."
                                            value={platformConfig.apiKey || ''} onChange={e => setPlatformConfig({...platformConfig, apiKey: e.target.value})} />
                                    </div>
                                </>
                            )}
                             {(platform === 'WooCommerce') && (
                                <>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Store URL</label>
                                        <input type="text" className="w-full border rounded-lg p-2" placeholder="https://mystore.com"
                                            value={platformConfig.domain || ''} onChange={e => setPlatformConfig({...platformConfig, domain: e.target.value})} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 mb-1">Consumer Key</label>
                                            <input type="text" className="w-full border rounded-lg p-2" placeholder="ck_..."
                                                value={platformConfig.key || ''} onChange={e => setPlatformConfig({...platformConfig, key: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 mb-1">Consumer Secret</label>
                                            <input type="password" className="w-full border rounded-lg p-2" placeholder="cs_..."
                                                value={platformConfig.secret || ''} onChange={e => setPlatformConfig({...platformConfig, secret: e.target.value})} />
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* 2. WhatsApp Integration (Preserved) */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
                    <div className="bg-green-100 p-2 rounded-lg text-green-600"><Users size={20} /></div>
                    <h3 className="font-bold text-lg text-slate-800">WhatsApp Integration</h3>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1 text-slate-700">Service Provider</label>
                        <select 
                            value={whatsapp}
                            onChange={(e) => setWhatsapp(e.target.value)}
                            className="w-full border rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-green-500 outline-none"
                        >
                            <option value="None">Select Provider</option>
                            <option value="Interakt">Interakt</option>
                            <option value="Wati">Wati</option>
                            <option value="AiSensy">AiSensy</option>
                            <option value="Bitespeed">Bitespeed</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>

                    {whatsapp !== 'None' && (
                        <div className="space-y-6">
                            <div className="bg-slate-50 p-4 rounded-lg space-y-4 border border-slate-200">
                                <div className="flex justify-between items-center text-xs text-green-600">
                                    <span className="font-semibold uppercase tracking-wider">API Configuration</span>
                                    <a href={getHelpLink(whatsapp)} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:underline">
                                        <HelpCircle size={12} /> Get API Key
                                    </a>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">API Key / Auth Token</label>
                                    <input type="password" className="w-full border rounded-lg p-2" placeholder="Paste your key here..."
                                        value={whatsappConfig.apiKey || ''} onChange={e => setWhatsappConfig({...whatsappConfig, apiKey: e.target.value})} />
                                </div>
                                {whatsapp === 'Wati' && (
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 mb-1">API Endpoint URL</label>
                                        <input type="text" className="w-full border rounded-lg p-2" placeholder="https://live-server-XXXX.wati.io"
                                            value={whatsappConfig.url || ''} onChange={e => setWhatsappConfig({...whatsappConfig, url: e.target.value})} />
                                    </div>
                                )}
                            </div>

                            <div className="border border-blue-100 bg-blue-50/50 p-5 rounded-xl">
                                <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                                    <span className="bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs">!</span>
                                    Template Setup Required
                                </h4>
                                <p className="text-sm text-slate-600 mb-4">
                                    You must create a <strong>Utility</strong> template in your {whatsapp} dashboard with exactly <strong>3 variables</strong>:
                                    1. Customer Name, 2. Order ID, 3. Video Link.
                                </p>
                                
                                <div className="bg-white border border-slate-200 p-3 rounded-lg font-mono text-xs text-slate-600 relative group">
                                    <pre className="whitespace-pre-wrap">
{`Hi {{1}},

Your Order #{{2}} has been packed and is ready for dispatch! 📦

To ensure quality, we have recorded a video proof of your package.

You can watch your packing video here: {{3}}`}
                                    </pre>
                                    <button onClick={copyTemplate} className="absolute top-2 right-2 bg-slate-100 hover:bg-slate-200 p-2 rounded text-slate-600" title="Copy Template">
                                        <Copy size={14} />
                                    </button>
                                </div>

                                <div className="mt-4">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Your Template Name</label>
                                    <input type="text" className="w-full border rounded-lg p-2 bg-white" placeholder="e.g., parcel_packed_video_v1"
                                        value={whatsappConfig.templateName || ''} onChange={e => setWhatsappConfig({...whatsappConfig, templateName: e.target.value})} />
                                    <p className="text-xs text-slate-500 mt-1">Enter the exact name of the approved template from your provider.</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 3. Google Integration (Preserved) */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
                    <div className="bg-orange-100 p-2 rounded-lg text-orange-600"><Folder size={20} /></div>
                    <h3 className="font-bold text-lg text-slate-800">Google Connect</h3>
                </div>

                <div className="flex flex-col md:flex-row gap-6 items-start">
                    <div className="flex-1 space-y-4">
                        <p className="text-sm text-slate-600">Connect your Google account to store video proofs in Drive and log activities in Sheets.</p>
                        
                        {!googleConnected ? (
                            <button onClick={handleGoogleConnect} className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium py-2.5 px-4 rounded-lg transition-colors">
                                <img src="https://www.google.com/favicon.ico" alt="G" className="w-4 h-4" />
                                Connect Google Account
                            </button>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg border border-green-100">
                                    <Check size={16} /> Google Account Connected
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Video Storage Folder</label>
                                    <div className="flex gap-2">
                                        <select 
                                            value={selectedFolder}
                                            onChange={(e) => setSelectedFolder(e.target.value)}
                                            className="flex-1 border rounded-lg p-2 bg-white"
                                        >
                                            <option value="">Select a Folder</option>
                                            <option value="create_new">+ Create New Folder</option>
                                            {driveFolders.map(f => (
                                                <option key={f.id} value={f.id}>{f.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">
                                        {driveFolders.length === 0 ? "Fetching folders..." : "Select the folder to store videos."}
                                    </p>
                                </div>

                                <div className="flex items-center gap-3 pt-2">
                                    <FileSpreadsheet className="text-green-600" size={20} />
                                    <div>
                                        <div className="text-sm font-medium text-slate-800">Fulfillment Log Sheet</div>
                                        {user.integrations?.googleSheetId ? (
                                            <a href={`https://docs.google.com/spreadsheets/d/${user.integrations.googleSheetId}`} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                                                Open Sheet <ExternalLink size={10} />
                                            </a>
                                        ) : (
                                            <span className="text-xs text-slate-500 italic">Will be created automatically on save</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex justify-end pt-4">
                <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-blue-200 transition-all">
                    Save Integration Settings
                </button>
            </div>
        </div>
    );
};

// --- MAIN LAYOUT ---
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
