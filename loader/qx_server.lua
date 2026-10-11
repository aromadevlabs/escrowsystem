--[[
    Quantix Escrow System — server loader
    Validates the license and loads the protected server/shared code into memory.
    The protected source never touches the buyer's disk.
]]

local endpoint = GetConvar('qx_endpoint', '')
local license  = GetConvar('qx_license', '')
local resource = GetCurrentResourceName()

local sharedChunks = {}  -- cached to hand to clients

local function fail(msg)
    print('^1[Quantix] ' .. msg .. '^0')
    print('^1[Quantix] Resource "' .. resource .. '" will not start.^0')
end

local function serverFingerprint()
    return {
        license   = license,
        resource  = resource,
        sv_license = GetConvar('sv_licenseKey', ''):sub(1, 8),  -- never send the full key
        endpoint_token = GetConvar('qx_token', ''),
        players   = GetConvar('sv_maxclients', '0'),
        version   = GetConvarInt('qx_av', 1),
    }
end

local function run(chunks, env)
    for _, c in ipairs(chunks) do
        local fn, err = load(c.source, '@' .. resource .. '/' .. c.name, 't', _ENV)
        if not fn then
            fail('Failed to load ' .. c.name .. ': ' .. tostring(err))
        else
            local ok, rerr = pcall(fn)
            if not ok then fail('Runtime error in ' .. c.name .. ': ' .. tostring(rerr)) end
        end
    end
end

CreateThread(function()
    if endpoint == '' or license == '' then
        fail('Missing license. Add "exec @' .. resource .. '/license.cfg" to your server.cfg.')
        return
    end

    local done = false
    PerformHttpRequest(endpoint .. '/api/runtime/bundle', function(status, body)
        done = true
        if status ~= 200 then
            local reason = 'HTTP ' .. tostring(status)
            if body and body ~= '' then
                local ok, j = pcall(json.decode, body)
                if ok and j and j.error then reason = j.error end
            end
            fail('License check failed: ' .. reason)
            return
        end
        local data = json.decode(body)
        if not data or not data.ok then
            fail('License rejected: ' .. (data and data.error or 'unknown'))
            return
        end

        sharedChunks = data.shared or {}
        _QX_CLIENT = data.client or {}
        run(data.shared or {})
        run(data.server or {})
        print('^2[Quantix] ' .. resource .. ' license OK — protected code loaded.^0')

        -- periodic re-check; revoking the license stops the resource on next restart
        if data.recheck and data.recheck > 0 then
            SetTimeout(data.recheck * 1000, function() end)
        end
    end, 'POST', json.encode(serverFingerprint()), { ['Content-Type'] = 'application/json' })

    SetTimeout(15000, function()
        if not done then fail('No response from the Quantix server. Check qx_endpoint and your network.') end
    end)
end)

-- Hand the protected client+shared chunks to a client that asks (after it is spawned).
RegisterNetEvent('qx:requestBundle', function()
    local src = source
    TriggerClientEvent('qx:receiveBundle', src, { shared = sharedChunks, client = _QX_CLIENT or {} })
end)
