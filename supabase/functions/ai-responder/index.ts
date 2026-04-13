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
      const filled = fillTemplate(protocol.body_template || '{}', collectedParams);
      try { JSON.parse(filled); body = filled; }
      catch { body = JSON.stringify({ params: collectedParams }); }
    }
    const res = await fetch(url, { method, headers, body: method !== 'GET' ? body : undefined });
    const text = await res.text();
    try { return JSON.stringify(JSON.parse(text)); } catch { return text; }
  } catch (err: any) {
    return `Error: ${err.message}`;
  }
}

const ESCALATION_PHRASES = [
  'handing over', 'hand over', 'handover', 'escalating', 'human agent',
  'live agent', 'agent will', 'team will assist', 'support team will',
  'agent se baat', 'agent ko forward', 'insani agent', 'hamara agent',
];

function containsEscalation(text: string): boolean {
  const lower = text.toLowerCase();
  return ESCALATION_PHRASES.some(p => lower.includes(p));
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

    if (message.sender_type !== 'reseller') {
      return new Response(JSON.stringify({ skipped: 'not reseller' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 1. Config ─────────────────────────────────────────────────────────────
    const { data: config } = await supabase
      .from('ai_config')
      .select('claude_api_key, test_mode_only, test_mode_phone')
      .eq('id', 1)
      .single();

    if (!config?.claude_api_key) {
      return new Response(JSON.stringify({ skipped: 'no API key' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Ticket ─────────────────────────────────────────────────────────────
    const { data: ticket } = await supabase
      .from('tickets')
      .select('id, ticket_number, issue_type, order_id, reseller_name, reseller_phone, status, ai_escalated, assigned_agent_id, ai_handled')
      .eq('id', message.ticket_id)
      .single();

    if (!ticket) {
      return new Response(JSON.stringify({ skipped: 'no ticket' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 3. Test mode ──────────────────────────────────────────────────────────
    if (config.test_mode_only) {
      const phone = ticket.reseller_phone?.replace(/\s/g, '');
      const test = config.test_mode_phone?.replace(/\s/g, '');
      if (phone !== test) {
        return new Response(JSON.stringify({ skipped: 'test mode' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── 4. AI enabled ─────────────────────────────────────────────────────────
    const { data: aiSetting } = await supabase
      .from('ai_settings')
      .select('ai_enabled, system_prompt')
      .eq('issue_type', ticket.issue_type)
      .eq('ai_enabled', true)
      .single();

    if (!aiSetting) {
      return new Response(JSON.stringify({ skipped: 'AI not enabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 5. Already escalated ──────────────────────────────────────────────────
    if (ticket.ai_escalated) {
      return new Response(JSON.stringify({ skipped: 'AI escalated' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 6. Assigned to human agent ────────────────────────────────────────────
    if (ticket.assigned_agent_id) {
      return new Response(JSON.stringify({ skipped: 'assigned to human' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 7. Human agent already replied ───────────────────────────────────────
    const { data: humanMsgs } = await supabase
      .from('messages')
      .select('id')
      .eq('ticket_id', ticket.id)
      .eq('sender_type', 'agent')
      .neq('sender_name', 'Markaz AI')
      .limit(1);

    if (humanMsgs && humanMsgs.length > 0) {
      return new Response(JSON.stringify({ skipped: 'human replied' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 8. Fetch full conversation ────────────────────────────────────────────
    const { data: history } = await supabase
      .from('messages')
      .select('sender_type, sender_name, message')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true })
      .limit(20);

    // ── 9. Count AI replies ───────────────────────────────────────────────────
    const aiReplyCount = (history || []).filter(
      (m: any) => m.sender_type === 'agent' && m.sender_name === 'Markaz AI'
    ).length;

    // ── 10. AI reply limit reached → move to unassigned ───────────────────────
    if (aiReplyCount >= 3) {
      // Mark ai_handled false so it leaves AI tab and goes to unassigned
      await supabase
        .from('tickets')
        .update({
          ai_handled: false,
          assigned_agent_id: null,
        })
        .eq('id', ticket.id);

      return new Response(JSON.stringify({ skipped: 'AI reply limit reached — moved to unassigned' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 11. Mark ticket as AI handled on first reply ──────────────────────────
    if (!ticket.ai_handled) {
      await supabase
        .from('tickets')
        .update({ ai_handled: true })
        .eq('id', ticket.id);
    }

    // ── 12. Last 10 messages for Claude ──────────────────────────────────────
    const historyForClaude = (history || []).slice(-10);

    // ── 13. Knowledge base ────────────────────────────────────────────────────
    const { data: knowledgeDocs } = await supabase
      .from('ai_knowledge_base')
      .select('title, content')
      .or(`issue_type.eq.${ticket.issue_type},issue_type.is.null`);

    const knowledgeContext = knowledgeDocs?.length
      ? knowledgeDocs.map((d: any) => `${d.title}: ${d.content}`).join('\n').slice(0, 1500)
      : '';

    // ── 14. Protocols ─────────────────────────────────────────────────────────
    const { data: protocols } = await supabase
      .from('ai_protocols')
      .select('*, ai_protocol_params(*)')
      .eq('is_active', true)
      .or(`issue_type.eq.${ticket.issue_type},issue_type.is.null`);

    // ── 15. Build Claude tools ────────────────────────────────────────────────
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
        description: p.trigger_description,
        input_schema: {
          type: 'object',
          properties: Object.keys(properties).length
            ? properties
            : { details: { type: 'string', description: 'Details' } },
          required,
        },
        _protocol: p,
      };
    });

    const claudeToolsForAPI = claudeTools.map(({ _protocol, ...tool }) => tool);

    // ── 16. System prompt ─────────────────────────────────────────────────────
    const systemPrompt = `${aiSetting.system_prompt || 'You are a helpful Markaz support agent. Be brief and reply in the same language as the reseller.'}

TICKET: ${ticket.ticket_number} | ${ticket.issue_type} | Order: ${ticket.order_id || 'N/A'} | Reseller: ${ticket.reseller_name} | Phone: ${ticket.reseller_phone}
AI replies remaining: ${3 - aiReplyCount} of 3.
${knowledgeContext ? `\nKNOWLEDGE:\n${knowledgeContext}` : ''}`;

    const conversationMessages = historyForClaude.map((m: any) => ({
      role: m.sender_type === 'agent' ? 'assistant' : 'user',
      content: m.message,
    }));

    // ── 17. Agentic loop ──────────────────────────────────────────────────────
    let loopMessages = [...conversationMessages];
    let finalReply = '';
    let toolsUsed: string[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const MAX_ITERATIONS = 3;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const claudeBody: any = {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: systemPrompt,
        messages: loopMessages,
      };

      if (claudeToolsForAPI.length > 0) claudeBody.tools = claudeToolsForAPI;

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
      if (!claudeRes.ok) throw new Error(`Claude error: ${JSON.stringify(claudeData)}`);

      totalInputTokens += claudeData.usage?.input_tokens || 0;
      totalOutputTokens += claudeData.usage?.output_tokens || 0;

      if (claudeData.stop_reason === 'tool_use') {
        loopMessages.push({ role: 'assistant', content: claudeData.content });
        const toolResults = [];

        for (const block of claudeData.content) {
          if (block.type !== 'tool_use') continue;
          const matchedTool = claudeTools.find(t => t.name === block.name);
          let resultText = 'Tool not found';

          if (matchedTool) {
            toolsUsed.push(matchedTool.name);
            resultText = await executeProtocol(matchedTool._protocol, block.input || {});

            await supabase.from('internal_notes').insert({
              ticket_id: ticket.id,
              agent_id: null,
              agent_name: 'Markaz AI',
              note_text: `🤖 ${matchedTool.name}\nParams: ${JSON.stringify(block.input)}\nResult: ${resultText.slice(0, 200)}`,
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
      finalReply = 'Unable to process. A human agent will assist shortly.';
    }

    // ── 18. Post reply ────────────────────────────────────────────────────────
    const { data: newMessage, error: msgError } = await supabase
      .from('messages')
      .insert({
        ticket_id: ticket.id,
        sender_type: 'agent',
        sender_name: 'Markaz AI',
        message: finalReply,
      })
      .select('id')
      .single();

    if (msgError) throw msgError;

    // ── 19. Check escalation — move to unassigned if escalated ────────────────
    const escalated = containsEscalation(finalReply);

    await Promise.all([
      // If escalated — mark ai_escalated, remove ai_handled so it moves to unassigned
      escalated
        ? supabase.from('tickets').update({
            ai_escalated: true,
            ai_handled: false,
          }).eq('id', ticket.id)
        : Promise.resolve(),

      supabase.from('tickets').update({
        latest_message: finalReply.slice(0, 200),
        latest_message_at: new Date().toISOString(),
        latest_message_sender: 'agent',
        status: ticket.status === 'Pending' ? 'In Progress' : ticket.status,
      }).eq('id', ticket.id),

      supabase.from('ai_logs').insert({
        ticket_id: ticket.id,
        message_id: newMessage.id,
        issue_type: ticket.issue_type,
        action_taken: toolsUsed.length ? `tools:${toolsUsed.join(',')}` : 'replied',
        response_received: finalReply.slice(0, 200),
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
      }),
    ]);

    return new Response(
      JSON.stringify({ success: true, tokens: { in: totalInputTokens, out: totalOutputTokens } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});