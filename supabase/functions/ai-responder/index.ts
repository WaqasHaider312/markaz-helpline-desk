import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function slugify(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '_')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64) || 'tool';
}

function fillTemplate(template: string, params: Record<string, any>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    params[key] !== undefined ? String(params[key]) : ''
  );
}

async function executeProtocol(protocol: any, collectedParams: Record<string, any>): Promise<string> {
  try {
    const url = fillTemplate(protocol.endpoint_url, collectedParams);
    const method = (protocol.method || 'POST').toUpperCase();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(protocol.headers || {}),
    };

    let body: string | undefined;
    if (method !== 'GET') {
      const bodyTemplate = protocol.body_template || '{}';
      const filled = fillTemplate(bodyTemplate, collectedParams);
      try {
        JSON.parse(filled);
        body = filled;
      } catch {
        body = JSON.stringify({ data: filled, params: collectedParams });
      }
    }

    const res = await fetch(url, {
      method,
      headers,
      body: method !== 'GET' ? body : undefined,
    });

    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return JSON.stringify(json, null, 2);
    } catch {
      return text;
    }
  } catch (err: any) {
    return `Error executing protocol: ${err.message}`;
  }
}

const ESCALATION_PHRASES = [
  'handing over',
  'hand over',
  'handover',
  'escalating',
  'escalate',
  'human agent',
  'live agent',
  'agent will',
  'team will assist',
  'team will help',
  'support team will',
  'forwarding',
  'transferring to',
  'connecting you',
  'agent se baat',
  'agent ko forward',
  'insani agent',
  'hamara agent',
  'hamare agent',
  'agent aapki',
  'agent se milayenge',
];

