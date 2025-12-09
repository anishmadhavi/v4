import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Video, Lock, User, Phone, CheckCircle2, ArrowRight } from 'lucide-react';

const Login: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'admin' | 'packer'>('packer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Packer specific state
  const [mobile, setMobile] = useState('');
  const [pin, setPin] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let loginEmail = '';
      let loginPassword = '';

      if (activeTab === 'packer') {
        // Auto-append domain for packers
        if (!mobile || !pin) throw new Error('Please fill in all fields');
        loginEmail = `${mobile}@packer.app`;
        loginPassword = pin;
      } else {
        // Admin Login
        if (!email || !password) throw new Error('Please fill in all fields');
        loginEmail = email;
        loginPassword = password;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) throw error;
      
    } catch (err: any) {
      console.error(err);
      if (err.message === 'Invalid login credentials') {
         setError('Invalid credentials. If you are a packer, check your Mobile/PIN.');
      } else {
         setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    const emailToReset = activeTab === 'admin' ? email : '';
    if (!emailToReset) {
        alert("Please enter your email address first.");
        return;
    }
    supabase.auth.resetPasswordForEmail(emailToReset).then(({ error }) => {
        if (error) alert(error.message);
        else alert("Password reset link sent to your email.");
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-100">
        
        {/* Header */}
        <div className="bg-blue-600 p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-white/20 p-3 rounded-xl backdrop-blur-sm">
              <Video className="text-white w-8 h-8" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">VideoVerify</h1>
          <p className="text-blue-100 text-sm">Secure Fulfillment Evidence</p>
        </div>

        {/* Tabs */}
        <div className="flex p-2 gap-2 bg-slate-50 border-b border-slate-100">
          <button
            onClick={() => setActiveTab('admin')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'admin' 
                ? 'bg-white text-blue-600 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Admin / Owner
          </button>
          <button
            onClick={() => setActiveTab('packer')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'packer' 
                ? 'bg-white text-blue-600 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Packer
          </button>
        </div>

        {/* Login Form */}
        <div className="p-8 pb-4">
          <form onSubmit={handleLogin} className="space-y-5">
            
            {activeTab === 'packer' ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Mobile Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input
                      type="tel"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      placeholder="9876543210"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">6-Digit PIN</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      placeholder="••••••"
                      required
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Address</label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      placeholder="admin@company.com"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                </div>
              </>
            )}

            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2">
                <span className="font-bold">Error:</span> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
            >
              {loading ? (
                <span>Verifying...</span>
              ) : (
                <>
                  Login <CheckCircle2 size={18} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer Links */}
        <div className="bg-slate-50 px-8 py-4 border-t border-slate-100 space-y-3">
            <div className="flex justify-between items-center text-sm">
                <button 
                    type="button" 
                    onClick={handleForgotPassword}
                    className="text-slate-500 hover:text-blue-600 font-medium transition-colors"
                >
                    Forgot credentials?
                </button>
                
                {activeTab === 'admin' && (
                    <button 
                        type="button"
                        className="text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 group"
                        onClick={() => alert("Please contact Super Admin to create a new organization account.")}
                    >
                        Create Account <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                )}
            </div>
            
            <div className="text-center text-xs text-slate-400 pt-2">
                 v1.0.0 • Secure Video Fulfillment Platform
            </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
