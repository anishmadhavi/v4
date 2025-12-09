export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  PACKER = 'packer'
}

export interface UserProfile {
  id: string;
  email?: string;
  role: UserRole;
  name: string;
  mobile?: string; // For packers
  pin?: string; // Encrypted or checked via Auth
  organization_id?: string;
  credits?: number;
  company_details?: CompanyDetails;
  integrations?: IntegrationConfig;
  created_at?: string;
}

export interface CompanyDetails {
  name: string;
  gst: string;
  address: string;
}

export interface IntegrationConfig {
  googleDriveConnected: boolean;
  googleSheetConnected: boolean;
  whatsappProvider: 'Interakt' | 'Wati' | 'None';
  ecommercePlatform: 'Shopify' | 'WooCommerce' | 'BigCommerce' | 'None';
}

export interface VideoLog {
  id: string;
  awb: string;
  packer_id: string;
  admin_id: string;
  created_at: string;
  video_url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  whatsapp_status: 'pending' | 'sent' | 'failed';
  customer_phone?: string;
  order_id?: string;
  // Joins
  packer_name?: string; 
}

export interface CreditRequest {
  id: string;
  admin_id: string;
  admin_name?: string; // Joined
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}
