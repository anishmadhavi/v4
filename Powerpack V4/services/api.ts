import { supabase } from '../lib/supabase';
import { UserProfile, VideoLog, CreditRequest, UserRole } from '../types';

// Mock function URL prefix (would be your actual Supabase Function URL in production)
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
    // In a real app, this calls an edge function to create a supabase auth user safely
    const response = await fetch(`${FUNCTION_BASE_URL}/admin-create-user`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify({ ...packerData, role: 'packer', admin_id: adminId })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to create packer');
    }

    // FIX: Check if response has body before parsing JSON
    const text = await response.text();
    return text ? JSON.parse(text) : { success: true };
  },

  async deletePacker(packerId: string) {
    // Option 1: Call Edge Function (Recommended if you need to delete Auth User too)
    /*
    const response = await fetch(`${FUNCTION_BASE_URL}/admin-delete-user`, {
        method: 'POST', // or DELETE
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify({ user_id: packerId })
    });
    if (!response.ok) throw new Error('Failed to delete packer');
    */

    // Option 2: Direct DB Delete (Relies on RLS allowing Admins to delete their packers)
    const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', packerId);
    
    if (error) throw error;
    return true;
  },

  async updateIntegrationConfig(userId: string, config: any) {
    const { error } = await supabase
      .from('profiles')
      .update({ integrations: config })
      .eq('id', userId);
    if (error) throw error;
  },

  // --- Logs & Videos ---

  async getLogs(userId: string, role: UserRole): Promise<VideoLog[]> {
    let query = supabase.from('video_logs').select('*, profiles:packer_id(name)').order('created_at', { ascending: false });
    
    if (role === UserRole.ADMIN) {
      query = query.eq('admin_id', userId);
    } else if (role === UserRole.PACKER) {
      query = query.eq('packer_id', userId);
    }

    const { data, error } = await query;
    if (error) throw error;
    
    // Flatten packer name
    return data.map((log: any) => ({
      ...log,
      packer_name: log.profiles?.name || 'Unknown'
    }));
  },

  // --- Upload Flow ---

  async getUploadToken(filename: string, contentType: string) {
    // Step 1: Get Signed URL from Edge Function
    const session = (await supabase.auth.getSession()).data.session;
    const response = await fetch(`${FUNCTION_BASE_URL}/delegate-upload-token?filename=${filename}&contentType=${contentType}`, {
        headers: {
             'Authorization': `Bearer ${session?.access_token}`
        }
    });
    if (!response.ok) throw new Error('Failed to get upload token');
    return response.json(); // Expected: { uploadUrl: '...' }
  },

  async completeFulfillment(data: { awb: string; videoUrl: string; duration?: number }) {
    // Step 3: Webhook to trigger processing
    const session = (await supabase.auth.getSession()).data.session;
    const response = await fetch(`${FUNCTION_BASE_URL}/fulfillment`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        throw new Error('Fulfillment failed');
    }

    // FIX: Safety check for empty response body
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
    if (error) throw error;

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
    // Complex logic (transaction) should be in Edge Function, but simple update here
    const { error } = await supabase.from('credit_requests').update({ status }).eq('id', requestId);
    if (error) throw error;
    
    // If approved, trigger function to add credits (or trigger via database webhook)
    if (status === 'approved') {
        // Call edge function to safely increment credits
        // fetch(`${FUNCTION_BASE_URL}/add-credits`, ...)
    }
  },
  
  // --- Admin Data ---
  async getPackers(adminId: string) {
      const { data, error } = await supabase.from('profiles').select('*').eq('role', 'packer').eq('organization_id', adminId);
      if (error) throw error;
      return data;
  },

  async getAllAdmins() {
      const { data, error } = await supabase.from('profiles').select('*').eq('role', 'admin');
      if (error) throw error;
      return data;
  }
};
