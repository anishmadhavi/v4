import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { UserProfile, UserRole, VideoLog, CreditRequest } from '../types';
import { api } from '../services/api';
import { 
  LayoutDashboard, Users, CreditCard, Settings, LogOut, 
  Plus, Video, Trash2, Key, ExternalLink, Copy, HelpCircle,
  Folder, FileSpreadsheet, Check, Clock, Save, Link2Off, RefreshCw
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
      } catch (e) { console.error(e); }
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 10000); 
    return () => clearInterval(interval);
  }, [user.id]);

  const stats = {
    total: logs.length,
    failed: logs.filter(l => l.whatsapp_status === 'failed').length,
    creditsUsed: logs.length, 
    pending: logs.filter(l => l.whatsapp_status === 'Pending').length
  };

  const chartData = logs.slice(0, 7).reverse().map((log) => ({
    name: new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
    value: 1
  }));

  // NEW: Quick Link to Sheet
  const sheetId = user.integrations?.googleSheetId;

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Credits Used</div>
            <div className="text-2xl font-bold text-slate-800">{stats.creditsUsed}</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Failed</div>
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Available</div>
            <div className="text-2xl font-bold text-blue-600">{user.credits || 0}</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
            <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Pending</div>
            <div className="text-2xl font-bold text-orange-500">{stats.pending}</div>
            {stats.pending > 0 && (
                <div className="absolute right-2 top-2 w-2 h-2 bg-orange-500 rounded-full animate-ping"></div>
            )}
        </div>
      </div>

      {/* Sheet Link Banner */}
      {sheetId && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex justify-between items-center">
              <div className="flex items-center gap-2 text-green-800">
                  <FileSpreadsheet size={18} />
                  <span className="font-medium text-sm">Your Fulfillment Logs are syncing to Google Sheets</span>
              </div>
              <a 
                href={`https://docs.google.com/spreadsheets/d/${sheetId}`} 
                target="_blank" 
                rel="noreferrer"
                className="text-xs bg-white border border-green-200 text-green-700 px-3 py-1.5 rounded-md hover:bg-green-100 flex items-center gap-1 font-bold"
              >
                  Open Sheet <ExternalLink size={10} />
              </a>
          </div>
      )}

      {/* Charts & Tables */}
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
                            log.whatsapp_status === 'sent' ? 'bg-green-100 text-green-700' : 
                            log.whatsapp_status === 'Pending' ? 'bg-orange-100 text-orange-700' :
                            'bg-red-100 text-red-700'
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

// --- PACKERS TAB (Preserved) ---
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

// --- BILLING TAB (Preserved) ---
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