function containsEscalation(text: string): boolean {
  const lower = text.toLowerCase();
  return ESCALATION_PHRASES.some(phrase => lower.includes(phrase));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const payload = await req.json();
    const message = payload.record;

    // Only trigger on reseller messages
    if (message.sender_type !== 'reseller') {
      return new Response(JSON.stringify({ skipped: 'not a reseller message' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 1. Fetch AI config ────────────────────────────────────────────────────
    const { data: config } = await supabase
      .from('ai_config')
      .select('*')
      .eq('id', 1)
      .single();

    if (!config?.claude_api_key) {
      return new Response(JSON.stringify({ skipped: 'no API key configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Fetch ticket ───────────────────────────────────────────────────────
    const { data: ticket } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', message.ticket_id)
      .single();

    if (!ticket) {
      return new Response(JSON.stringify({ skipped: 'ticket not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 3. Test mode check ────────────────────────────────────────────────────
    if (config.test_mode_only) {
      const normalizedPhone = ticket.reseller_phone?.replace(/\s/g, '');
      const normalizedTest = config.test_mode_phone?.replace(/\s/g, '');
      if (normalizedPhone !== normalizedTest) {
        return new Response(JSON.stringify({ skipped: 'test mode - phone not whitelisted' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── 4. Check AI enabled for issue type ───────────────────────────────────
    const { data: aiSetting } = await supabase
      .from('ai_settings')
      .select('*')
      .eq('issue_type', ticket.issue_type)
      .eq('ai_enabled', true)
      .single();

    if (!aiSetting) {
      return new Response(JSON.stringify({ skipped: 'AI not enabled for this issue type' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 5. Check if AI already escalated ─────────────────────────────────────
    if (ticket.ai_escalated) {
      return new Response(JSON.stringify({ skipped: 'AI already escalated to human agent' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 6. Check if human agent has taken over ────────────────────────────────
    const { data: agentMessages } = await supabase
      .from('messages')
      .select('sender_name')
      .eq('ticket_id', ticket.id)
      .eq('sender_type', 'agent')
      .neq('sender_name', 'Markaz AI')
      .limit(1);

    if (agentMessages && agentMessages.length > 0) {
      return new Response(JSON.stringify({ skipped: 'human agent has taken over' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 7. Fetch conversation history ─────────────────────────────────────────
    const { data: history } = await supabase
      .from('messages')
      .select('sender_type, sender_name, message, created_at')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true })
      .limit(30);

    // ── 8. Fetch knowledge base ───────────────────────────────────────────────
    const { data: knowledgeDocs } = await supabase
      .from('ai_knowledge_base')
      .select('title, content')
      .or(`issue_type.eq.${ticket.issue_type},issue_type.is.null`);

    const knowledgeContext = knowledgeDocs?.length
      ? knowledgeDocs.map((d: any) => `## ${d.title}\n${d.content}`).join('\n\n')
      : '';

    // ── 9. Fetch active protocols ─────────────────────────────────────────────
    const { data: protocols } = await supabase
      .from('ai_protocols')
      .select('*, ai_protocol_params(*)')
      .eq('is_active', true)
      .or(`issue_type.eq.${ticket.issue_type},issue_type.is.null`);

    // ── 10. Build Claude tools from protocols ──────────────────────────────────
    const claudeTools = (protocols || []).map((p: any) => {
      const properties: Record<string, any> = {};
      const required: string[] = [];
      for (const param of (p.ai_protocol_params || [])) {
        const safeKey = slugify(param.param_name);
        properties[safeKey] = { type: 'string', description: param.description };
        if (param.required) required.push(safeKey);
      }
      return {
        name: slugify(p.name),
        description: `${p.trigger_description}${p.requires_confirmation ? ' [REQUIRES CONFIRMATION]' : ' [EXECUTE IMMEDIATELY]'}`,
        input_schema: {
          type: 'object',
          properties: Object.keys(properties).length ? properties : { details: { type: 'string', description: 'Any relevant details' } },
          required,
        },
        _protocol: p,
      };
    });

    const claudeToolsForAPI = claudeTools.map(({ _protocol, ...tool }) => tool);

    const protocolInstructions = claudeTools.length > 0 ? `

PROTOCOLS (actions you can perform):
${claudeTools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

Rules:
1. Extract required parameters from conversation history first
2. If a required parameter is missing, ask the customer naturally
3. For [EXECUTE IMMEDIATELY]: call the tool right away
4. For [REQUIRES CONFIRMATION]: tell customer what you will do and wait for their confirmation
5. After receiving tool results, respond naturally based on the data returned` : '';

    // ── 11. Build system prompt ────────────────────────────────────────────────
    const systemPrompt = `${aiSetting.system_prompt || `You are a helpful customer support agent for Markaz, a Pakistani e-commerce reseller platform. Be concise, professional, and helpful. Respond in the same language the reseller used (Urdu/Roman Urdu or English). If you cannot resolve the issue, say you are escalating to a human agent.`}

TICKET CONTEXT:
- Ticket: ${ticket.ticket_number}
- Issue Type: ${ticket.issue_type}
- Order ID: ${ticket.order_id || 'N/A'}
- Reseller: ${ticket.reseller_name}
- Phone: ${ticket.reseller_phone}

${knowledgeContext ? `KNOWLEDGE BASE:\n${knowledgeContext}\n` : ''}${protocolInstructions}`;

    const conversationMessages = (history || []).map((m: any) => ({
      role: m.sender_type === 'agent' ? 'assistant' : 'user',
      content: m.message,
    }));

    // ── 12. Agentic loop ──────────────────────────────────────────────────────
    let loopMessages = [...conversationMessages];
    let finalReply = '';
    let toolsUsed: string[] = [];
    const MAX_ITERATIONS = 5;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const claudeBody: any = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: loopMessages,
      };

      if (claudeToolsForAPI.length > 0) {
        claudeBody.tools = claudeToolsForAPI;
      }

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.claude_api_key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(claudeBody),
      });

      const claudeData = await claudeRes.json();
      if (!claudeRes.ok) throw new Error(`Claude API error: ${JSON.stringify(claudeData)}`);

      if (claudeData.stop_reason === 'tool_use') {
        loopMessages.push({ role: 'assistant', content: claudeData.content });
        const toolResults = [];

        for (const block of claudeData.content) {
          if (block.type !== 'tool_use') continue;
          const matchedTool = claudeTools.find(t => t.name === block.name);
          let resultText = 'Tool not found';

          if (matchedTool) {
            toolsUsed.push(matchedTool._protocol.name);
            resultText = await executeProtocol(matchedTool._protocol, block.input || {});

            await supabase.from('ai_logs').insert({
              ticket_id: ticket.id,
              issue_type: ticket.issue_type,
              action_taken: `protocol:${matchedTool._protocol.name}`,
              prompt_sent: JSON.stringify(block.input),
              response_received: resultText,
            });

            await supabase.from('internal_notes').insert({
              ticket_id: ticket.id,
              agent_id: null,
              agent_name: 'Markaz AI',
              note_text: `🤖 Protocol executed: ${matchedTool._protocol.name}\nParams: ${JSON.stringify(block.input, null, 2)}\nResult: ${resultText.slice(0, 500)}`,
            });
          }

          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultText });
        }

        loopMessages.push({ role: 'user', content: toolResults });
        continue;
      }

      const textBlock = claudeData.content?.find((b: any) => b.type === 'text');
      finalReply = textBlock?.text || '';
      break;
    }

    if (!finalReply) {
      finalReply = 'Apologies, I was unable to process your request. A human agent will assist you shortly.';
    }

    // ── 13. Post AI reply ─────────────────────────────────────────────────────
    const { data: newMessage, error: msgError } = await supabase
      .from('messages')
      .insert({
        ticket_id: ticket.id,
        sender_type: 'agent',
        sender_name: 'Markaz AI',
        message: finalReply,
      })
      .select()
      .single();

    if (msgError) throw msgError;

    // ── 14. Check if AI escalated — set flag if so ────────────────────────────
    if (containsEscalation(finalReply)) {
      await supabase
        .from('tickets')
        .update({ ai_escalated: true })
        .eq('id', ticket.id);
    }

    // ── 15. Update ticket ─────────────────────────────────────────────────────
    await supabase
      .from('tickets')
      .update({
        latest_message: finalReply,
        latest_message_at: new Date().toISOString(),
        latest_message_sender: 'agent',
        status: ticket.status === 'Pending' ? 'In Progress' : ticket.status,
      })
      .eq('id', ticket.id);

    // ── 16. Log ───────────────────────────────────────────────────────────────
    await supabase.from('ai_logs').insert({
      ticket_id: ticket.id,
      message_id: newMessage.id,
      issue_type: ticket.issue_type,
      action_taken: toolsUsed.length ? `replied + tools: ${toolsUsed.join(', ')}` : 'replied',
      response_received: finalReply,
    });

    return new Response(
      JSON.stringify({ success: true, reply: finalReply, tools_used: toolsUsed, escalated: containsEscalation(finalReply) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('AI Responder error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});