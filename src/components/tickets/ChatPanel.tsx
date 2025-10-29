import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, Ticket, Message, InternalNote } from '@/lib/supabase';
import { MessageCircle, ChevronRight, Paperclip, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface ChatPanelProps {
  ticketId: string | null;
  onToggleInfo: () => void;
}

interface CannedMessage {
  id: string;
  message_text: string;
}

const ChatPanel = ({ ticketId, onToggleInfo }: ChatPanelProps) => {
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
        .eq('agent_id', profile.id)
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

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(notesChannel);
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

      const { error } = await supabase.from('messages').insert({
        ticket_id: ticketId,
        sender_type: 'agent',
        sender_name: profile.full_name,
        message: replyText.trim() || 'Attachment',
        attachment_url: attachmentUrl,
      });

      if (error) throw error;

      // Auto-update status to In Progress if Pending
      if (ticket?.status === 'Pending') {
        await supabase
          .from('tickets')
          .update({ status: 'In Progress' })
          .eq('id', ticketId);
        
        setTicket(prev => prev ? {...prev, status: 'In Progress'} : null);
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
      const { error } = await supabase.from('internal_notes').insert({
        ticket_id: ticketId,
        agent_id: profile.id,
        agent_name: profile.full_name,
        note_text: noteText.trim(),
      });

      if (error) throw error;

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
      <div className="flex-1 flex flex-col items-center justify-center bg-white">
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
            <ChevronRight className={`h-5 w-5 transition-transform`} />
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
                <div className="mt-2 text-gray-700 whitespace-pre-wrap">{ticket.description}</div>
              )}
              {ticket.attachment_urls && ticket.attachment_urls.length > 0 && (
                <div className="mt-2">
                  <span className="font-medium text-xs">Attachments:</span>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {ticket.attachment_urls.map((url: string, idx: number) => (
                      <img
                        key={idx}
                        src={url}
                        alt="Attachment"
                        className="rounded-lg max-h-40 object-cover cursor-pointer hover:opacity-80"
                        onClick={() => window.open(url, '_blank')}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="text-xs text-gray-500 mt-2 text-right">
                {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
              </div>
            </div>
          </div>
        )}

        {/* Messages and Notes */}
        {messages.map((message) =>
          message.sender_type === 'reseller' ? (
            <div key={message.id} className="flex justify-start">
              <div className="flex items-start gap-2 max-w-[70%]">
                <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center text-xs font-medium">
                  {getInitials(message.sender_name)}
                </div>
                <div className="bg-gray-100 rounded-2xl rounded-tl-sm p-3">
                  <p className="text-xs text-gray-600 mb-1">{message.sender_name}</p>
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{message.message}</p>
                  {message.attachment_url && (
                    <img
                      src={message.attachment_url}
                      alt="Attachment"
                      className="mt-2 rounded-lg max-h-60 cursor-pointer hover:opacity-80"
                      onClick={() => window.open(message.attachment_url, '_blank')}
                    />
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div key={message.id} className="flex justify-end">
              <div className="flex items-start gap-2 max-w-[70%]">
                <div className="bg-primary rounded-2xl rounded-tr-sm p-3">
                  <p className="text-xs text-blue-100 mb-1">{message.sender_name}</p>
                  <p className="text-sm text-white whitespace-pre-wrap">{message.message}</p>
                  {message.attachment_url && (
                    <img
                      src={message.attachment_url}
                      alt="Attachment"
                      className="mt-2 rounded-lg max-h-60 cursor-pointer hover:opacity-80"
                      onClick={() => window.open(message.attachment_url, '_blank')}
                    />
                  )}
                  <p className="text-xs text-blue-100 mt-1">
                    {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                  </p>
                </div>
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-xs font-medium text-white">
                  {getInitials(message.sender_name)}
                </div>
              </div>
            </div>
          )
        )}

        {/* Internal Notes */}
        {internalNotes.map((note) => (
          <div key={note.id} className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🔒</span>
              <span className="bg-yellow-200 text-yellow-800 text-xs px-2 py-1 rounded">
                Internal Note
              </span>
              <span className="text-sm font-medium">{note.agent_name}</span>
            </div>
            <p className="text-gray-700 italic">{note.note_text}</p>
            <p className="text-xs text-gray-500 mt-2">
              {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
            </p>
          </div>
        ))}

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
                  className="flex-1 resize-none min-h-[40px] max-h-[120px] rounded-lg border-gray-300"
                  maxLength={500}
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
                <span>{replyText.length}/500</span>
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
                  className="flex-1 resize-none min-h-[40px] max-h-[120px] rounded-lg bg-yellow-50 border-yellow-300"
                  maxLength={500}
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
                <span>{noteText.length}/500</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
