import React, { useState, useEffect } from 'react';
import { UserProfile } from '../../types';
import { api } from '../../services/api';
import { Plus, Trash2, Key } from 'lucide-react';

export const PackersTab: React.FC<{ user: UserProfile }> = ({ user }) => {
  const [packers, setPackers] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newPacker, setNewPacker] = useState({ name: '', mobile: '', pin: '' });
  const [loading, setLoading] = useState(false);
  const [editPacker, setEditPacker] = useState<any | null>(null);
  const [newPin, setNewPin] = useState('');

  const fetchPackers = () => api.getPackers(user.id).then(setPackers).catch(console.error);
  useEffect(() => { fetchPackers(); }, [user.id]);

  const handleCreatePacker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPacker.pin.length < 6) return alert("PIN must be 6 digits");
    setLoading(true);
    try {
        await api.createPacker(user.id, newPacker);
        setShowModal(false); setNewPacker({ name: '', mobile: '', pin: '' }); fetchPackers();
        alert('Packer Created');
    } catch (err: any) { alert('Failed: ' + err.message); } 
    finally { setLoading(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Delete "${name}"?`)) {
        try { await api.deletePacker(id); fetchPackers(); } 
        catch (e: any) { alert('Failed: ' + e.message); }
    }
  };

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPacker || newPin.length < 6) return alert("PIN must be 6 digits");
    try { await api.updatePackerPin(editPacker.id, newPin); setEditPacker(null); setNewPin(''); alert("PIN Updated"); } 
    catch (e: any) { alert('Failed: ' + e.message); }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-slate-800">Team Management</h2>
        <button onClick={() => setShowModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"><Plus size={18} /> Add Packer</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {packers.map(packer => (
          <div key={packer.id} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 relative group">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">{packer.name.charAt(0)}</div>
                <div><h3 className="font-semibold text-slate-800">{packer.name}</h3><p className="text-sm text-slate-500">Packer</p></div>
              </div>
              <div className="space-y-2 mt-4">
                <div className="flex justify-between text-sm"><span className="text-slate-500">Mobile</span><span className="font-medium text-slate-700">{packer.mobile || 'N/A'}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">PIN</span><span className="font-medium text-slate-700 tracking-widest">••••••</span></div>
              </div>
              <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-100">
                  <button onClick={() => { setEditPacker(packer); setNewPin(''); }} className="p-2 text-slate-400 hover:text-blue-600 rounded-lg"><Key size={18} /></button>
                  <button onClick={() => handleDelete(packer.id, packer.name)} className="p-2 text-slate-400 hover:text-red-600 rounded-lg"><Trash2 size={18} /></button>
              </div>
          </div>
        ))}
      </div>
      
      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
                <h3 className="text-lg font-bold mb-4">Add New Packer</h3>
                <form onSubmit={handleCreatePacker} className="space-y-4">
                    <input required className="w-full border rounded-lg p-2" placeholder="Full Name" value={newPacker.name} onChange={e => setNewPacker({...newPacker, name: e.target.value})} />
                    <input required className="w-full border rounded-lg p-2" placeholder="Mobile" value={newPacker.mobile} onChange={e => setNewPacker({...newPacker, mobile: e.target.value})} />
                    <input required maxLength={6} className="w-full border rounded-lg p-2" placeholder="6-Digit PIN" value={newPacker.pin} onChange={e => setNewPacker({...newPacker, pin: e.target.value.replace(/\D/g,'')})} />
                    <div className="flex gap-3 mt-6"><button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border rounded-lg">Cancel</button><button type="submit" disabled={loading} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg">{loading ? 'Creating...' : 'Create'}</button></div>
                </form>
            </div>
        </div>
      )}
      
      {/* Edit Modal */}
      {editPacker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl">
                <h3 className="text-lg font-bold mb-4">Update PIN</h3>
                <form onSubmit={handleUpdatePin} className="space-y-4">
                    <input required maxLength={6} className="w-full border rounded-lg p-2 text-center text-2xl tracking-widest" value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g,''))} placeholder="******" />
                    <div className="flex gap-3 mt-6"><button type="button" onClick={() => setEditPacker(null)} className="flex-1 px-4 py-2 border rounded-lg">Cancel</button><button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg">Update</button></div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};
