import { UserRole, VideoLog, CreditRequest, UserProfile } from '../types';

interface StoredUser extends UserProfile {
  password?: string;
}

const STORAGE_KEYS = {
  USERS: 'vv_users',
  PACKERS: 'vv_packers',
  LOGS: 'vv_logs',
  CREDIT_REQUESTS: 'vv_credit_requests',
  CURRENT_USER: 'vv_current_user'
};

// Initial Mock Data
const initializeStorage = () => {
  if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
    const superAdmin: StoredUser = {
      id: 'sa-1',
      name: 'Super Admin',
      role: UserRole.SUPER_ADMIN,
      email: 'super@admin.com',
      password: 'password123'
    };
    const demoAdmin: StoredUser = {
      id: 'adm-1',
      name: 'Demo Enterprise',
      role: UserRole.ADMIN,
      email: 'admin@demo.com',
      password: 'password123',
      credits: 50,
      company_details: { name: 'Demo Ent.', gst: '29ABCDE1234F1Z5', address: '123 Tech Park, Bangalore' },
      integrations: {
        googleDriveConnected: true,
        googleSheetConnected: true,
        whatsappProvider: 'Interakt',
        ecommercePlatform: 'Shopify'
      }
    };
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify([superAdmin, demoAdmin]));
  }
  if (!localStorage.getItem(STORAGE_KEYS.PACKERS)) {
    const demoPacker: StoredUser = {
      id: 'p-1',
      name: 'John Packer',
      role: UserRole.PACKER,
      mobile: '9876543210',
      pin: '1234',
      organization_id: 'adm-1'
    };
    localStorage.setItem(STORAGE_KEYS.PACKERS, JSON.stringify([demoPacker]));
  }
};

initializeStorage();

export const storage = {
  getUsers: (): StoredUser[] => JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]'),
  setUsers: (users: StoredUser[]) => localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users)),
  
  getPackers: (): StoredUser[] => JSON.parse(localStorage.getItem(STORAGE_KEYS.PACKERS) || '[]'),
  setPackers: (packers: StoredUser[]) => localStorage.setItem(STORAGE_KEYS.PACKERS, JSON.stringify(packers)),

  getLogs: (): VideoLog[] => JSON.parse(localStorage.getItem(STORAGE_KEYS.LOGS) || '[]'),
  addLog: (log: VideoLog) => {
    const logs = storage.getLogs();
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify([log, ...logs]));
  },
  updateLog: (updatedLog: VideoLog) => {
    const logs = storage.getLogs().map(l => l.id === updatedLog.id ? updatedLog : l);
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs));
  },

  getCreditRequests: (): CreditRequest[] => JSON.parse(localStorage.getItem(STORAGE_KEYS.CREDIT_REQUESTS) || '[]'),
  addCreditRequest: (req: CreditRequest) => {
    const reqs = storage.getCreditRequests();
    localStorage.setItem(STORAGE_KEYS.CREDIT_REQUESTS, JSON.stringify([req, ...reqs]));
  },
  updateCreditRequest: (updatedReq: CreditRequest) => {
    const reqs = storage.getCreditRequests().map(r => r.id === updatedReq.id ? updatedReq : r);
    localStorage.setItem(STORAGE_KEYS.CREDIT_REQUESTS, JSON.stringify(reqs));
  },

  getCurrentUser: (): StoredUser | null => {
    const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    return stored ? JSON.parse(stored) : null;
  },
  setCurrentUser: (user: StoredUser | null) => {
    if (user) localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  }
};