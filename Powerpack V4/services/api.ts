// services/api.ts
// FULL UPDATED FILE — includes new uploadVideoToDrive()
// ------------------------------------------------------

import { supabase } from "../lib/supabase";
import { UserRole, VideoLog, UserProfile } from "../types";

// Resolve Functions URL
const FUNCTIONS_URL =
  import.meta.env.PUBLIC_SUPABASE_FUNCTIONS_URL ||
  `${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1`;

async function getAuthToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return token;
}

export const api = {
  // ------------------------------------------------------
  // AUTH HELPERS
  // ------------------------------------------------------

  async getCurrentUser(): Promise<UserProfile | null> {
    const { data } = await supabase.auth.getUser();
    return (data?.user ?? null) as unknown as UserProfile | null;
  },

  async loginAdmin(email: string, password: string) {
    return supabase.auth.signInWithPassword({ email, password });
  },

  async loginPacker(phone: string, pin: string) {
    const { data, error } = await supabase.rpc("login_packer", {
      phone_input: phone,
      pin_input: pin,
    });
    if (error) throw error;

    // Use OTP token returned by RPC
    const token = data?.token;
    if (!token) throw new Error("Invalid token");

    await supabase.auth.setSession({
      access_token: token,
      refresh_token: token,
    });

    return data.profile;
  },

  async logout() {
    await supabase.auth.signOut();
  },

  // ------------------------------------------------------
  // GOOGLE DRIVE SERVER UPLOAD  (NEW LOGIC)
  // ------------------------------------------------------

  /**
   * Uploads the recorded video to your Supabase function,
   * which uploads it to Google Drive (server → Google).
   */
  async uploadVideoToDrive(filename: string, file: Blob) {
    const token = await getAuthToken();

    const url = `${FUNCTIONS_URL}/delegate-upload-token?filename=${encodeURIComponent(
      filename,
    )}&contentType=video/webm`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: file,
    });

    const json = await res.json();

    if (!res.ok) {
      throw new Error(json.error || "Google Drive upload failed");
    }

    return json as { success: boolean; fileId: string; fileUrl: string };
  },

  // ------------------------------------------------------
  // LOGS + HISTORY
  // ------------------------------------------------------

  async getLogs(userId: string, role: UserRole): Promise<VideoLog[]> {
    let query = supabase.from("video_logs").select("*").order("created_at", {
      ascending: false,
    });

    if (role === "packer") {
      query = query.eq("packer_id", userId);
    } else if (role === "admin") {
      query = query.eq("admin_id", userId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  // ------------------------------------------------------
  // COMPLETION + DB UPDATES
  // ------------------------------------------------------

  async completeFulfillment(payload: { awb: string; videoUrl: string }) {
    const token = await getAuthToken();

    const res = await fetch(`${FUNCTIONS_URL}/complete-fulfillment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to complete fulfillment");

    return json;
  },

  // ------------------------------------------------------
  // USER / PROFILE LOOKUPS
  // ------------------------------------------------------

  async getProfile(): Promise<UserProfile | null> {
    const { data } = await supabase.auth.getUser();
    return (data?.user as UserProfile) ?? null;
  },

  async updateProfile(updates: any) {
    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", updates.id);

    if (error) throw error;
    return data;
  },

  // ------------------------------------------------------
  // ADMIN SUPPORT – PACKER MANAGEMENT
  // ------------------------------------------------------

  async getPackers(adminId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("organization_id", adminId)
      .eq("role", "packer");

    if (error) throw error;
    return data;
  },

  async createPacker(name: string, phone: string, pin: string, adminId: string) {
    const { data, error } = await supabase.rpc("create_packer", {
      name_input: name,
      phone_input: phone,
      pin_input: pin,
      admin_input: adminId,
    });

    if (error) throw error;
    return data;
  },

  // ------------------------------------------------------
  // BILLING / CREDIT USAGE (IF USED IN FUTURE)
  // ------------------------------------------------------

  async getBilling(adminId: string) {
    const { data, error } = await supabase
      .from("billing")
      .select("*")
      .eq("admin_id", adminId);

    if (error) throw error;
    return data;
  },
};
