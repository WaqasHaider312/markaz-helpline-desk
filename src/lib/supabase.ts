import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fswpxkikvrkvsvwifvga.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzd3B4a2lrdnJrdnN2d2lmdmdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NTMxMzQsImV4cCI6MjA3NzMyOTEzNH0.Pg5ZqydLxlbKOvTtaqsbcGOlk8JRE2RgsO1aSooGdUU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database Types
export interface Ticket {
  id: string;
  ticket_number: string;
  reseller_id: string;
  reseller_name: string;
  reseller_phone: string;
  order_id: string;
  issue_type: string;
  description: string;
  status: 'Pending' | 'In Progress' | 'Resolved';
  partner_name?: string;
  assigned_agent_id?: string;
  attachment_urls?: string[];
  created_at: string;
  updated_at: string;
  agent_profiles?: any;
  resolved_by?: string | null;
}

export interface Message {
  id: string;
  ticket_id: string;
  sender_type: 'reseller' | 'agent';
  sender_name: string;
  message: string;
  attachment_url?: string;
  created_at: string;
}

export interface CannedMessage {
  id: string;
  agent_id: string;
  message_text: string;
  created_at: string;
}

export interface AgentProfile {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
  role: string;
  created_at: string;
}

export interface InternalNote {
  id: string;
  ticket_id: string;
  agent_id: string;
  agent_name: string;
  note_text: string;
  created_at: string;
}
