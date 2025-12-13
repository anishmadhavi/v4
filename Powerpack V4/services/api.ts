import { supabase } from '../lib/supabase';
import { UserProfile, VideoLog, CreditRequest, UserRole } from '../types';

// --- URL SANITIZATION ---
const rawUrl = import.meta.env.VITE_SUPABASE_URL || "";
const cleanUrl = rawUrl.replace(/\/$/, ""); 
const FUNCTION_BASE_URL = `${cleanUrl}/functions/v1`;

// --- HELPER: Get Session Token ---
async function getSessionToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("No active session. Please login again.");
  }
  return session.access_token;
}

export const api = {
  // ========================================
  // AUTH & PROFILES
  // ========================================
  
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

  async updateProfile(userId: string, updates: Partial<UserProfile>) {
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId);
    
    if (error) throw error;
    return true;
  },

  // ========================================
  // PACKER MANAGEMENT
  // ========================================

  async createPacker(adminId: string, packerData: { name: string; mobile: string; pin: string }) {
    const token = await getSessionToken();

    const response = await fetch(`${FUNCTION_BASE_URL}/admin-create-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ 
        ...packerData, 
        role: 'packer', 
        admin_id: adminId 
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Create packer failed:', errorText);
      throw new Error(errorText || 'Failed to create packer');
    }

    const text = await response.text();
    return text ? JSON.parse(text) : { success: true };
  },

  async getPackers(adminId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'packer')
      .eq('organization_id', adminId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching packers:', error);
      throw error;
    }
    return data;
  },

  async deletePacker(packerId: string) {
    const token = await getSessionToken();

    const response = await fetch(`${FUNCTION_BASE_URL}/admin-user-actions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ 
        action: 'delete', 
        user_id: packerId 
      })
    });

    if (!response.ok) {
      const err = await response.text(); 
      console.error('Delete packer failed:', err);
      throw new Error('Failed to delete packer: ' + err);
    }
    return true;
  },

  async updatePackerPin(packerId: string, newPin: string) {
    const token = await getSessionToken();

    const response = await fetch(`${FUNCTION_BASE_URL}/admin-user-actions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ 
        action: 'update_pin', 
        user_id: packerId, 
        new_pin: newPin 
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Update PIN failed:', err);
      throw new Error('Failed to update PIN: ' + err);
    }
    return true;
  },

  // ========================================
  // GOOGLE INTEGRATION
  // ========================================

  async updateIntegrationConfig(userId: string, config: any) {
    const { error } = await supabase
      .from('profiles')
      .update({ integrations: config })
      .eq('id', userId);
    
    if (error) {
      console.error('Error updating integration config:', error);
      throw error;
    }
    return true;
  },

  async initiateGoogleAuth(adminId: string) {
    const token = await getSessionToken();

    const response = await fetch(`${FUNCTION_BASE_URL}/google-auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ 
        action: 'generate_auth_url', 
        admin_id: adminId 
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Google auth initiation failed:', err);
      throw new Error("Failed to start Google Auth");
    }
    
    const data = await response.json();
    
    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error("No auth URL returned");
    }
  },

  async exchangeGoogleCode(code: string, adminId: string) {
    const token = await getSessionToken();

    const response = await fetch(`${FUNCTION_BASE_URL}/google-auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ 
        action: 'exchange_code', 
        code, 
        admin_id: adminId 
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Google code exchange failed:', err);
      throw new Error("Failed to exchange Google code");
    }
    
    return response.json();
  },

  async disconnectGoogle(adminId: string) {
    const token = await getSessionToken();

    const response = await fetch(`${FUNCTION_BASE_URL}/google-auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ 
        action: 'disconnect', 
        admin_id: adminId 
      })
    });

    if (!response.ok) {
      console.warn('Google disconnect warning:', await response.text());
    }
    
    // Also clear local profile
    await supabase.from('profiles').update({ 
      google_auth_token: null,
      integrations: { 
        googleConnected: false, 
        googleFolderId: null, 
        googleSheetId: null 
      } 
    }).eq('id', adminId);

    return true;
  },

  async setupPowerpackInfrastructure(adminId: string) {
    const token = await getSessionToken();

    console.log("📁 Setting up Powerpack infrastructure...");

    // 1. List existing folders
    const listRes = await fetch(`${FUNCTION_BASE_URL}/google-auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ 
        action: 'list_folders', 
        admin_id: adminId 
      })
    });

    if (!listRes.ok) {
      const err = await listRes.json();
      throw new Error(err.error || "Failed to list folders");
    }
    
    const listData = await listRes.json();
    const folders = listData.folders || [];
    
    let powerpackFolder = folders.find((f: any) => f.name === 'Powerpack');

    // 2. Create Powerpack folder if not exists
    if (!powerpackFolder) {
      console.log("📁 Creating Powerpack folder...");
      
      const createRes = await fetch(`${FUNCTION_BASE_URL}/google-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          action: 'create_folder', 
          name: 'Powerpack', 
          admin_id: adminId 
        })
      });
      
      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error || "Failed to create Powerpack folder");
      }
      powerpackFolder = await createRes.json();
      console.log("✅ Powerpack folder created:", powerpackFolder.id);
    } else {
      console.log("✅ Powerpack folder exists:", powerpackFolder.id);
    }

    // 3. Create Google Sheet inside Powerpack folder
    console.log("📊 Creating Powerpack Logs sheet...");
    
    const sheetRes = await fetch(`${FUNCTION_BASE_URL}/google-auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ 
        action: 'create_sheet', 
        admin_id: adminId, 
        folder_id: powerpackFolder.id 
      })
    });

    if (!sheetRes.ok) {
      const err = await sheetRes.json();
      throw new Error(err.error || "Failed to create log sheet");
    }
    
    const sheet = await sheetRes.json();
    console.log("✅ Sheet created:", sheet.id);

    // 4. Update profile with IDs
    await supabase.from('profiles').update({
      integrations: {
        googleConnected: true,
        googleFolderId: powerpackFolder.id,
        googleSheetId: sheet.id
      }
    }).eq('id', adminId);

    return { 
      folderId: powerpackFolder.id, 
      sheetId: sheet.id 
    };
  },

  // ========================================
  // VIDEO UPLOAD & FULFILLMENT
  // ========================================

  async getUploadToken(filename: string, contentType: string) {
    const token = await getSessionToken();

    console.log(`🎫 Requesting upload token for: ${filename}`);

    const response = await fetch(
      `${FUNCTION_BASE_URL}/delegate-upload-token?filename=${encodeURIComponent(filename)}&contentType=${encodeURIComponent(contentType)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('Upload token error:', errText);
      throw new Error(`Token Error: ${errText}`);
    }
    
    const data = await response.json();
    console.log("✅ Upload token received");
    
    return data as { 
      uploadUrl: string; 
      folderId?: string; 
      folderName?: string; 
    };
  },

  async completeFulfillment(data: {
    stage?: number;
    awb: string;
    videoUrl: string;
    folder_id: string | null;
    duration?: number;
  }) {
    const token = await getSessionToken();

    console.log(`📋 Completing fulfillment for: ${data.awb}`);

    const targetUrl = `${FUNCTION_BASE_URL}/fulfillment`;

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        stage: data.stage ?? 1,
        awb: data.awb,
        video_url: data.videoUrl,  // ✅ FIXED: Using snake_case to match Edge Function
        folder_id: data.folder_id,
        duration: data.duration,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Fulfillment failed (${response.status}):`, errorText);
      throw new Error(`Fulfillment failed (${response.status}): ${errorText}`);
    }

    const text = await response.text();
    const result = text ? JSON.parse(text) : { success: true };
    
    console.log("✅ Fulfillment complete:", result);
    return result;
  },

  // ========================================
  // LOGS & ANALYTICS
  // ========================================

  async getLogs(userId: string, role: UserRole): Promise<VideoLog[]> {
    let query = supabase
      .from('logs')
      .select('*, profiles:packer_id(name)')
      .order('created_at', { ascending: false });
    
    if (role === UserRole.ADMIN) {
      query = query.eq('admin_id', userId);
    } else if (role === UserRole.PACKER) {
      query = query.eq('packer_id', userId);
    }

    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching logs:', error);
      throw error;
    }
    
    return data.map((log: any) => ({
      ...log,
      packer_name: log.profiles?.name || 'Unknown'
    }));
  },

  async getLogsByDateRange(adminId: string, startDate: string, endDate: string) {
    const { data, error } = await supabase
      .from('logs')
      .select('*, profiles:packer_id(name)')
      .eq('admin_id', adminId)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching logs by date:', error);
      throw error;
    }

    return data;
  },

  async getLogStats(adminId: string) {
    const { data, error } = await supabase
      .from('logs')
      .select('status, whatsapp_status')
      .eq('admin_id', adminId);

    if (error) {
      console.error('Error fetching log stats:', error);
      throw error;
    }

    const total = data.length;
    const completed = data.filter(l => l.status === 'completed').length;
    const pending = data.filter(l => l.whatsapp_status === 'Pending').length;

    return { total, completed, pending };
  },

  // ========================================
  // CREDITS MANAGEMENT
  // ========================================

  async getCreditRequests(role: UserRole, userId?: string): Promise<CreditRequest[]> {
    let query = supabase
      .from('credit_requests')
      .select('*, profiles:admin_id(name)')
      .order('created_at', { ascending: false });
    
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
    const { error } = await supabase
      .from('credit_requests')
      .insert({
        admin_id: adminId,
        amount: amount,
        status: 'pending'
      });
    
    if (error) {
      console.error('Error requesting credits:', error);
      throw error;
    }
    return true;
  },

  async processCreditRequest(requestId: string, status: 'approved' | 'rejected') {
    const { error } = await supabase
      .from('credit_requests')
      .update({ status })
      .eq('id', requestId);
    
    if (error) {
      console.error('Error processing credit request:', error);
      throw error;
    }
    return true;
  },
  
  // ========================================
  // ADMIN DATA
  // ========================================

  async getAllAdmins() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'admin')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching admins:', error);
      throw error;
    }
    return data;
  },

  // ========================================
  // HEALTH CHECK
  // ========================================

  async checkEdgeFunctionHealth() {
    try {
      const token = await getSessionToken();
      
      // Test fulfillment endpoint
      const response = await fetch(`${FUNCTION_BASE_URL}/fulfillment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ stage: 2, log_id: 'health-check' })
      });

      return {
        fulfillment: response.ok,
        status: response.status
      };
    } catch (e: any) {
      console.error('Health check failed:', e);
      return {
        fulfillment: false,
        error: e.message
      };
    }
  }
};