// --- SETTINGS TAB (UPDATED UI) ---
const SettingsTab: React.FC<{ user: UserProfile }> = ({ user }) => {
    // 1. Website State
    const [platform, setPlatform] = useState(user.integrations?.ecommercePlatform || 'None');
    const [platformConfig, setPlatformConfig] = useState(user.integrations?.platformConfig || {});
    const [fulfillmentDelay, setFulfillmentDelay] = useState<number>(user.integrations?.fulfillmentDelay || 60);

    // 2. WhatsApp State
    const [whatsapp, setWhatsapp] = useState(user.integrations?.whatsappProvider || 'None');
    const [whatsappConfig, setWhatsappConfig] = useState(user.integrations?.whatsappConfig || {});

    // 3. Google State
    const [googleConnected, setGoogleConnected] = useState(user.integrations?.googleConnected || false);
    const [driveFolders, setDriveFolders] = useState<{id: string, name: string}[]>([]);
    const [selectedFolder, setSelectedFolder] = useState(user.integrations?.googleFolderId || '');
    const [sheetId, setSheetId] = useState(user.integrations?.googleSheetId || '');
    const [loading, setLoading] = useState(false);

    // --- GOOGLE OAUTH LISTENER ---
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
                    alert("Google Connected! Now setting up folders...");
                    
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

    // --- AUTO-CREATE SHEET LOGIC ---
    useEffect(() => {
        const autoSetupSheet = async () => {
            // Only if connected, folder selected, but NO sheet yet
            if (googleConnected && selectedFolder && !sheetId) {
                try {
                    setLoading(true);
                    console.log("Auto-generating sheet...");
                    const newSheet = await api.createLogSheet(user.id, selectedFolder);
                    setSheetId(newSheet.id);
                    
                    // Update Local State immediately
                    const newConfig = { 
                        ...user.integrations, 
                        googleSheetId: newSheet.id,
                        googleFolderId: selectedFolder
                    };
                    await api.updateIntegrationConfig(user.id, newConfig);
                    
                } catch (e) {
                    console.error("Sheet creation failed", e);
                } finally {
                    setLoading(false);
                }
            }
        };

        if (selectedFolder && selectedFolder !== 'create_new') {
            autoSetupSheet();
        }
    }, [selectedFolder, googleConnected, sheetId, user.id]);

    // --- INDIVIDUAL SAVE HANDLERS ---
    
    const saveWebsiteSettings = async () => {
        const config = { ...user.integrations, ecommercePlatform: platform, platformConfig, fulfillmentDelay };
        try {
            await api.updateIntegrationConfig(user.id, config);
            alert('Website Settings Saved!');
        } catch (e: any) { alert('Save failed: ' + e.message); }
    };

    const saveWhatsAppSettings = async () => {
        const config = { ...user.integrations, whatsappProvider: whatsapp, whatsappConfig };
        try {
            await api.updateIntegrationConfig(user.id, config);
            alert('WhatsApp Settings Saved!');
        } catch (e: any) { alert('Save failed: ' + e.message); }
    };

    const handleDisconnectGoogle = async () => {
        if(!confirm("Are you sure? This will stop video uploads.")) return;
        try {
            await api.disconnectGoogle(user.id);
            setGoogleConnected(false);
            setDriveFolders([]);
            setSelectedFolder('');
            setSheetId('');
            alert("Google Account Disconnected");
        } catch(e: any) { alert("Disconnect failed"); }
    };

    const handleFolderChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        if (val === 'create_new') {
            const name = prompt("Enter new folder name:", "VideoVerify Proofs");
            if (name) {
                try {
                    const newF = await api.createDriveFolder(name);
                    setDriveFolders([...driveFolders, newF]);
                    setSelectedFolder(newF.id);
                    // Trigger save implicitly for folder
                    const config = { ...user.integrations, googleFolderId: newF.id };
                    await api.updateIntegrationConfig(user.id, config);
                } catch(e) { alert("Folder creation failed"); }
            }
        } else {
            setSelectedFolder(val);
             // Trigger save implicitly
             const config = { ...user.integrations, googleFolderId: val };
             await api.updateIntegrationConfig(user.id, config);
        }
    };

    const copyTemplate = () => {
         const template = `Hi {{1}},

Your Order #{{2}} has been packed and is ready for dispatch! 📦

To ensure quality, we have recorded a video proof of your package.

You can watch your packing video here: {{3}}`;
        navigator.clipboard.writeText(template);
        alert('Template copied!');
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

    if (loading) return <div className="p-10 text-center text-blue-600 font-bold flex flex-col items-center gap-4"><RefreshCw className="animate-spin" /> Processing Google Integration...</div>;

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-10">
            
            {/* 1. Website Integration */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
                <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
                     <div className="flex items-center gap-3">
                        <div className="bg-blue-100 p-2 rounded-lg text-blue-600"><LayoutDashboard size={20} /></div>
                        <h3 className="font-bold text-lg text-slate-800">Website Integration</h3>
                     </div>
                     <button onClick={saveWebsiteSettings} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700">
                        <Save size={16} /> Save Changes
                     </button>
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
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1 text-slate-700">Process Delay (Pause)</label>
                            <div className="relative">
                                <select 
                                    value={fulfillmentDelay}
                                    onChange={(e) => setFulfillmentDelay(Number(e.target.value))}
                                    className="w-full border rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none pl-9"
                                >
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
                        <div className="bg-slate-50 p-4 rounded-lg space-y-4 border border-slate-200">
                            {/* ... Fields preserved from previous version ... */}
                             {platform === 'Shopify' && (
                                <>
                                    <div><label className="block text-xs font-medium text-slate-500">Shop Domain</label>
                                    <input type="text" className="w-full border rounded-lg p-2" value={platformConfig.domain || ''} onChange={e => setPlatformConfig({...platformConfig, domain: e.target.value})} /></div>
                                    <div><label className="block text-xs font-medium text-slate-500">Access Token</label>
                                    <input type="password" className="w-full border rounded-lg p-2" value={platformConfig.apiKey || ''} onChange={e => setPlatformConfig({...platformConfig, apiKey: e.target.value})} /></div>
                                </>
                            )}
                            {platform === 'WooCommerce' && (
                                <>
                                    <div><label className="block text-xs font-medium text-slate-500">Store URL</label>
                                    <input type="text" className="w-full border rounded-lg p-2" value={platformConfig.domain || ''} onChange={e => setPlatformConfig({...platformConfig, domain: e.target.value})} /></div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div><label className="block text-xs font-medium text-slate-500">Key</label><input type="text" className="w-full border rounded-lg p-2" value={platformConfig.key || ''} onChange={e => setPlatformConfig({...platformConfig, key: e.target.value})} /></div>
                                        <div><label className="block text-xs font-medium text-slate-500">Secret</label><input type="password" className="w-full border rounded-lg p-2" value={platformConfig.secret || ''} onChange={e => setPlatformConfig({...platformConfig, secret: e.target.value})} /></div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* 2. WhatsApp Integration */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
                <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-green-100 p-2 rounded-lg text-green-600"><Users size={20} /></div>
                        <h3 className="font-bold text-lg text-slate-800">WhatsApp Integration</h3>
                    </div>
                    <button onClick={saveWhatsAppSettings} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700">
                        <Save size={16} /> Save Changes
                     </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1 text-slate-700">Service Provider</label>
                        <select value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="w-full border rounded-lg p-2.5 bg-white">
                            <option value="None">Select Provider</option>
                            <option value="Interakt">Interakt</option>
                            <option value="Wati">Wati</option>
                            <option value="AiSensy">AiSensy</option>
                        </select>
                    </div>

                    {whatsapp !== 'None' && (
                        <div className="space-y-6">
                            <div className="bg-slate-50 p-4 rounded-lg space-y-4 border border-slate-200">
                                <div><label className="block text-xs font-medium text-slate-500">API Key</label>
                                <input type="password" className="w-full border rounded-lg p-2" value={whatsappConfig.apiKey || ''} onChange={e => setWhatsappConfig({...whatsappConfig, apiKey: e.target.value})} /></div>
                                {whatsapp === 'Wati' && (
                                    <div><label className="block text-xs font-medium text-slate-500">API URL</label>
                                    <input type="text" className="w-full border rounded-lg p-2" value={whatsappConfig.url || ''} onChange={e => setWhatsappConfig({...whatsappConfig, url: e.target.value})} /></div>
                                )}
                            </div>
                            <div className="border border-blue-100 bg-blue-50/50 p-5 rounded-xl">
                                <h4 className="font-bold text-slate-800 mb-2">Template Name</h4>
                                <input type="text" className="w-full border rounded-lg p-2 bg-white" placeholder="e.g., parcel_packed_video_v1"
                                    value={whatsappConfig.templateName || ''} onChange={e => setWhatsappConfig({...whatsappConfig, templateName: e.target.value})} />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 3. Google Integration */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
                <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-orange-100 p-2 rounded-lg text-orange-600"><Folder size={20} /></div>
                        <h3 className="font-bold text-lg text-slate-800">Google Connect</h3>
                    </div>
                    {googleConnected && (
                        <button onClick={handleDisconnectGoogle} className="flex items-center gap-2 bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-100">
                            <Link2Off size={16} /> Disconnect
                        </button>
                    )}
                </div>

                <div className="flex flex-col md:flex-row gap-6 items-start">
                    <div className="flex-1 space-y-4">
                        {!googleConnected ? (
                            <button onClick={() => api.initiateGoogleAuth(user.id)} className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium py-2.5 px-4 rounded-lg">
                                <img src="https://www.google.com/favicon.ico" alt="G" className="w-4 h-4" />
                                Connect Google Account
                            </button>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg border border-green-100">
                                    <Check size={16} /> Connected
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Video Storage Folder</label>
                                    <select value={selectedFolder} onChange={handleFolderChange} className="w-full border rounded-lg p-2 bg-white">
                                        <option value="">Select Folder</option>
                                        <option value="create_new">+ Create New Folder</option>
                                        {driveFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                    </select>
                                </div>

                                {/* AUTO-GENERATED SHEET STATUS */}
                                <div className="flex items-center gap-3 pt-2">
                                    <FileSpreadsheet className={sheetId ? "text-green-600" : "text-slate-400"} size={20} />
                                    <div className="flex-1">
                                        <div className="text-sm font-medium text-slate-800">Fulfillment Log Sheet</div>
                                        {sheetId ? (
                                            <a href={`https://docs.google.com/spreadsheets/d/${sheetId}`} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                                                Powerpack Logs (Auto-synced) <ExternalLink size={10} />
                                            </a>
                                        ) : selectedFolder ? (
                                            <span className="text-xs text-orange-500 animate-pulse flex items-center gap-1">
                                                <RefreshCw size={10} className="animate-spin" /> Generating Sheet...
                                            </span>
                                        ) : (
                                            <span className="text-xs text-slate-500 italic">Select a folder to generate sheet</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- MAIN LAYOUT (Preserved) ---
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
