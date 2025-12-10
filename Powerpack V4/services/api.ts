import { supabase } from '../lib/supabase';
import { UserProfile, VideoLog, CreditRequest, UserRole } from '../types';

// Supabase Edge Function URL prefix
const FUNCTION_BASE_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1';

export const api = {
  // --- Auth & Profiles ---
  
  async getProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
    return data as UserProfile;
  },

  async createPacker(adminId: string, packerData: { name: string; mobile: string; pin: string }) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("No active session");

    const response = await fetch(`${FUNCTION_BASE_URL}/admin-create-user`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ ...packerData, role: 'packer', admin_id: adminId })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to create packer');
    }

    const text = await response.text();
    return text ? JSON.parse(text) : { success: true };
  },

  async deletePacker(packerId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("No active session");

    const response = await fetch(`${FUNCTION_BASE_URL}/admin-user-actions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ action: 'delete', user_id: packerId })
    });

    if (!response.ok) {
        const err = await response.text(); 
        throw new Error('Failed to delete packer: ' + err);
    }
    return true;
  },

  async updatePackerPin(packerId: string, newPin: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("No active session");

    const response = await fetch(`${FUNCTION_BASE_URL}/admin-user-actions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ action: 'update_pin', user_id: packerId, new_pin: newPin })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error('Failed to update PIN: ' + err);
    }
    return true;
  },

  // --- Integrations & Google ---

  async updateIntegrationConfig(userId: string, config: any) {
    const { error } = await supabase
      .from('profiles')
      .update({ integrations: config })
      .eq('id', userId);
    if (error) throw error;
  },

  async initiateGoogleAuth(adminId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("No active session");

    const response = await fetch(`${FUNCTION_BASE_URL}/google-auth`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ action: 'generate_auth_url', admin_id: adminId })
    });

    if (!response.ok) throw new Error("Failed to start Google Auth");
    
    const data = await response.json();
    window.location.href = data.url;
  },

  async getDriveFolders() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return [];

    const response = await fetch(`${FUNCTION_BASE_URL}/google-auth`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ action: 'list_folders' })
    });

    if (!response.ok) return [];
    const data = await response.json();
    return data.folders || [];
  },

  async createDriveFolder(folderName: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("No active session");

    const response = await fetch(`${FUNCTION_BASE_URL}/google-auth`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ action: 'create_folder', name: folderName })
    });

    if (!response.ok) throw new Error("Failed to create folder");
    return await response.json(); 
  },

  // --- Logs & Videos ---

  async getLogs(userId: string, role: UserRole): Promise<VideoLog[]> {
    let query = supabase.from('logs').select('*, profiles:packer_id(name)').order('created_at', { ascending: false });
    
    if (role === UserRole.ADMIN) {
      query = query.eq('admin_id', userId);
    } else if (role === UserRole.PACKER) {
      query = query.eq('packer_id', userId);
    }

    const { data, error } = await query;
    if (error) throw error;
    
    return data.map((log: any) => ({
      ...log,
      packer_name: log.profiles?.name || 'Unknown'
    }));
  },

  // --- Upload Flow ---

  async getUploadToken(filename: string, contentType: string) {
    const session = (await supabase.auth.getSession()).data.session;
    if (!session?.access_token) throw new Error("No active session");

    const response = await fetch(`${FUNCTION_BASE_URL}/delegate-upload-token?filename=${filename}&contentType=${contentType}`, {
        headers: {
             'Authorization': `Bearer ${session.access_token}`
        }
    });

    if (!response.ok) {
        // FIX: Read and throw the actual error message from the backend
        const errText = await response.text();
        throw new Error(`Token Error: ${errText}`);
    }
    
    return response.json() as Promise<{ uploadUrl: string; folderId?: string; folderName?: string }>; 
  },

  // --- FULFILLMENT ---

  async completeFulfillment(data: { awb: string; videoUrl: string; folderId: string; duration?: number }) {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
        throw new Error("User is not authenticated. Cannot complete fulfillment.");
    }

    const response = await fetch(`${FUNCTION_BASE_URL}/fulfillment`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
            awb: data.awb,
            videoUrl: data.videoUrl,
            folder_id: data.folderId, 
            duration: data.duration
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Backend Error:", errorText);
        throw new Error(`Fulfillment failed: ${errorText}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : { success: true };
  },

  // --- Credits ---

  async getCreditRequests(role: UserRole, userId?: string): Promise<CreditRequest[]> {
    let query = supabase.from('credit_requests').select('*, profiles:admin_id(name)').order('created_at', { ascending: false });
    
    if (role === UserRole.ADMIN && userId) {
      query = query.eq('admin_id', userId);
    } else if (role === UserRole.SUPER_ADMIN) {
        query = query.eq('status', 'pending');
    }

    const { data, error } = await query;
    if (error) {
       console.warn("Credit requests fetch failed", error);
       return [];
    }

    return data.map((req: any) => ({
        ...req,
        admin_name: req.profiles?.name
    }));
  },

  async requestCredits(adminId: string, amount: number) {
    const { error } = await supabase.from('credit_requests').insert({
        admin_id: adminId,
        amount: amount,
        status: 'pending'
    });
    if (error) throw error;
  },

  async processCreditRequest(requestId: string, status: 'approved' | 'rejected') {
    const { error } = await supabase.from('credit_requests').update({ status }).eq('id', requestId);
    if (error) throw error;
  },
  
  // --- Admin Data ---
  async getPackers(adminId: string) {
      const { data, error } = await supabase.from('profiles')
        .select('*')
        .eq('role', 'packer')
        .eq('organization_id', adminId);
      
      if (error) throw error;
      return data;
  },

  async getAllAdmins() {
      const { data, error } = await supabase.from('profiles').select('*').eq('role', 'admin');
      if (error) throw error;
      return data;
  }
};
