import React, { useState, useEffect, useRef } from 'react'; // Added useRef
import { UserProfile } from '../../types';
import { api } from '../../services/api';
import { supabase } from '../../lib/supabase';
import { LayoutDashboard, Users, Folder, Save, Link2Off, RefreshCw, AlertCircle, FileSpreadsheet, Check, Clock } from 'lucide-react';

export const SettingsTab: React.FC<{ user: UserProfile }> = ({ user }) => {
    const [platform, setPlatform] = useState(user.integrations?.ecommercePlatform || 'None');
    const [platformConfig, setPlatformConfig] = useState(user.integrations?.platformConfig || {});
    const [fulfillmentDelay, setFulfillmentDelay] = useState<number>(user.integrations?.fulfillmentDelay || 0);

    const [whatsapp, setWhatsapp] = useState(user.integrations?.whatsappProvider || 'None');
    const [whatsappConfig, setWhatsappConfig] = useState(user.integrations?.whatsappConfig || {});

    const [googleConnected, setGoogleConnected] = useState(user.integrations?.googleConnected || false);
    const [loading, setLoading] = useState(false);
    const [sheetId, setSheetId] = useState(user.integrations?.googleSheetId || '');

    // --- CRITICAL FIX: PREVENT DOUBLE EXECUTION ---
    const hasRunOAuth = useRef(false);

    // --- AUTO SETUP AFTER OAUTH ---
    useEffect(() => {
        const handleOAuth = async () => {
            const params = new URLSearchParams(window.location.search);
            const authCode = params.get('code');
            const state = params.get('state');

            // 1. Safety Check: If we already ran this, STOP.
            if (hasRunOAuth.current) return;

            if (authCode && state === user.id) {
                // 2. Mark as running immediately
                hasRunOAuth.current = true;
                
                // 3. Clear URL so refresh doesn't trigger it again
                window.history.replaceState({}, document.title, window.location.pathname);
                
                setLoading(true);
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (!session) throw new Error("Auth error");

                    // Exchange Code
                    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-auth`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                        body: JSON.stringify({ action: 'exchange_code', code: authCode, admin_id: user.id })
                    });
                    
                    // If fails, throw error (unless it's just a duplicate run that slipped through)
                    if (!res.ok) throw new Error('Token exchange failed');

                    // Auto-Setup Infrastructure
                    const { sheetId: newSheetId, folderId: newFolderId } = await api.setupPowerpackInfrastructure(user.id);
                    
                    // Save Config
                    const newConfig = { 
                        ...user.integrations, 
                        googleConnected: true, 
                        googleSheetId: newSheetId,
                        googleFolderId: newFolderId
                    };
                    await api.updateIntegrationConfig(user.id, newConfig);

                    setGoogleConnected(true);
                    setSheetId(newSheetId);
                    alert("Google Connected & 'Powerpack' Folder Created!");

                } catch (e: any) {
                    // Ignore "Invalid Grant" errors usually caused by double-firing in dev
                    if (!e.message.includes('invalid_grant')) {
                        alert(`Setup Failed: ${e.message}`);
                    }
                    // Even if failed, check if we are actually connected in DB? 
                    // For now, reset UI:
                    // setGoogleConnected(false); 
                } finally {
                    setLoading(false);
                }
            }
        };
        handleOAuth();
    }, [user.id]);

    const saveWebsite = async () => {
        try { await api.updateIntegrationConfig(user.id, { ...user.integrations, ecommercePlatform: platform, platformConfig, fulfillmentDelay }); alert('Website Settings Saved!'); } catch(e: any) { alert(e.message); }
    };

    const saveWhatsApp = async () => {
        try { await api.updateIntegrationConfig(user.id, { ...user.integrations, whatsappProvider: whatsapp, whatsappConfig }); alert('WhatsApp Settings Saved!'); } catch(e: any) { alert(e.message); }
    };

    const handleDisconnect = async () => {
        if(!confirm("Disconnect Google?")) return;
        try { await api.disconnectGoogle(user.id); } catch {}
        setGoogleConnected(false); setSheetId(''); 
        try {
            await supabase.from('profiles').update({ 
                integrations: { ...user.integrations, googleConnected: false, googleFolderId: null, googleSheetId: null } 
            }).eq('id', user.id);
        } catch {}
        alert("Disconnected");
    };

    if (loading) return <div className="p-10 text-center text-blue-600 font-bold flex flex-col items-center gap-4"><RefreshCw className="animate-spin" /> Setting up 'Powerpack' Folders...</div>;

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-10">
            {/* Website Integration */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
                <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
                     <div className="flex items-center gap-3"><div className="bg-blue-100 p-2 rounded-lg text-blue-600"><LayoutDashboard size={20} /></div><h3 className="font-bold text-lg text-slate-800">Website Integration</h3></div>
                     <button onClick={saveWebsite} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold"><Save size={16} /> Save</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium mb-1">Platform</label><select value={platform} onChange={(e) => setPlatform(e.target.value)} className="w-full border rounded-lg p-2.5"><option value="None">None</option><option value="Shopify">Shopify</option><option value="WooCommerce">WooCommerce</option></select></div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Delay</label>
                        <select value={fulfillmentDelay} onChange={(e) => setFulfillmentDelay(Number(e.target.value))} className="w-full border rounded-lg p-2.5">
                            <option value={0}>Immediate (0 min)</option>
                            <option value={5}>5 Minutes</option>
                            <option value={15}>15 Minutes</option>
                            <option value={30}>30 Minutes</option>
                            <option value={60}>1 Hour</option>
                            <option value={120}>2 Hours</option>
                        </select>
                    </div>
                </div>
                {platform === 'Shopify' && <div className="mt-4 p-4 bg-slate-50 border rounded-lg space-y-2"><input placeholder="Shop Domain" className="w-full border p-2 rounded" value={platformConfig.domain || ''} onChange={e=>setPlatformConfig({...platformConfig, domain: e.target.value})} /><input type="password" placeholder="Access Token" className="w-full border p-2 rounded" value={platformConfig.apiKey || ''} onChange={e=>setPlatformConfig({...platformConfig, apiKey: e.target.value})} /></div>}
                {platform === 'WooCommerce' && <div className="mt-4 p-4 bg-slate-50 border rounded-lg space-y-2"><input placeholder="Store URL" className="w-full border p-2 rounded" value={platformConfig.domain || ''} onChange={e=>setPlatformConfig({...platformConfig, domain: e.target.value})} /><input placeholder="Consumer Key" className="w-full border p-2 rounded" value={platformConfig.key || ''} onChange={e=>setPlatformConfig({...platformConfig, key: e.target.value})} /><input type="password" placeholder="Consumer Secret" className="w-full border p-2 rounded" value={platformConfig.secret || ''} onChange={e=>setPlatformConfig({...platformConfig, secret: e.target.value})} /></div>}
            </div>

            {/* WhatsApp Integration */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
                <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3"><div className="bg-green-100 p-2 rounded-lg text-green-600"><Users size={20} /></div><h3 className="font-bold text-lg text-slate-800">WhatsApp Integration</h3></div>
                    <button onClick={saveWhatsApp} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold"><Save size={16} /> Save</button>
                </div>
                <div><label className="block text-sm font-medium mb-1">Provider</label><select value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="w-full border rounded-lg p-2.5"><option value="None">None</option><option value="Interakt">Interakt</option><option value="Wati">Wati</option><option value="AiSensy">AiSensy</option></select></div>
                {whatsapp !== 'None' && <div className="mt-4 p-4 bg-slate-50 border rounded-lg space-y-2"><input type="password" placeholder="API Key" className="w-full border p-2 rounded" value={whatsappConfig.apiKey || ''} onChange={e=>setWhatsappConfig({...whatsappConfig, apiKey: e.target.value})} /><input placeholder="Template Name" className="w-full border p-2 rounded" value={whatsappConfig.templateName || ''} onChange={e=>setWhatsappConfig({...whatsappConfig, templateName: e.target.value})} /></div>}
            </div>

            {/* Google Integration */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
                <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3"><div className="bg-orange-100 p-2 rounded-lg text-orange-600"><Folder size={20} /></div><h3 className="font-bold text-lg text-slate-800">Google Connect</h3></div>
                    {googleConnected && <button onClick={handleDisconnect} className="flex items-center gap-2 text-red-600 border border-red-200 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-50"><Link2Off size={16} /> Disconnect</button>}
                </div>

                {!googleConnected ? (
                    <div className="flex flex-col items-start gap-3">
                        <button onClick={() => api.initiateGoogleAuth(user.id)} className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium py-2.5 px-4 rounded-lg"><img src="https://www.google.com/favicon.ico" alt="G" className="w-4 h-4" /> Connect Google Account</button>
                        <div className="text-xs text-slate-400 mt-2 flex items-center gap-1"><AlertCircle size={12} /> Is the connection stuck? <button onClick={handleDisconnect} className="text-red-500 hover:underline font-bold">Force Reset</button></div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg border border-green-100"><Check size={16} /> Connected to Drive</div>
                        <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg"><h4 className="font-bold text-blue-900 mb-1">Storage Location</h4><p className="text-sm text-blue-700">Videos are saved in: <strong>/Powerpack/Date/</strong></p></div>
                        <div className="flex items-center gap-3 pt-2">
                             <FileSpreadsheet className="text-green-600" size={20} />
                             <div className="flex-1">
                                <div className="text-sm font-medium text-slate-800">Fulfillment Log Sheet</div>
                                {sheetId ? (<a href={`https://docs.google.com/spreadsheets/d/${sheetId}`} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">Powerpack Logs <ExternalLink size={10} /></a>) : <span className="text-xs text-orange-500 animate-pulse">Generating...</span>}
                             </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
