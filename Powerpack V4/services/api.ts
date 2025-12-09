// src/services/api.ts (or Powerpack V4/services/api.ts)

import { Packer, VideoLog, CreditRequest, IntegrationConfig, User } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ""; 
// If you are not calling any external backend yet and only using Supabase directly,
// you can leave this as "" for now or adjust to your API URL later.

/**
 * Helper: throw readable errors if request fails.
 */
async function ensureOk(res: Response, defaultMessage: string) {
  if (res.ok) return;

  let msg = defaultMessage;
  try {
    const text = await res.text();
    if (text) msg = text;
  } catch {
    // ignore
  }

  throw new Error(msg + ` (status ${res.status})`);
}

export const api = {
  /**
   * Create a new packer for a given admin/organization.
   * We DO NOT parse JSON here because many backends respond with 201/204 and empty body.
   */
  async createPacker(
    adminId: string,
    packer: { name: string; mobile: string; pin: string }
  ): Promise<void> {
    // If you are using a custom backend API, change the URL below.
    // If you are using Supabase directly from frontend, you may not even need fetch at all –
    // your Supabase client would go here instead.
    const res = await fetch(`${API_BASE_URL}/packers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        adminId,
        name: packer.name,
        mobile: packer.mobile,
        pin: packer.pin,
      }),
    });

    // ✅ Will throw an error if HTTP status is not 2xx,
    //    but will NOT try to parse JSON on success.
    await ensureOk(res, "Failed to create packer");

    // No res.json() here – that’s what was causing:
    // "Unexpected end of JSON input"
    return;
  },

  /**
   * Fetch packers for an admin.
   * You can adapt this to your actual backend / Supabase structure.
   */
  async getPackers(adminId: string): Promise<Packer[]> {
    const res = await fetch(`${API_BASE_URL}/packers?adminId=${encodeURIComponent(adminId)}`);
    await ensureOk(res, "Failed to fetch packers");
    // Here we expect a JSON array
    return res.json();
  },

  /**
   * Example: get logs (if you are using an HTTP API for that).
   * Adapt or remove if you instead read directly from Supabase in your components.
   */
  async getVideoLogs(adminId: string): Promise<VideoLog[]> {
    const res = await fetch(`${API_BASE_URL}/videos?adminId=${encodeURIComponent(adminId)}`);
    await ensureOk(res, "Failed to fetch logs");
    return res.json();
  },

  /**
   * Example: resend WhatsApp for a specific log.
   * This is optional and depends on your backend.
   */
  async resendWhatsapp(videoId: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/videos/${videoId}/resend-whatsapp`, {
      method: "POST",
    });
    await ensureOk(res, "Failed to resend WhatsApp");
  },

  /**
   * Example: create a credit request.
   */
  async createCreditRequest(
    adminId: string,
    creditsRequested: number
  ): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/credit-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, creditsRequested }),
    });
    await ensureOk(res, "Failed to create credit request");
  },

  /**
   * Example: save integration settings (WhatsApp, Shopify, etc.).
   */
  async saveIntegrationConfig(
    adminId: string,
    config: IntegrationConfig
  ): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/integration-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, config }),
    });
    await ensureOk(res, "Failed to save integration settings");
  },

  /**
   * Example: admin login – if you use a backend endpoint for auth.
   * If you’re using only Supabase Auth, this would be replaced with supabase.auth calls.
   */
  async login(username: string, password: string): Promise<User> {
    const res = await fetch(`${API_BASE_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    await ensureOk(res, "Failed to login");
    return res.json();
  },
};
