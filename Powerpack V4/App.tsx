import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { api } from './services/api';
import Login from './components/Login';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import AdminPanel from './components/admin-tabs/AdminDashboard';
import PackerInterface from './components/PackerInterface';
import MobilePackerInterface from './components/MobilePackerInterface'; // NEW IMPORT
import { UserProfile, UserRole } from './types';

const App: React.FC = () => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  
  // State to track device type
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

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

    // 2. Listen for auth changes
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

    // 3. Listen for Screen Resize (To switch between Mobile/Desktop UI)
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);

    return () => {
        subscription.unsubscribe();
        window.removeEventListener('resize', handleResize);
    };
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

  // --- ROLE BASED ROUTING ---

  // 1. SUPER ADMIN
  if (userProfile.role === UserRole.SUPER_ADMIN) {
    return <SuperAdminDashboard onLogout={() => supabase.auth.signOut()} />;
  }

  // 2. ADMIN
  if (userProfile.role === UserRole.ADMIN) {
    return <AdminPanel user={userProfile} onLogout={() => supabase.auth.signOut()} />;
  }

  // 3. PACKER (Split into Mobile vs Desktop)
  if (userProfile.role === UserRole.PACKER) {
    if (isMobile) {
        // New Mobile Interface
        return <MobilePackerInterface packer={userProfile} onLogout={() => supabase.auth.signOut()} />;
    } else {
        // Standard Desktop Interface
        return <PackerInterface packer={userProfile} onLogout={() => supabase.auth.signOut()} />;
    }
  }

  return <div className="p-10 text-center">Access Denied: Unknown Role</div>;
};

export default App;
