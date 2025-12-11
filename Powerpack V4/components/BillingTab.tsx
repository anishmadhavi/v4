import React, { useState, useEffect } from 'react';
import { UserProfile, UserRole, CreditRequest } from '../../types';
import { api } from '../../services/api';

export const BillingTab: React.FC<{ user: UserProfile }> = ({ user }) => {
    const [amount, setAmount] = useState(500); 
    const [requests, setRequests] = useState<CreditRequest[]>([]);

    useEffect(() => { api.getCreditRequests(UserRole.ADMIN, user.id).then(setRequests); }, [user.id]);
    const handleRequest = async () => {
        try { await api.requestCredits(user.id, amount); setRequests(await api.getCreditRequests(UserRole.ADMIN, user.id)); alert('Request Sent'); } catch { alert('Error sending request'); }
    };

    return (
        <div className="space-y-8">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-8 text-white shadow-lg">
                <h2 className="text-3xl font-bold">{user.credits || 0} Credits</h2>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-md">
                <h3 className="font-bold text-lg mb-4 text-slate-800">Recharge Wallet</h3>
                <div className="space-y-4">
                    <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} className="w-full border border-slate-300 rounded-lg p-2.5" />
                    <button onClick={handleRequest} className="w-full bg-slate-900 text-white py-2.5 rounded-lg hover:bg-slate-800">Request Credits</button>
                </div>
            </div>
        </div>
    );
};
