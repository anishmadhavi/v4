import React, { useState, useEffect } from 'react';
import { UserProfile, UserRole, VideoLog } from '../../types';
import { api } from '../../services/api';
import { Video, FileSpreadsheet, ExternalLink } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export const DashboardTab: React.FC<{ user: UserProfile }> = ({ user }) => {
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
    failed: logs.filter(l => l.whatsapp_status === 'Failed').length,
    creditsUsed: logs.length, 
    pending: logs.filter(l => l.whatsapp_status === 'Pending').length
  };

  const chartData = logs.slice(0, 7).reverse().map((log) => ({
    name: new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
    value: 1
  }));

  const sheetId = user.integrations?.googleSheetId;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
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

      {/* Quick Sheet Link */}
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

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Videos Table */}
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
                            log.whatsapp_status === 'Sent' ? 'bg-green-100 text-green-700' : 
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

        {/* Activity Chart */}
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
