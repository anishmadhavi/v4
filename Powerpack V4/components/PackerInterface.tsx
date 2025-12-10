import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Authenticate
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')
    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (userError || !user) throw new Error('Invalid user token')

    const url = new URL(req.url)
    const filename = url.searchParams.get('filename') || `video_${Date.now()}.webm`
    const contentType = url.searchParams.get('contentType') || 'video/webm'
    
    // 2. Identify Admin ID (if Packer)
    let admin_id = user.id
    const { data: profile } = await supabase.from('profiles').select('role, organization_id').eq('id', user.id).single()
    if (profile?.role === 'packer' && profile?.organization_id) {
        admin_id = profile.organization_id
    }

    // 3. Get Google Tokens & Config
    const { data: integration } = await supabase.from('integrations')
        .select('config_json')
        .eq('admin_id', admin_id)
        .eq('provider_type', 'google')
        .single()
        
    if (!integration) throw new Error('Google Drive not connected')
    const config = integration.config_json
    
    // FIX: Clean up folder ID
    let targetFolderId = config.googleFolderId;
    if (targetFolderId && typeof targetFolderId === 'string') {
        targetFolderId = targetFolderId.trim();
    } else {
        targetFolderId = null;
    }
    
    // 4. Refresh Token if needed
    let accessToken = config.access_token
    if (config.expires_at && Date.now() > config.expires_at - 300000) {
        console.log("Refreshing Token...")
        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
                client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
                refresh_token: config.refresh_token,
                grant_type: 'refresh_token',
            }),
        })
        const newTokens = await refreshRes.json()
        if (!newTokens.access_token) throw new Error('Failed to refresh Google Token')
        
        accessToken = newTokens.access_token
        // Update DB
        await supabase.from('integrations').update({
            config_json: { ...config, access_token: accessToken, expires_at: Date.now() + (newTokens.expires_in * 1000) }
        }).eq('admin_id', admin_id).eq('provider_type', 'google')
    }

    // 5. Create Resumable Session
    const metadata: any = {
        name: filename,
        mimeType: contentType
    }
    // Only add parents if valid
    if (targetFolderId) {
        metadata.parents = [targetFolderId];
    }

    const sessionRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Upload-Content-Type': contentType, 
        },
        body: JSON.stringify(metadata)
    })

    if (!sessionRes.ok) {
        const err = await sessionRes.text()
        throw new Error(`Google Session Error: ${err}`)
    }

    const uploadUrl = sessionRes.headers.get('Location')
    
    return new Response(JSON.stringify({ uploadUrl, folderId: targetFolderId }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
