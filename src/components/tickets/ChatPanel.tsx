import React from 'react';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTickets } from '@/contexts/TicketsContext';
import { supabase, Ticket, Message, InternalNote } from '@/lib/supabase';
import { MessageCircle, ChevronRight, Paperclip, X, Loader2, Upload, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { MediaViewer } from './MediaViewer';
import { FileText } from 'lucide-react';
import { useKeyboardShortcuts } from './KeyboardShortcuts';

interface ChatPanelProps {
  ticketId: string | null;
  onToggleInfo: () => void;
  showInfo: boolean;
  onSelectTicket?: (ticketId: string) => void;
}

interface CannedMessage {
  id: string;
  message_text: string;
  shortcut_name?: string;
}

interface ResellerProfile {
  reseller_status: 'blocked' | 'restricted' | 'genuine';
  ticket_quota: number;
}

// Utility function to make links clickable
const linkifyText = (text: string): React.ReactNode => {
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
  const parts = text.split(urlRegex);
  
  return parts.map((part, index) => {
    const isUrl = part && (part.startsWith('http://') || part.startsWith('https://') || part.startsWith('www.'));
    
    if (isUrl) {
      const url = part.startsWith('http') ? part : `https://${part}`;
      return React.createElement('a', {
        key: index,
        href: url,
        target: '_blank',
        rel: 'noopener noreferrer',
        className: 'text-blue-500 hover:text-blue-600 underline break-all'
      }, part);
    }
    return part;
  });
};

const linkifyTextWhite = (text: string): React.ReactNode => {
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
  const parts = text.split(urlRegex);
  
  return parts.map((part, index) => {
    const isUrl = part && (part.startsWith('http://') || part.startsWith('https://') || part.startsWith('https://') || part.startsWith('www.'));
    
    if (isUrl) {
      const url = part.startsWith('http') ? part : `https://${part}`;
      return React.createElement('a', {
        key: index,
        href: url,
        target: '_blank',
        rel: 'noopener noreferrer',
        className: 'text-white underline hover:text-blue-100 break-all'
      }, part);
    }
    return part;
  });
};

const ChatPanel = ({ ticketId, onToggleInfo, showInfo, onSelectTicket }: ChatPanelProps) => {
  const { profile } = useAuth();
  const { tickets, refreshTickets } = useTickets();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [internalNotes, setInternalNotes] = useState<InternalNote[]>([]);
  const [activeTab, setActiveTab] = useState<'reply' | 'note'>('reply');
  const [replyText, setReplyText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showCannedMessages, setShowCannedMessages] = useState(false);
  const [cannedMessages, setCannedMessages] = useState<CannedMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<any>(null);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgentForAssign, setSelectedAgentForAssign] = useState('');
  const [activities, setActivities] = useState<any[]>([]);
  const [filteredCannedMessages, setFilteredCannedMessages] = useState<CannedMessage[]>([]);
  const [mediaViewer, setMediaViewer] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showApprovalPopup, setShowApprovalPopup] = useState(false);
  const [showResellerTicketsModal, setShowResellerTicketsModal] = useState(false);
  const [resellerTickets, setResellerTickets] = useState<Ticket[]>([]);
  const [resellerTicketsDisplay, setResellerTicketsDisplay] = useState<Ticket[]>([]);
  const [resellerTicketsOffset, setResellerTicketsOffset] = useState(5);
  const [previousTicketId, setPreviousTicketId] = useState<string | null>(null);
  const [selectedCannedIndex, setSelectedCannedIndex] = useState(0);
  const [resellerTicketCount, setResellerTicketCount] = useState(0);
  const [approvalData, setApprovalData] = useState<{
    resellerName: string;
    resellerId: string;
    currentQuota: number;
    activeCount: number;
  } | null>(null);

  useEffect(() => {
    if (ticketId) {
      const currentTicket = tickets.find(t => t.id === ticketId);
      
      if (currentTicket) {
        setTicket(currentTicket);
      } else {
        // Ticket not in loaded tickets, fetch from database
        fetchSingleTicket(ticketId);
      }
      
      fetchTicketData();
      fetchCannedMessages();
      const unsubscribe = subscribeToUpdates();
      
      return () => {
        unsubscribe();
      };
    }
  }, [ticketId, tickets]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, internalNotes]);

  const fetchAgents = async () => {
    try {
      const { data } = await supabase
        .from('agent_profiles')
        .select('id, full_name')
        .order('full_name');
      setAgents(data || []);
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  useKeyboardShortcuts({
    onSendMessage: () => {
      if (activeTab === 'reply' && (replyText.trim() || attachment)) {
        handleSendReply();
      } else if (activeTab === 'note' && noteText.trim()) {
        handleAddNote();
      }
    },
    onAssignTicket: () => setShowAssignDialog(true)
  });

  const handleAssignTicket = async () => {
    if (!selectedAgentForAssign || !ticketId) return;

    try {
      const { error } = await supabase
        .from('tickets')
        .update({ 
          assigned_agent_id: selectedAgentForAssign === 'unassign' ? null : selectedAgentForAssign 
        })
        .eq('id', ticketId);

      if (error) throw error;

      toast.success('Ticket assigned');
      setShowAssignDialog(false);
      setSelectedAgentForAssign('');
    } catch (error) {
      console.error('Error assigning ticket:', error);
      toast.error('Failed to assign ticket');
    }
  };

  const fetchTicketData = async () => {
    if (!ticketId) return;

    try {
      const { data: messagesData } = await supabase
        .from('messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      const { data: notesData } = await supabase
        .from('internal_notes')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      const { data: activitiesData } = await supabase
        .from('ticket_activities')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      setActivities(activitiesData || []);
      setMessages(messagesData || []);
      setInternalNotes(notesData || []);
    } catch (error) {
      console.error('Error fetching ticket data:', error);
    }
  };

  const fetchSingleTicket = async (ticketId: string) => {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*, agent_profiles!assigned_agent_id(full_name)')
        .eq('id', ticketId)
        .single();
      
      if (error) throw error;
      setTicket(data);
    } catch (error) {
      console.error('Error fetching ticket:', error);
    }
  };

  const fetchCannedMessages = async () => {
    if (!profile) return;

    try {
      const { data } = await supabase
        .from('canned_messages')
        .select('*')
        .order('created_at', { ascending: false });

      setCannedMessages(data || []);
    } catch (error) {
      console.error('Error fetching canned messages:', error);
    }
  };

  const loadResellerTickets = async () => {
  if (!ticket) return;
  
  if (!previousTicketId) {
    setPreviousTicketId(ticketId);
  }
  
  try {
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('reseller_phone', ticket.reseller_phone)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    setResellerTickets(data || []);
    setResellerTicketsDisplay((data || []).slice(0, 5));
    setResellerTicketsOffset(5);
    setShowResellerTicketsModal(true);
  } catch (error) {
    console.error('Error loading reseller tickets:', error);
    toast.error('Failed to load tickets');
  }
};

  const loadMoreResellerTickets = () => {
    const nextBatch = resellerTickets.slice(0, resellerTicketsOffset + 5);
    setResellerTicketsDisplay(nextBatch);
    setResellerTicketsOffset(prev => prev + 5);
  };

  useEffect(() => {
  const fetchResellerCount = async () => {
    if (!ticket?.reseller_phone) return;
    
    const { count, error } = await supabase
      .from('tickets')
      .select('*', { count: 'exact', head: true })
      .eq('reseller_phone', ticket.reseller_phone);
    
    if (!error) {
      setResellerTicketCount(count || 0);
    }
  };
  
  fetchResellerCount();
}, [ticket?.reseller_phone]);

  const subscribeToUpdates = () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`ticket-${ticketId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tickets' },
        (payload) => {
          setTicket(prev => prev?.id === payload.new.id 
            ? { ...prev, ...payload.new } 
            : prev
          );
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Handle file selection from input
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    validateAndSetFile(file);
  };

  // Validate and set file as attachment
  const validateAndSetFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Max 5MB.');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'video/mp4', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type');
      return;
    }

    setAttachment(file);
  };

  // Handle paste event for screenshot
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          e.preventDefault();
          validateAndSetFile(blob);
          toast.success('Screenshot pasted!');
          return;
        }
      }
    }
  };

  // Handle drag & drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      validateAndSetFile(files[0]);
    }
  };

  const removeAttachment = () => {
    setAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadAttachment = async (file: File): Promise<string | null> => {
    try {
      setIsUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${ticketId}/${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('ticket-attachments')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('ticket-attachments')
        .getPublicUrl(fileName);

      return data.publicUrl;
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Upload failed');
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const checkApprovalNeeded = async (resellerId: string) => {
    try {
      // Get reseller profile
      const { data: profile } = await supabase
        .from('reseller_profiles')
        .select('reseller_status, ticket_quota')
        .eq('reseller_id', resellerId)
        .single();

      // Only for genuine users
      if (!profile || profile.reseller_status !== 'genuine') return;

      // Get all tickets for this reseller
      const { data: resellerTickets } = await supabase
        .from('tickets')
        .select('status')
        .eq('reseller_id', resellerId)
        .in('status', ['Pending', 'In Progress']);

      if (!resellerTickets) return;

      const activeCount = resellerTickets.length;
      const allInProgress = resellerTickets.every(t => t.status === 'In Progress');
      const atQuotaLimit = activeCount >= profile.ticket_quota;

      // Show popup if all conditions met
      if (allInProgress && atQuotaLimit) {
        setApprovalData({
          resellerName: ticket?.reseller_name || 'Reseller',
          resellerId: resellerId,
          currentQuota: profile.ticket_quota,
          activeCount: activeCount
        });
        setShowApprovalPopup(true);
      }
    } catch (error) {
      console.error('Error checking approval:', error);
    }
  };

  const handleApproveMoreTickets = async () => {
    if (!approvalData) return;

    try {
      const newQuota = approvalData.currentQuota + 3;
      
      const { error } = await supabase
        .from('reseller_profiles')
        .update({ ticket_quota: newQuota })
        .eq('reseller_id', approvalData.resellerId);

      if (error) throw error;

      toast.success(`Quota increased to ${newQuota} tickets`);
      setShowApprovalPopup(false);
      setApprovalData(null);
    } catch (error) {
      console.error('Error approving quota:', error);
      toast.error('Failed to increase quota');
    }
  };

  const handleRestrictReseller = async () => {
    if (!approvalData) return;

    try {
      const { error } = await supabase
        .from('reseller_profiles')
        .update({ 
          reseller_status: 'restricted',
          ticket_quota: 3
        })
        .eq('reseller_id', approvalData.resellerId);

      if (error) throw error;

      toast.success('Reseller restricted to 3 tickets');
      setShowApprovalPopup(false);
      setApprovalData(null);
    } catch (error) {
      console.error('Error restricting reseller:', error);
      toast.error('Failed to restrict reseller');
    }
  };

  const handleSendReply = async () => {
    if ((!replyText.trim() && !attachment) || !ticketId || !profile) return;

    setSending(true);
    try {
      let attachmentUrl = null;
      if (attachment) {
        attachmentUrl = await uploadAttachment(attachment);
        if (!attachmentUrl) {
          setSending(false);
          return;
        }
      }

      const newMessage = {
        ticket_id: ticketId,
        sender_type: 'agent' as const,
        sender_name: profile.full_name,
        message: replyText.trim() || 'Attachment',
        attachment_url: attachmentUrl,
      };

      const { data, error } = await supabase
        .from('messages')
        .insert(newMessage)
        .select()
        .single();

      if (error) throw error;

      // Immediately add message to state
      setMessages(prev => [...prev, data]);

      await supabase
        .from('tickets')
        .update({
          latest_message: replyText.trim() || 'Attachment',
          latest_message_at: new Date().toISOString(),
          latest_message_sender: 'agent',
          unread_by_agent: false
        })
        .eq('id', ticketId);

      const updates: any = { updated_at: new Date().toISOString() };
      if (ticket?.status === 'Pending') {
        updates.status = 'In Progress';
      }
      if (!ticket?.assigned_agent_id && profile?.id) {
        updates.assigned_agent_id = profile.id;
      }
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('tickets')
          .update(updates)
          .eq('id', ticketId);

        if (!updateError) {
          setTicket(prev => prev ? {...prev, ...updates} : null);
          refreshTickets(); // No await - runs in background
        }
        
        if (updates.assigned_agent_id) {
          await supabase.from('ticket_activities').insert({
            ticket_id: ticketId,
            activity_type: 'assigned',
            actor_name: profile?.full_name || 'Agent',
            details: `${profile?.full_name} assigned ticket to self`
          });
        }
      }

      // Check if approval popup needed after sending reply
      if (ticket?.reseller_id) {
        checkApprovalNeeded(ticket.reseller_id); // No await
      }

      setReplyText('');
      setAttachment(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      toast.success('Message sent');
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || !ticketId || !profile) return;

    setSending(true);
    try {
      const { data, error } = await supabase
        .from('internal_notes')
        .insert({
          ticket_id: ticketId,
          agent_id: profile.id,
          agent_name: profile.full_name,
          note_text: noteText.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      setInternalNotes((prev) => [...prev, data]);

      setNoteText('');
      toast.success('Note added');
    } catch (error) {
      console.error('Error adding note:', error);
      toast.error('Failed to add note');
    } finally {
      setSending(false);
    }
  };

  const handleCannedMessageSelect = (messageText: string) => {
    setReplyText(messageText);
    setShowCannedMessages(false);
    
    // Auto-expand textarea
    setTimeout(() => {
      const textarea = document.querySelector('textarea[placeholder*="Type message"]') as HTMLTextAreaElement;
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
      }
    }, 0);
  };

  const handleReplyTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setReplyText(value);

    const match = value.match(/\/(\w*)$/);
    if (match) {
      const searchTerm = match[1].toLowerCase();
      setShowCannedMessages(true);
      
      if (searchTerm === '') {
        setFilteredCannedMessages(cannedMessages);
      } else {
        const filtered = cannedMessages.filter(msg => 
          msg.shortcut_name?.toLowerCase().includes(searchTerm)
        );
        setFilteredCannedMessages(filtered);
      }
    } else {
      setShowCannedMessages(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (!ticketId) {
    return (
      <div className="flex-1 min-w-0 flex flex-col items-center justify-center bg-white">
        <MessageCircle className="h-16 w-16 text-gray-400 mb-4" />
        <p className="text-lg text-gray-600">Select a ticket to view conversation</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white relative">
      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-primary/10 border-4 border-dashed border-primary flex items-center justify-center">
          <div className="text-center">
            <Upload className="h-16 w-16 text-primary mx-auto mb-4" />
            <p className="text-xl font-semibold text-primary">Drop file here</p>
          </div>
        </div>
      )}

      {/* Approval Popup Modal */}
      {showApprovalPopup && approvalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 text-white">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-white/20 p-2 rounded-lg">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold">Decision Needed</h3>
              </div>
              <p className="text-blue-100 text-sm">
                Reseller quota approval required
              </p>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-600">Reseller</span>
                  <span className="text-base font-bold text-gray-900">{approvalData.resellerName}</span>
                </div>
                
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-600">Active Tickets</span>
                  <span className="text-base font-bold text-orange-600">{approvalData.activeCount}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600">Current Quota</span>
                  <span className="text-base font-bold text-blue-600">{approvalData.currentQuota}</span>
                </div>
              </div>

              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                <p className="text-sm text-gray-700">
                  All <span className="font-semibold">{approvalData.activeCount}</span> tickets are now <span className="font-semibold text-blue-600">In Progress</span>. 
                  Should this reseller be allowed to create more tickets?
                </p>
              </div>

              <div className="pt-2">
                <p className="text-center text-sm font-medium text-gray-700 mb-3">
                  Allow 3 more tickets?
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="p-6 bg-gray-50 border-t border-gray-200 flex gap-3">
              <Button
                onClick={handleApproveMoreTickets}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg shadow-md hover:shadow-lg transition-all"
              >
                ✓ Yes - Allow {approvalData.currentQuota + 3} Total
              </Button>
              
              <Button
                onClick={handleRestrictReseller}
                variant="outline"
                className="flex-1 border-2 border-red-500 text-red-600 hover:bg-red-50 font-semibold py-3 rounded-lg transition-all"
              >
                ✕ No - Restrict Account
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className="sticky top-0 p-4 border-b border-gray-200 bg-white z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {previousTicketId && previousTicketId !== ticketId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onSelectTicket?.(previousTicketId);
                  setPreviousTicketId(null);
                }}
                className="text-xs text-gray-600 hover:text-primary hover:bg-gray-100"
              >
                ← Back
              </Button>
            )}
            <h2 className="text-xl font-bold text-foreground">{ticket?.ticket_number}</h2>
            <span className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded">
              {ticket?.issue_type}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadResellerTickets}
              className="text-xs text-primary hover:text-primary hover:bg-blue-50"
            >
              All Tickets ({resellerTicketCount})
            </Button>
          </div>
          <Button variant="ghost" size="icon" onClick={onToggleInfo}>
            <ChevronRight className={`h-5 w-5 transition-transform ${showInfo ? '' : 'rotate-180'}`} />
          </Button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Initial Ticket */}
        {ticket && (
          <div className="bg-gray-50 border-l-4 border-gray-400 p-4 rounded">
            <span className="bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded mb-2 inline-block">
              New Support Request
            </span>
            <div className="grid gap-2 text-sm">
              <div>
                <span className="font-medium">Order ID:</span> {ticket.order_id}
              </div>
              <div>
                <span className="font-medium">Issue Type:</span> {ticket.issue_type}
              </div>
              {ticket.description && (
                <div className="mt-2 text-gray-700 whitespace-pre-wrap break-words max-w-full overflow-hidden" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                  {linkifyText(ticket.description)}
                </div>
              )}
              {ticket.attachment_urls && ticket.attachment_urls.length > 0 && (
                <div className="mt-2">
                  <span className="font-medium text-xs">Attachments:</span>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {ticket.attachment_urls.map((url, idx) => {
                      const ext = url.toLowerCase().split('.').pop();
                      
                      if (ext === 'pdf') {
                        return (
                          <div
                            key={idx}
                            onClick={() => window.open(url, '_blank')}
                            className="flex items-center gap-2 p-3 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200"
                          >
                            <FileText className="w-6 h-6 text-red-600 flex-shrink-0" />
                            <span className="text-xs font-medium">PDF</span>
                          </div>
                        );
                      }
                      
                      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
                        return (
                          <img
                            key={idx}
                            src={url}
                            alt="Attachment"
                            className="rounded-lg max-h-40 object-cover cursor-pointer hover:opacity-80"
                            onClick={() => setMediaViewer({ url, type: 'image' })}
                          />
                        );
                      }
                      
                      if (ext === 'mp4') {
                        return (
                          <div 
                            key={idx}
                            className="relative group cursor-pointer"
                            onClick={() => setMediaViewer({ url, type: 'video' })}
                          >
                            <video src={url} className="rounded-lg max-h-40 w-full object-cover" />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                              <span className="text-white text-xs bg-black/50 px-2 py-1 rounded">Click to view</span>
                            </div>
                          </div>
                        );
                      }
                      
                      return (
                        <div
                          key={idx}
                          onClick={() => window.open(url, '_blank')}
                          className="flex items-center gap-2 p-3 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200"
                        >
                          <FileText className="w-5 h-5 flex-shrink-0" />
                          <span className="text-xs truncate">File</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="text-xs text-gray-500 mt-2 text-right">
                {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
              </div>
            </div>
          </div>
        )}

        {/* Messages, Activities, and Notes */}
        {[
          ...messages.map(m => ({...m, type: 'message'})), 
          ...activities.map(a => ({...a, type: 'activity'})),
          ...internalNotes.map(n => ({...n, type: 'note'}))
        ]
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          .map((item) => {
            if (item.type === 'activity') {
              return (
                <div key={item.id} className="flex justify-center my-4">
                  <div className="bg-gray-200 text-gray-700 px-4 py-2 rounded-full text-xs max-w-xs text-center">
                    {item.details}
                  </div>
                </div>
              );
            }
            
            if (item.type === 'note') {
              return (
                <div key={item.id} className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🔒</span>
                    <span className="bg-yellow-200 text-yellow-800 text-xs px-2 py-1 rounded">
                      Internal Note
                    </span>
                    <span className="text-sm font-medium">{item.agent_name}</span>
                  </div>
                  <p className="text-gray-700 italic" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                    {linkifyText(item.note_text)}
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                  </p>
                </div>
              );
            }
            
            if (item.sender_type === 'reseller') {
              return (
                <div key={item.id} className="flex justify-start">
                  <div className="flex items-start gap-2 max-w-[70%]">
                    <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center text-xs font-medium">
                      {getInitials(item.sender_name)}
                    </div>
                    <div className="bg-gray-100 rounded-2xl rounded-tl-sm p-3">
                      <p className="text-xs text-gray-600 mb-1">{item.sender_name}</p>
                      <p className="text-sm text-gray-900 whitespace-pre-wrap" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                        {linkifyText(item.message)}
                      </p>
                      {item.attachment_url && (() => {
                        const ext = item.attachment_url.toLowerCase().split('.').pop();
                        
                        if (ext === 'pdf') {
                          return (
                            <div
                              onClick={() => window.open(item.attachment_url, '_blank')}
                              className="flex items-center gap-2 p-3 bg-white bg-opacity-20 hover:bg-opacity-30 rounded cursor-pointer mt-2"
                            >
                              <FileText className="w-5 h-5 text-red-600" />
                              <span className="text-xs text-gray-700">PDF</span>
                            </div>
                          );
                        }
                        
                        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
                          return (
                            <img
                              src={item.attachment_url}
                              alt="Attachment"
                              className="mt-2 rounded-lg max-h-60 cursor-pointer hover:opacity-80"
                              onClick={() => setMediaViewer({ url: item.attachment_url, type: 'image' })}
                            />
                          );
                        }
                        
                        if (ext === 'mp4') {
                          return (
                            <div 
                              className="mt-2 cursor-pointer relative group"
                              onClick={() => setMediaViewer({ url: item.attachment_url, type: 'video' })}
                            >
                              <video src={item.attachment_url} className="rounded-lg max-h-60 w-full" />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                                <span className="text-white text-xs bg-black/50 px-2 py-1 rounded">Click to view</span>
                              </div>
                            </div>
                          );
                        }
                        
                        return null;
                      })()}
                      <p className="text-xs text-gray-500 mt-1">
                        {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            }
            
            return (
              <div key={item.id} className="flex justify-end">
                <div className="flex items-start gap-2 max-w-[70%]">
                  <div className="bg-primary rounded-2xl rounded-tr-sm p-3">
                    <p className="text-xs text-blue-100 mb-1">{item.sender_name}</p>
                    <p className="text-sm text-white whitespace-pre-wrap" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                      {linkifyTextWhite(item.message)}
                    </p>
                    {item.attachment_url && (
                      <img
                        src={item.attachment_url}
                        alt="Attachment"
                        className="mt-2 rounded-lg max-h-60 cursor-pointer hover:opacity-80"
                        onClick={() => window.open(item.attachment_url, '_blank')}
                      />
                    )}
                    <p className="text-xs text-blue-100 mt-1">
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-xs font-medium text-white">
                    {getInitials(item.sender_name)}
                  </div>
                </div>
              </div>
            );
          })}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Section */}
      <div 
        className="sticky bottom-0 border-t border-gray-200 bg-white"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Tabs */}
        <div className="flex px-4 pt-2 gap-4 border-b">
          <button
            onClick={() => setActiveTab('reply')}
            className={`pb-2 text-sm font-medium transition-colors ${
              activeTab === 'reply'
                ? 'border-b-2 border-primary text-primary'
                : 'text-gray-600 hover:text-primary'
            }`}
          >
            Reply
          </button>
          <button
            onClick={() => setActiveTab('note')}
            className={`pb-2 text-sm font-medium transition-colors ${
              activeTab === 'note'
                ? 'border-b-2 border-yellow-500 text-yellow-600'
                : 'text-gray-600 hover:text-yellow-600'
            }`}
          >
            Internal Note
          </button>
        </div>

        {/* Content */}
        <div className="p-4 relative">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,video/mp4,application/pdf"
            onChange={handleFileSelect}
            className="hidden"
          />

          {activeTab === 'reply' ? (
            <>
              {attachment && (
                <div className="mb-2 flex items-center gap-2 bg-gray-100 p-2 rounded-lg">
                  <Paperclip className="w-4 h-4 text-gray-600" />
                  <span className="text-sm flex-1 truncate">{attachment.name}</span>
                  <span className="text-xs text-gray-500">
                    {(attachment.size / 1024).toFixed(1)}KB
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={removeAttachment}
                    className="h-6 w-6"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {showCannedMessages && filteredCannedMessages.length > 0 && (
                <div data-canned-dropdown="true" className="absolute bottom-full left-4 right-4 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto z-20">
                  {filteredCannedMessages.map((msg) => (
                    <button
                      key={msg.id}
                      onClick={() => handleCannedMessageSelect(msg.message_text)}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm border-b last:border-b-0"
                    >
                      <div className="font-semibold text-xs text-gray-700 mb-1">
                        {msg.shortcut_name || 'No shortcut'}
                      </div>
                      <div className="text-gray-600 text-xs">
                        {msg.message_text.slice(0, 50)}...
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || isUploading}
                  className="shrink-0 h-10 w-10 hover:bg-gray-100 rounded-full"
                >
                  <Paperclip className="w-5 h-5 text-gray-600" />
                </Button>

                <Textarea
                  placeholder="Type message, paste screenshot (Ctrl+V), or drag & drop files..."
                  value={replyText}
                  onChange={handleReplyTextChange}
                  onPaste={handlePaste}
                  onKeyDown={(e) => {
                  if (showCannedMessages && filteredCannedMessages.length > 0) {
                    if (e.key === 'PageDown') {
                      e.preventDefault();
                      setSelectedCannedIndex(prev => 
                        prev < filteredCannedMessages.length - 1 ? prev + 1 : prev
                      );
                    } else if (e.key === 'PageUp') {
                      e.preventDefault();
                      setSelectedCannedIndex(prev => prev > 0 ? prev - 1 : 0);
                    } else if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleCannedMessageSelect(filteredCannedMessages[selectedCannedIndex].message_text);
                      setSelectedCannedIndex(0);
                    }
                  }
                }}
                  rows={1}
                  className="flex-1 resize-none min-h-[40px] max-h-[200px] rounded-lg border-gray-300"
                  maxLength={1000}
                  style={{ height: 'auto', minHeight: '40px', maxHeight: '200px' }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = Math.min(target.scrollHeight, 200) + 'px';
                  }}
                />

                <Button
                  onClick={handleSendReply}
                  disabled={(!replyText.trim() && !attachment) || sending || isUploading}
                  className="shrink-0 h-10 px-6 rounded-lg"
                >
                  {sending || isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Send'
                  )}
                </Button>
              </div>

              <div className="flex justify-between items-center mt-2 text-xs text-gray-400">
                <span>{replyText.length}/1000</span>
                <span>Use / for quick replies • Paste screenshots • Drag & drop files</span>
              </div>
            </>
          ) : (
            <>
              {attachment && (
                <div className="mb-2 flex items-center gap-2 bg-yellow-100 p-2 rounded-lg">
                  <Paperclip className="w-4 h-4 text-yellow-700" />
                  <span className="text-sm flex-1 truncate">{attachment.name}</span>
                  <span className="text-xs text-yellow-600">
                    {(attachment.size / 1024).toFixed(1)}KB
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={removeAttachment}
                    className="h-6 w-6"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || isUploading}
                  className="shrink-0 h-10 w-10 hover:bg-yellow-100 rounded-full"
                >
                  <Paperclip className="w-5 h-5 text-gray-600" />
                </Button>

                <Textarea
                  placeholder="Add an internal note (only visible to agents)..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={1}
                  className="flex-1 resize-none min-h-[40px] max-h-[200px] rounded-lg bg-yellow-50 border-yellow-300"
                  maxLength={1000}
                  style={{ height: 'auto', minHeight: '40px', maxHeight: '200px' }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = Math.min(target.scrollHeight, 200) + 'px';
                  }}
                />

                <Button
                  onClick={handleAddNote}
                  disabled={(!noteText.trim() && !attachment) || sending || isUploading}
                  className="shrink-0 h-10 px-6 rounded-lg bg-yellow-500 hover:bg-yellow-600"
                >
                  {sending || isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Add'
                  )}
                </Button>
              </div>

              <div className="flex justify-between items-center mt-2 text-xs text-gray-400">
                <span>🔒 Only visible to agents</span>
                <span>{noteText.length}/1000</span>
              </div>
            </>
          )}
        </div>
      </div>

      {showAssignDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Assign Ticket</h3>
            <select
              value={selectedAgentForAssign}
              onChange={(e) => setSelectedAgentForAssign(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4"
            >
              <option value="">Select Agent</option>
              <option value="unassign">Unassign Ticket</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.full_name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button onClick={handleAssignTicket} disabled={!selectedAgentForAssign}>
                Assign
              </Button>
              <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {mediaViewer && (
        <MediaViewer
          mediaUrl={mediaViewer.url}
          mediaType={mediaViewer.type}
          onClose={() => setMediaViewer(null)}
        />
      )}

      {/* Reseller Tickets Modal */}
        {showResellerTicketsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
              {/* Modal Header */}
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-foreground">All Tickets</h3>
                  <p className="text-sm text-gray-600">{ticket?.reseller_name} - {ticket?.reseller_phone}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowResellerTicketsModal(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-4">
                {resellerTicketsDisplay.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No tickets found</p>
                ) : (
                  <div className="space-y-2">
                    {resellerTicketsDisplay.map((t) => (
                      <div
                        key={t.id}
                        onClick={() => {
                          setShowResellerTicketsModal(false);
                          if (t.id !== ticketId) {
                            onSelectTicket?.(t.id);
                          }
                        }}
                        className={`p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors ${
                          t.id === ticketId ? 'bg-blue-50 border-primary' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-primary">{t.ticket_number}</span>
                          <span className={`status-badge ${
                            t.status === 'Pending' ? 'status-pending' :
                            t.status === 'In Progress' ? 'status-in-progress' :
                            'status-resolved'
                          }`}>
                            {t.status}
                          </span>
                        </div>
                        <div className="text-sm text-gray-700 mb-1">
                          <span className="font-medium">Issue:</span> {t.issue_type}
                        </div>
                        <div className="text-sm text-gray-700">
                          <span className="font-medium">Order:</span> {t.order_id}
                        </div>
                        <div className="text-xs text-gray-500 mt-2">
                          {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              {resellerTicketsOffset < resellerTickets.length && (
                <div className="p-4 border-t border-gray-200 flex justify-center">
                  <Button
                    onClick={loadMoreResellerTickets}
                    variant="outline"
                    className="w-full"
                  >
                    Load More ({resellerTickets.length - resellerTicketsOffset} remaining)
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  );
};

export default ChatPanel;