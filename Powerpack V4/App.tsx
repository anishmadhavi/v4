import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { api } from './services/api';
import Login from './components/Login';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import AdminPanel from './components/AdminDashboard';
import PackerInterface from './components/PackerInterface';
import { UserProfile, UserRole } from './types';

const App: React.FC = () => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    // 1. Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // 2. Listen for changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const profile = await api.getProfile(userId);
      setUserProfile(profile);
    } catch (error) {
      console.error("Profile fetch error", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50 text-slate-500">Connecting to VideoVerify...</div>;

  if (!session || !userProfile) {
    return <Login />;
  }

  // Role Based Routing
  if (userProfile.role === UserRole.SUPER_ADMIN) {
    return <SuperAdminDashboard onLogout={() => supabase.auth.signOut()} />;
  }

  if (userProfile.role === UserRole.ADMIN) {
    return <AdminPanel user={userProfile} onLogout={() => supabase.auth.signOut()} />;
  }

  if (userProfile.role === UserRole.PACKER) {
    return <PackerInterface packer={userProfile} onLogout={() => supabase.auth.signOut()} />;
  }

  return <div className="p-10 text-center">Access Denied: Unknown Role</div>;
};

export default App;