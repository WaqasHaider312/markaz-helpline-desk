import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, Ticket, Message, InternalNote } from '@/lib/supabase';
import { MessageCircle, ChevronRight, Paperclip, X, Loader2 } from 'lucide-react';
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
}

interface CannedMessage {
  id: string;
  message_text: string;
}

const ChatPanel = ({ ticketId, onToggleInfo, showInfo }: ChatPanelProps) => {
  const { profile } = useAuth();
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
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgentForAssign, setSelectedAgentForAssign] = useState('');
  const [activities, setActivities] = useState<any[]>([]);
  const [mediaViewer, setMediaViewer] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  useEffect(() => {
    if (ticketId) {
      fetchTicketData();
      fetchCannedMessages();
      subscribeToUpdates();
    }
  }, [ticketId]);

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
        await fetchTicketData();
      } catch (error) {
        console.error('Error assigning ticket:', error);
        toast.error('Failed to assign ticket');
      }
    };

  const fetchTicketData = async () => {
    if (!ticketId) return;

    try {
      const { data: ticketData } = await supabase
        .from('tickets')
        .select('*')
        .eq('id', ticketId)
        .single();

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
      setTicket(ticketData);
      setMessages(messagesData || []);
      setInternalNotes(notesData || []);
    } catch (error) {
      console.error('Error fetching ticket data:', error);
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

  const subscribeToUpdates = () => {
    const messagesChannel = supabase
      .channel('ticket-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `ticket_id=eq.${ticketId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    const notesChannel = supabase
      .channel('ticket-notes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'internal_notes',
          filter: `ticket_id=eq.${ticketId}`,
        },
        (payload) => {
          setInternalNotes((prev) => [...prev, payload.new as InternalNote]);
        }
      )
      .subscribe();

    const activitiesChannel = supabase
      .channel('ticket-activities')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ticket_activities',
          filter: `ticket_id=eq.${ticketId}`,
        },
        (payload) => {
          setActivities((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(notesChannel);
      supabase.removeChannel(activitiesChannel);
    };
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

          setMessages((prev) => [...prev, data]);

          // Update latest message in ticket
          await supabase
            .from('tickets')
            .update({
              latest_message: replyText.trim() || 'Attachment',
              latest_message_at: new Date().toISOString(),
              latest_message_sender: 'agent',
              unread_by_agent: false
            })
            .eq('id', ticketId);

          setMessages((prev) => [...prev, data]);

          // Auto-assign + update status
            const updates: any = { updated_at: new Date().toISOString() };
            if (ticket?.status === 'Pending') {
              updates.status = 'In Progress';
            }
            if (!ticket?.assigned_agent_id && profile?.id) {
              updates.assigned_agent_id = profile.id;
            }
            if (Object.keys(updates).length > 0) {
              await supabase.from('tickets').update(updates).eq('id', ticketId);
              setTicket(prev => prev ? {...prev, ...updates} : null);
              
              // Create activity if auto-assigned
              if (updates.assigned_agent_id) {
                await supabase.from('ticket_activities').insert({
                  ticket_id: ticketId,
                  activity_type: 'assigned',
                  actor_name: profile?.full_name || 'Agent',
                  details: `${profile?.full_name} assigned ticket to self`
                });
              }
            }
            const { error: updateError } = await supabase
              .from('tickets')
              .update(updates)
              .eq('id', ticketId);

            if (!updateError) {
              setTicket(prev => prev ? {...prev, ...updates} : null);
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

      // Add note to state immediately
      setInternalNotes((prev) => [...prev, data]);  // <-- THIS LINE

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
  };

  const handleReplyTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setReplyText(value);

    // Show canned messages if user types "/"
    if (value.endsWith('/')) {
      setShowCannedMessages(true);
    } else if (!value.includes('/')) {
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
      {/* Top Bar */}
      <div className="sticky top-0 p-4 border-b border-gray-200 bg-white z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-foreground">{ticket?.ticket_number}</h2>
            <span className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded">
              {ticket?.issue_type}
            </span>
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
                <div className="mt-2 text-gray-700 whitespace-pre-wrap break-words max-w-full overflow-hidden">
                  {ticket.description}
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
              // Activity
              if (item.type === 'activity') {
                return (
                  <div key={item.id} className="flex justify-center my-4">
                    <div className="bg-gray-200 text-gray-700 px-4 py-2 rounded-full text-xs max-w-xs text-center">
                      {item.details}
                    </div>
                  </div>
                );
              }
              
              // Internal Note
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
                    <p className="text-gray-700 italic">{item.note_text}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                    </p>
                  </div>
                );
              }
              
              // Message from reseller
              if (item.sender_type === 'reseller') {
                return (
                  <div key={item.id} className="flex justify-start">
                    <div className="flex items-start gap-2 max-w-[70%]">
                      <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center text-xs font-medium">
                        {getInitials(item.sender_name)}
                      </div>
                      <div className="bg-gray-100 rounded-2xl rounded-tl-sm p-3">
                        <p className="text-xs text-gray-600 mb-1">{item.sender_name}</p>
                        <p className="text-sm text-gray-900 whitespace-pre-wrap">{item.message}</p>
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
              
              // Message from agent
              return (
                <div key={item.id} className="flex justify-end">
                  <div className="flex items-start gap-2 max-w-[70%]">
                    <div className="bg-primary rounded-2xl rounded-tr-sm p-3">
                      <p className="text-xs text-blue-100 mb-1">{item.sender_name}</p>
                      <p className="text-sm text-white whitespace-pre-wrap">{item.message}</p>
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
<div className="sticky bottom-0 border-t border-gray-200 bg-white">
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
    {/* File Input (hidden) */}
    <input
      ref={fileInputRef}
      type="file"
      accept="image/jpeg,image/jpg,image/png,video/mp4,application/pdf"
      onChange={handleFileSelect}
      className="hidden"
    />

          {activeTab === 'reply' ? (
            <>
              {/* Attachment Preview */}
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

              {/* Canned Messages Dropdown */}
              {showCannedMessages && cannedMessages.length > 0 && (
                <div className="absolute bottom-full left-4 right-4 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto z-20">
                  {cannedMessages.map((msg) => (
                    <button
                      key={msg.id}
                      onClick={() => handleCannedMessageSelect(msg.message_text)}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm border-b last:border-b-0"
                    >
                      {msg.message_text.slice(0, 60)}...
                    </button>
                  ))}
                </div>
              )}

              {/* Input Row */}
              <div className="flex items-center gap-2">
                {/* Attachment Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || isUploading}
                  className="shrink-0 h-10 w-10 hover:bg-gray-100 rounded-full"
                >
                  <Paperclip className="w-5 h-5 text-gray-600" />
                </Button>

                {/* Text Area */}
                <Textarea
                    placeholder="Type your message or use / for canned responses..."
                    value={replyText}
                    onChange={handleReplyTextChange}
                    rows={1}
                    className="flex-1 resize-none min-h-[40px] max-h-[200px] rounded-lg border-gray-300"
                    maxLength={800}
                    style={{ height: 'auto', minHeight: '40px', maxHeight: '200px' }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = Math.min(target.scrollHeight, 200) + 'px';
                    }}
                  />

                {/* Send Button */}
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

              {/* Info Row */}
              <div className="flex justify-between items-center mt-2 text-xs text-gray-400">
                <span>{replyText.length}/800</span>
                <span>Use / to show quick replies</span>
              </div>
            </>
          ) : (
            <>
              {/* Attachment Preview for Notes */}
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

              {/* Input Row */}
              <div className="flex items-center gap-2">
                {/* Attachment Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || isUploading}
                  className="shrink-0 h-10 w-10 hover:bg-yellow-100 rounded-full"
                >
                  <Paperclip className="w-5 h-5 text-gray-600" />
                </Button>

                {/* Textarea */}
                <Textarea
                  placeholder="Add an internal note (only visible to agents)..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={1}
                  className="flex-1 resize-none min-h-[40px] max-h-[200px] rounded-lg bg-yellow-50 border-yellow-300"
                  maxLength={800}
                  style={{ height: 'auto', minHeight: '40px', maxHeight: '200px' }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = Math.min(target.scrollHeight, 200) + 'px';
                  }}
                />

                {/* Add Note Button */}
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

              {/* Info Row */}
              <div className="flex justify-between items-center mt-2 text-xs text-gray-400">
                <span>🔒 Only visible to agents</span>
                <span>{noteText.length}/800</span>
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
    </div>
  );
};

export default ChatPanel;
