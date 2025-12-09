import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Lock, User as UserIcon, LogIn, Phone, UserPlus, ArrowLeft, Building2, MapPin, Receipt } from 'lucide-react';

const Login: React.FC = () => {
  const [mode, setMode] = useState<'admin' | 'packer'>('admin');
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Login State
  const [username, setUsername] = useState(''); // Email for admin, Mobile for packer
  const [password, setPassword] = useState(''); // Password for admin, PIN for packer
  
  // Register State
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regGST, setRegGST] = useState('');
  const [regAddress, setRegAddress] = useState('');

  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let email = username;
      // If packer, assume username is mobile. 
      // Convention: mobile numbers map to `[mobile]@packer.app` or similar if using email auth,
      // OR use the email directly if the user entered an email.
      // Assuming packers enter just digits:
      if (mode === 'packer' && !username.includes('@')) {
          email = `${username}@videoverify.app`; 
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) throw error;
      // App.tsx listener will handle redirection
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setLoading(true);

      try {
        // 1. Sign Up Auth User
        const { data, error: authError } = await supabase.auth.signUp({
            email: regEmail,
            password: regPassword,
        });

        if (authError) throw authError;

        if (data.user) {
            // 2. Create Profile Record
            // Note: In production, a Trigger on auth.users is safer, but client-side insert works if RLS allows self-insert on match ID
            const { error: profileError } = await supabase.from('profiles').insert({
                id: data.user.id,
                role: 'admin',
                name: regName,
                company_details: {
                    name: regName,
                    gst: regGST,
                    address: regAddress
                },
                credits: 5,
                integrations: {
                    googleDriveConnected: false,
                    googleSheetConnected: false,
                    whatsappProvider: 'None',
                    ecommercePlatform: 'None'
                }
            });

            if (profileError) throw profileError;
        }
      } catch (err: any) {
          setError(err.message);
          setLoading(false);
      }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative">
        <div className="bg-blue-600 p-6 text-center">
          <h1 className="text-2xl font-bold text-white">VideoVerify</h1>
          <p className="text-blue-100 mt-2">Secure Fulfillment Evidence</p>
        </div>
        
        <div className="p-8">
          {/* Toggle between Admin/Packer (only show when not registering) */}
          {!isRegistering && (
             <div className="flex bg-slate-100 rounded-lg p-1 mb-6">
                <button
                onClick={() => setMode('admin')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                    mode === 'admin' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
                >
                Admin / Owner
                </button>
                <button
                onClick={() => setMode('packer')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                    mode === 'packer' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
                >
                Packer
                </button>
            </div>
          )}

          {/* Registration Header */}
          {isRegistering && (
             <button 
                onClick={() => setIsRegistering(false)} 
                className="mb-4 text-sm text-slate-500 hover:text-blue-600 flex items-center gap-1"
             >
                <ArrowLeft size={16} /> Back to Login
             </button>
          )}

          {/* Forms */}
          {isRegistering ? (
              <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Company / Admin Name</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Building2 size={18} className="text-slate-400" />
                        </div>
                        <input required type="text" value={regName} onChange={e => setRegName(e.target.value)} 
                            className="pl-10 w-full rounded-lg border border-slate-300 py-2.5 text-sm outline-none focus:border-blue-500" placeholder="Acme Logistics" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <UserIcon size={18} className="text-slate-400" />
                        </div>
                        <input required type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} 
                            className="pl-10 w-full rounded-lg border border-slate-300 py-2.5 text-sm outline-none focus:border-blue-500" placeholder="admin@company.com" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Create Password</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Lock size={18} className="text-slate-400" />
                        </div>
                        <input required type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)} minLength={6}
                            className="pl-10 w-full rounded-lg border border-slate-300 py-2.5 text-sm outline-none focus:border-blue-500" placeholder="Min 6 characters" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">GST (Optional)</label>
                        <div className="relative">
                             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Receipt size={18} className="text-slate-400" />
                            </div>
                            <input type="text" value={regGST} onChange={e => setRegGST(e.target.value)} 
                                className="pl-10 w-full rounded-lg border border-slate-300 py-2.5 text-sm outline-none focus:border-blue-500" placeholder="GSTIN" />
                        </div>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">City (Optional)</label>
                        <div className="relative">
                             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <MapPin size={18} className="text-slate-400" />
                            </div>
                            <input type="text" value={regAddress} onChange={e => setRegAddress(e.target.value)} 
                                className="pl-10 w-full rounded-lg border border-slate-300 py-2.5 text-sm outline-none focus:border-blue-500" placeholder="Mumbai" />
                        </div>
                    </div>
                  </div>

                  {error && <div className="text-red-600 text-sm">{error}</div>}

                  <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                    {loading ? 'Creating...' : <><UserPlus size={18} /> Create Account</>}
                  </button>
              </form>
          ) : (
             <form onSubmit={handleLogin} className="space-y-4">
                <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                    {mode === 'admin' ? 'Email Address' : 'Mobile Number'}
                </label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    {mode === 'admin' ? <UserIcon size={18} className="text-slate-400" /> : <Phone size={18} className="text-slate-400" />}
                    </div>
                    <input
                    type={mode === 'admin' ? 'email' : 'text'}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10 w-full rounded-lg border border-slate-300 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder={mode === 'admin' ? 'admin@company.com' : 'e.g. 9876543210'}
                    required
                    />
                </div>
                </div>

                <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                    {mode === 'admin' ? 'Password' : '4-Digit PIN'}
                </label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock size={18} className="text-slate-400" />
                    </div>
                    <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 w-full rounded-lg border border-slate-300 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder={mode === 'admin' ? '••••••••' : '••••'}
                    required
                    />
                </div>
                </div>

                {error && (
                <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm flex items-center">
                    <span className="mr-2">⚠️</span> {error}
                </div>
                )}

                <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                <LogIn size={18} />
                {loading ? 'Logging in...' : 'Login'}
                </button>
            </form>
          )}

          <div className="mt-6 text-center space-y-2">
            {!isRegistering && <a href="#" className="block text-sm text-blue-600 hover:underline">Forgot credentials?</a>}
            
            {/* Create Account Link (Only for Admin Mode) */}
            {!isRegistering && mode === 'admin' && (
                <div className="pt-4 border-t border-slate-100">
                    <span className="text-sm text-slate-500">New to VideoVerify? </span>
                    <button onClick={() => setIsRegistering(true)} className="text-sm font-bold text-blue-600 hover:underline">Create Account</button>
                </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;