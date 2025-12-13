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

  async disconnectGoogle(adminId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("No active session");

    await fetch(`${FUNCTION_BASE_URL}/google-auth`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ action: 'disconnect', admin_id: adminId })
    });
    
    // Clear local profile update
    await supabase.from('profiles').update({ 
        integrations: { googleConnected: false, googleFolderId: null, googleSheetId: null } 
    }).eq('id', adminId);
  },

  // --- NEW: Automated Powerpack Setup ---
  async setupPowerpackInfrastructure(adminId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("No active session");

    // 1. List folders
    const listRes = await fetch(`${FUNCTION_BASE_URL}/google-auth`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ action: 'list_folders', admin_id: adminId }) 
    });

    if (!listRes.ok) {
        const err = await listRes.json();
        throw new Error(err.error || "Failed to list folders");
    }
    
    const listData = await listRes.json();
    const folders = listData.folders || [];
    
    // Find existing folder or create new one
    let powerpackFolder = folders.find((f: any) => f.name === 'Powerpack');

    if (!powerpackFolder) {
        const createRes = await fetch(`${FUNCTION_BASE_URL}/google-auth`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ action: 'create_folder', name: 'Powerpack', admin_id: adminId })
        });
        
        if (!createRes.ok) {
             const err = await createRes.json();
             throw new Error(err.error || "Failed to create Powerpack folder");
        }
        powerpackFolder = await createRes.json();
    }

    // 2. Create "Powerpack Logs" Sheet inside it
    const sheetRes = await fetch(`${FUNCTION_BASE_URL}/google-auth`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ action: 'create_sheet', admin_id: adminId, folder_id: powerpackFolder.id })
    });

    if (!sheetRes.ok) {
        const err = await sheetRes.json();
        throw new Error(err.error || "Failed to create log sheet");
    }
    const sheet = await sheetRes.json();

    return { folderId: powerpackFolder.id, sheetId: sheet.id };
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
        const errText = await response.text();
        throw new Error(`Token Error: ${errText}`);
    }
    
    return response.json() as Promise<{ uploadUrl: string; folderId?: string; folderName?: string; fileId?: string }>; 
  },

  // --- FULFILLMENT (FIXED URL) ---
  async completeFulfillment(data: {
    stage?: number;
    awb: string;
    videoUrl: string;
    folder_id: string | null;
    duration?: number;
  }) {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("User is not authenticated. Cannot complete fulfillment.");
    }

    // *** FIX: Uses FUNCTION_BASE_URL for consistency ***
    const response = await fetch(
      `${FUNCTION_BASE_URL}/fulfillment`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          stage: data.stage ?? 1,
          awb: data.awb,
          videoUrl: data.videoUrl,
          folder_id: data.folder_id,
          duration: data.duration,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      // This ensures we see the REAL error (404, 500, etc.) in the frontend alert
      throw new Error(`Fulfillment failed (${response.status}): ${errorText}`);
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
