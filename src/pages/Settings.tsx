import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, User, Mail, Shield, LogOut, Loader2, Eye, EyeOff, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

interface AIConfig { claude_api_key: string; test_mode_phone: string; test_mode_only: boolean; }
interface AISetting { id?: string; issue_type: string; ai_enabled: boolean; system_prompt: string; }
interface KnowledgeDoc { id: string; title: string; content: string; issue_type: string | null; created_at: string; }
interface ProtocolParam { id?: string; param_name: string; description: string; required: boolean; }
interface Protocol { id?: string; name: string; trigger_description: string; endpoint_url: string; method: string; headers: string; body_template: string; requires_confirmation: boolean; is_active: boolean; issue_type: string; ai_protocol_params?: ProtocolParam[]; }

const emptyProtocol = (): Protocol => ({ name: '', trigger_description: '', endpoint_url: '', method: 'POST', headers: '{}', body_template: '{}', requires_confirmation: false, is_active: true, issue_type: '' });

const Toggle = ({ value, onChange, color = 'green' }: { value: boolean; onChange: (v: boolean) => void; color?: string }) => {
  const bg = value ? (color === 'yellow' ? 'bg-yellow-500' : color === 'orange' ? 'bg-orange-500' : 'bg-green-500') : 'bg-gray-300';
  return (
    <button onClick={() => onChange(!value)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${bg}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
};

const ProtocolsPanel = ({ issueTypes }: { issueTypes: string[] }) => {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [editing, setEditing] = useState<Protocol | null>(null);
  const [editingParams, setEditingParams] = useState<ProtocolParam[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { fetchProtocols(); }, []);

  const fetchProtocols = async () => {
    const { data } = await supabase.from('ai_protocols').select('*, ai_protocol_params(*)').order('created_at', { ascending: false });
    setProtocols(data || []);
  };

  const saveProtocol = async () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.trigger_description.trim() || !editing.endpoint_url.trim()) { toast.error('Name, trigger, and endpoint are required'); return; }
    setSaving(true);
    try {
      let parsedHeaders = {};
      try { parsedHeaders = JSON.parse(editing.headers || '{}'); } catch { toast.error('Headers must be valid JSON'); setSaving(false); return; }
      const protocolData = { name: editing.name.trim(), trigger_description: editing.trigger_description.trim(), endpoint_url: editing.endpoint_url.trim(), method: editing.method, headers: parsedHeaders, body_template: editing.body_template, requires_confirmation: editing.requires_confirmation, is_active: editing.is_active, issue_type: editing.issue_type || null };
      let protocolId = editing.id;
      if (editing.id) {
        const { error } = await supabase.from('ai_protocols').update(protocolData).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('ai_protocols').insert(protocolData).select().single();
        if (error) throw error;
        protocolId = data.id;
      }
      if (protocolId) {
        await supabase.from('ai_protocol_params').delete().eq('protocol_id', protocolId);
        const valid = editingParams.filter(p => p.param_name.trim());
        if (valid.length > 0) await supabase.from('ai_protocol_params').insert(valid.map(p => ({ protocol_id: protocolId, param_name: p.param_name.trim(), description: p.description.trim(), required: p.required })));
      }
      toast.success('Protocol saved'); setShowForm(false); setEditing(null); fetchProtocols();
    } catch (e: any) { toast.error(`Failed: ${e.message}`); } finally { setSaving(false); }
  };

  if (showForm && editing) return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{editing.id ? 'Edit Protocol' : 'New Protocol'}</h3>
        <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</Button>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div><label className="text-sm font-medium text-gray-600 block mb-1">Protocol Name</label><Input value={editing.name} onChange={e => setEditing(p => p ? { ...p, name: e.target.value } : p)} placeholder="e.g. Lookup Order, Log Courier Complaint" /></div>
        <div>
          <label className="text-sm font-medium text-gray-600 block mb-1">When should AI trigger this?</label>
          <Textarea value={editing.trigger_description} onChange={e => setEditing(p => p ? { ...p, trigger_description: e.target.value } : p)} placeholder="e.g. When reseller mentions order not delivered, delayed, or wants to track shipment" rows={3} />
          <p className="text-xs text-gray-400 mt-1">Plain English — Claude reads this to decide when to use this protocol.</p>
        </div>
        <div><label className="text-sm font-medium text-gray-600 block mb-1">Scope <span className="text-gray-400">(empty = all types)</span></label>
          <select value={editing.issue_type} onChange={e => setEditing(p => p ? { ...p, issue_type: e.target.value } : p)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">All Issue Types</option>{issueTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div><label className="text-sm font-medium text-gray-600 block mb-1">Endpoint URL</label><Input value={editing.endpoint_url} onChange={e => setEditing(p => p ? { ...p, endpoint_url: e.target.value } : p)} placeholder="https://script.google.com/macros/s/.../exec" /><p className="text-xs text-gray-400 mt-1">Use {"{{param_name}}"} to inject params into the URL.</p></div>
        <div><label className="text-sm font-medium text-gray-600 block mb-1">HTTP Method</label>
          <select value={editing.method} onChange={e => setEditing(p => p ? { ...p, method: e.target.value } : p)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div><label className="text-sm font-medium text-gray-600 block mb-1">Headers <span className="text-gray-400">(JSON)</span></label><Textarea value={editing.headers} onChange={e => setEditing(p => p ? { ...p, headers: e.target.value } : p)} placeholder={'{\n  "Authorization": "Bearer TOKEN"\n}'} rows={3} className="font-mono text-xs" /></div>
        <div>
          <label className="text-sm font-medium text-gray-600 block mb-1">Request Body Template <span className="text-gray-400">(use {"{{param_name}}"})</span></label>
          <Textarea value={editing.body_template} onChange={e => setEditing(p => p ? { ...p, body_template: e.target.value } : p)} placeholder={'{\n  "action": "lookup_order",\n  "order_id": "{{order_id}}"\n}'} rows={5} className="font-mono text-xs" />
          <p className="text-xs text-gray-400 mt-1">{"{{param_name}}"} will be replaced with values Claude collected from the conversation.</p>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-600">Parameters for Claude to collect</label>
            <Button size="sm" variant="outline" onClick={() => setEditingParams(prev => [...prev, { param_name: '', description: '', required: true }])}><Plus className="h-3 w-3 mr-1" />Add</Button>
          </div>
          {editingParams.length === 0 && <p className="text-xs text-gray-400">No params — Claude will call with available context.</p>}
          <div className="space-y-2">
            {editingParams.map((param, idx) => (
              <div key={idx} className="flex gap-2 items-start bg-gray-50 p-3 rounded-lg">
                <div className="flex-1 space-y-2">
                  <Input value={param.param_name} onChange={e => setEditingParams(prev => prev.map((p, i) => i === idx ? { ...p, param_name: e.target.value } : p))} placeholder="param_name (e.g. order_id)" className="text-xs" />
                  <Input value={param.description} onChange={e => setEditingParams(prev => prev.map((p, i) => i === idx ? { ...p, description: e.target.value } : p))} placeholder="Description (e.g. Order ID mentioned by reseller)" className="text-xs" />
                  <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer"><input type="checkbox" checked={param.required} onChange={e => setEditingParams(prev => prev.map((p, i) => i === idx ? { ...p, required: e.target.checked } : p))} />Required</label>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setEditingParams(prev => prev.filter((_, i) => i !== idx))} className="text-red-500 h-8 w-8"><Trash2 className="h-3 w-3" /></Button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg">
          <div><p className="text-sm font-semibold text-orange-800">Require Confirmation</p><p className="text-xs text-orange-600">AI asks reseller to confirm before executing</p></div>
          <Toggle value={editing.requires_confirmation} onChange={v => setEditing(p => p ? { ...p, requires_confirmation: v } : p)} color="orange" />
        </div>
        <Button onClick={saveProtocol} disabled={saving} className="w-full">{saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{editing.id ? 'Update Protocol' : 'Create Protocol'}</Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h3 className="font-semibold text-gray-900">Protocols</h3><p className="text-xs text-gray-500 mt-0.5">Actions AI can perform — fetch data, call APIs, write to Google Sheets</p></div>
        <Button size="sm" onClick={() => { setEditing(emptyProtocol()); setEditingParams([]); setShowForm(true); }}><Plus className="h-4 w-4 mr-1" />New Protocol</Button>
      </div>
      {protocols.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-lg p-8 text-center">
          <p className="text-sm text-gray-500 mb-2">No protocols yet.</p>
          <p className="text-xs text-gray-400">Create a protocol to let AI look up orders, log complaints, or call any API — all configurable here, no code needed.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {protocols.map(p => (
            <div key={p.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{p.name}</span>
                    {!p.is_active && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Inactive</span>}
                    {p.requires_confirmation && <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded">Needs Confirm</span>}
                    {p.issue_type && <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded">{p.issue_type}</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-1">{p.trigger_description}</p>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono">{p.method} {p.endpoint_url.slice(0, 60)}{p.endpoint_url.length > 60 ? '...' : ''}</p>
                </div>
                <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                  <Toggle value={p.is_active} onChange={async () => { await supabase.from('ai_protocols').update({ is_active: !p.is_active }).eq('id', p.id!); fetchProtocols(); }} />
                  <Button variant="ghost" size="sm" onClick={() => { setEditing({ ...p, headers: typeof p.headers === 'object' ? JSON.stringify(p.headers, null, 2) : p.headers }); setEditingParams(p.ai_protocol_params || []); setShowForm(true); }} className="text-xs">Edit</Button>
                  <Button variant="ghost" size="icon" onClick={async () => { await supabase.from('ai_protocols').delete().eq('id', p.id!); fetchProtocols(); toast.success('Deleted'); }} className="text-red-500 h-8 w-8"><Trash2 className="h-3 w-3" /></Button>
                  <button onClick={() => setExpandedId(expandedId === p.id ? null : p.id!)}>{expandedId === p.id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}</button>
                </div>
              </div>
              {expandedId === p.id && (
                <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-3">
                  <div><p className="text-xs font-medium text-gray-600 mb-1">Parameters:</p>
                    {(p.ai_protocol_params || []).length === 0 ? <p className="text-xs text-gray-400">None</p> : (p.ai_protocol_params || []).map((param, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs mb-1">
                        <span className="font-mono bg-gray-200 px-1.5 py-0.5 rounded text-gray-700">{param.param_name}</span>
                        <span className="text-gray-500">{param.description}</span>
                        {param.required && <span className="text-red-500">*required</span>}
                      </div>
                    ))}
                  </div>
                  <div><p className="text-xs font-medium text-gray-600 mb-1">Body Template:</p><pre className="text-xs bg-white border border-gray-200 rounded p-2 overflow-x-auto text-gray-700 whitespace-pre-wrap">{p.body_template}</pre></div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const AISettingsPanel = () => {
  const [config, setConfig] = useState<AIConfig>({ claude_api_key: '', test_mode_phone: '+923165893850', test_mode_only: true });
  const [aiSettings, setAiSettings] = useState<AISetting[]>([]);
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDoc[]>([]);
  const [issueTypes, setIssueTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'protocols' | 'knowledge'>('config');
  const [newDoc, setNewDoc] = useState({ title: '', content: '', issue_type: '' });
  const [addingDoc, setAddingDoc] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    const { data: configData } = await supabase.from('ai_config').select('*').eq('id', 1).single();
    if (configData) setConfig(configData);
    const { data: ticketsData } = await supabase.from('tickets').select('issue_type');
    const types = [...new Set((ticketsData || []).map((t: any) => t.issue_type).filter(Boolean))].sort() as string[];
    setIssueTypes(types);
    const { data: settingsData } = await supabase.from('ai_settings').select('*');
    setAiSettings(types.map(type => (settingsData || []).find((s: any) => s.issue_type === type) || { issue_type: type, ai_enabled: false, system_prompt: '' }));
    const { data: docsData } = await supabase.from('ai_knowledge_base').select('*').order('created_at', { ascending: false });
    setKnowledgeDocs(docsData || []);
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('ai_config').update({ claude_api_key: config.claude_api_key, test_mode_phone: config.test_mode_phone, test_mode_only: config.test_mode_only, updated_at: new Date().toISOString() }).eq('id', 1);
      if (error) throw error;
      toast.success('Config saved');
    } catch { toast.error('Failed to save'); } finally { setSaving(false); }
  };

  const toggleAI = async (issueType: string, enabled: boolean) => {
    setAiSettings(prev => prev.map(s => s.issue_type === issueType ? { ...s, ai_enabled: enabled } : s));
    const { error } = await supabase.from('ai_settings').upsert({ issue_type: issueType, ai_enabled: enabled }, { onConflict: 'issue_type' });
    if (error) { toast.error('Failed'); setAiSettings(prev => prev.map(s => s.issue_type === issueType ? { ...s, ai_enabled: !enabled } : s)); }
    else toast.success(`AI ${enabled ? 'enabled' : 'disabled'} for ${issueType}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-4 border-b">
        {([['config', 'Configuration'], ['protocols', '⚡ Protocols'], ['knowledge', 'Knowledge Base']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)} className={`pb-2 text-sm font-medium transition-colors ${activeTab === id ? 'border-b-2 border-primary text-primary' : 'text-gray-500 hover:text-gray-700'}`}>{label}</button>
        ))}
      </div>

      {activeTab === 'config' && (
        <>
          <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Claude API</h3>
            <div><label className="text-sm font-medium text-gray-600 block mb-1">API Key</label>
              <div className="flex gap-2">
                <Input type={showApiKey ? 'text' : 'password'} value={config.claude_api_key} onChange={e => setConfig(p => ({ ...p, claude_api_key: e.target.value }))} placeholder="sk-ant-..." className="flex-1 font-mono text-sm" />
                <Button variant="ghost" size="icon" onClick={() => setShowApiKey(!showApiKey)}>{showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div><p className="text-sm font-semibold text-yellow-800">Test Mode</p><p className="text-xs text-yellow-700">AI only responds to whitelisted phone</p></div>
              <Toggle value={config.test_mode_only} onChange={v => setConfig(p => ({ ...p, test_mode_only: v }))} color="yellow" />
            </div>
            {config.test_mode_only && <div><label className="text-sm font-medium text-gray-600 block mb-1">Test Phone</label><Input value={config.test_mode_phone} onChange={e => setConfig(p => ({ ...p, test_mode_phone: e.target.value }))} /></div>}
            <Button onClick={saveConfig} disabled={saving} className="w-full">{saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Save Configuration</Button>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="font-semibold text-gray-900 mb-4">AI Per Issue Type</h3>
            {issueTypes.length === 0 ? <p className="text-sm text-gray-500">No issue types found.</p> : (
              <div className="space-y-4">
                {aiSettings.map(setting => (
                  <div key={setting.issue_type} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-gray-900">{setting.issue_type}</span>
                      <Toggle value={setting.ai_enabled} onChange={v => toggleAI(setting.issue_type, v)} />
                    </div>
                    {setting.ai_enabled && (
                      <div className="space-y-2">
                        <label className="text-xs text-gray-500">Custom system prompt (optional)</label>
                        <Textarea value={setting.system_prompt} onChange={e => setAiSettings(prev => prev.map(s => s.issue_type === setting.issue_type ? { ...s, system_prompt: e.target.value } : s))} placeholder="Leave empty for default..." rows={3} className="text-xs" />
                        <Button size="sm" variant="outline" onClick={async () => { await supabase.from('ai_settings').upsert({ issue_type: setting.issue_type, system_prompt: setting.system_prompt }, { onConflict: 'issue_type' }); toast.success('Prompt saved'); }}>Save Prompt</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'protocols' && <ProtocolsPanel issueTypes={issueTypes} />}

      {activeTab === 'knowledge' && (
        <>
          <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Add Document / Protocol</h3>
            <div><label className="text-sm font-medium text-gray-600 block mb-1">Title</label><Input value={newDoc.title} onChange={e => setNewDoc(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Refund Policy, Delivery SOP" /></div>
            <div><label className="text-sm font-medium text-gray-600 block mb-1">Issue Type <span className="text-gray-400">(empty = global)</span></label>
              <select value={newDoc.issue_type} onChange={e => setNewDoc(p => ({ ...p, issue_type: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">Global</option>{issueTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><label className="text-sm font-medium text-gray-600 block mb-1">Content</label><Textarea value={newDoc.content} onChange={e => setNewDoc(p => ({ ...p, content: e.target.value }))} placeholder="Paste your protocol, FAQ, or SOP here..." rows={8} /></div>
            <Button onClick={async () => { if (!newDoc.title.trim() || !newDoc.content.trim()) { toast.error('Title and content required'); return; } setAddingDoc(true); try { await supabase.from('ai_knowledge_base').insert({ title: newDoc.title.trim(), content: newDoc.content.trim(), issue_type: newDoc.issue_type || null }); toast.success('Added'); setNewDoc({ title: '', content: '', issue_type: '' }); fetchAll(); } catch { toast.error('Failed'); } finally { setAddingDoc(false); } }} disabled={addingDoc} className="w-full">
              {addingDoc ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}Add Document
            </Button>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Documents ({knowledgeDocs.length})</h3>
            {knowledgeDocs.length === 0 ? <p className="text-sm text-gray-500">No documents yet.</p> : (
              <div className="space-y-3">
                {knowledgeDocs.map(doc => (
                  <div key={doc.id} className="flex items-start justify-between p-3 border border-gray-200 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{doc.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{doc.issue_type || 'Global'} • {doc.content.length} chars</p>
                      <p className="text-xs text-gray-400 mt-1">{doc.content.slice(0, 100)}...</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={async () => { await supabase.from('ai_knowledge_base').delete().eq('id', doc.id); setKnowledgeDocs(prev => prev.filter(d => d.id !== doc.id)); toast.success('Deleted'); }} className="text-red-500 hover:text-red-600 ml-2"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const Settings = () => {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'ai'>('profile');
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updating, setUpdating] = useState(false);

  const handleUpdateName = async () => {
    if (!fullName.trim()) { toast.error('Name cannot be empty'); return; }
    setUpdating(true);
    try { const { error } = await supabase.from('agent_profiles').update({ full_name: fullName.trim() }).eq('id', profile?.id); if (error) throw error; toast.success('Name updated'); setIsEditingName(false); window.location.reload(); }
    catch { toast.error('Failed'); } finally { setUpdating(false); }
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || !confirmPassword) { toast.error('Fill all fields'); return; }
    if (newPassword.length < 6) { toast.error('Min 6 characters'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    setUpdating(true);
    try { const { error } = await supabase.auth.updateUser({ password: newPassword }); if (error) throw error; toast.success('Password updated'); setIsEditingPassword(false); setNewPassword(''); setConfirmPassword(''); }
    catch { toast.error('Failed'); } finally { setUpdating(false); }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="sticky top-0 bg-white border-b p-4 z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/tickets')}><ArrowLeft className="h-5 w-5" /></Button>
          <div><h1 className="text-2xl font-bold text-foreground">Settings</h1><p className="text-sm text-muted-foreground">Manage your account and preferences</p></div>
        </div>
      </div>
      <div className="flex gap-6 border-b bg-white px-6">
        {(['profile', 'ai'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`py-3 text-sm font-medium transition-colors ${activeTab === tab ? 'border-b-2 border-primary text-primary' : 'text-gray-500 hover:text-gray-700'}`}>
            {tab === 'profile' ? 'Profile' : '🤖 AI Settings'}
          </button>
        ))}
      </div>
      <div className="flex-1 p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {activeTab === 'profile' && (
            <>
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><User className="h-5 w-5" />Profile</h2>
                <div className="space-y-4">
                  <div><label className="text-sm font-medium text-muted-foreground">Full Name</label>
                    {isEditingName ? (<div className="mt-2 space-y-2"><Input value={fullName} onChange={e => setFullName(e.target.value)} disabled={updating} /><div className="flex gap-2"><Button size="sm" onClick={handleUpdateName} disabled={updating}>{updating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button><Button size="sm" variant="outline" onClick={() => { setIsEditingName(false); setFullName(profile?.full_name || ''); }} disabled={updating}>Cancel</Button></div></div>)
                      : (<div className="flex items-center justify-between mt-1"><p className="text-base">{profile?.full_name || 'N/A'}</p><Button size="sm" variant="ghost" onClick={() => setIsEditingName(true)}>Edit</Button></div>)}
                  </div>
                  <div><label className="text-sm font-medium text-muted-foreground">Email</label><div className="flex items-center gap-2 mt-1"><Mail className="h-4 w-4 text-gray-400" /><p>{user?.email || 'N/A'}</p></div></div>
                  <div><label className="text-sm font-medium text-muted-foreground">Role</label><div className="flex items-center gap-2 mt-1"><Shield className="h-4 w-4 text-gray-400" /><p className="capitalize">{profile?.role || 'Agent'}</p></div></div>
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h2 className="text-lg font-semibold mb-4">Change Password</h2>
                {isEditingPassword ? (<div className="space-y-4"><div><label className="text-sm font-medium text-muted-foreground">New Password</label><Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} disabled={updating} className="mt-1" /></div><div><label className="text-sm font-medium text-muted-foreground">Confirm</label><Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} disabled={updating} className="mt-1" /></div><div className="flex gap-2"><Button size="sm" onClick={handleUpdatePassword} disabled={updating}>{updating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update'}</Button><Button size="sm" variant="outline" onClick={() => { setIsEditingPassword(false); setNewPassword(''); setConfirmPassword(''); }} disabled={updating}>Cancel</Button></div></div>)
                  : <Button variant="outline" className="w-full justify-start" onClick={() => setIsEditingPassword(true)}>🔑 Change Password</Button>}
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h2 className="text-lg font-semibold mb-4">Account</h2>
                <Button variant="outline" className="w-full justify-start text-red-600 hover:bg-red-50 border-red-200" onClick={async () => { await supabase.auth.signOut(); navigate('/login'); }}><LogOut className="h-4 w-4 mr-2" />Logout</Button>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h2 className="text-lg font-semibold mb-4">About</h2>
                <div className="space-y-2 text-sm text-muted-foreground"><p>Markaz Helpline Dashboard</p><p>Version 1.0.0</p><p className="pt-2 border-t">Support: <span className="text-primary">waqas.haider@markaz.app</span></p></div>
              </div>
            </>
          )}
          {activeTab === 'ai' && <AISettingsPanel />}
        </div>
      </div>
    </div>
  );
};

export default Settings;