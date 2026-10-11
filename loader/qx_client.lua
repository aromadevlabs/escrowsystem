--[[
    Quantix Escrow System — client loader
    Requests the protected client/shared chunks from the server and runs them
    in memory. Nothing protected is written to disk.
]]

local resource = GetCurrentResourceName()
local loaded = false

local function run(chunks)
    for _, c in ipairs(chunks or {}) do
        local fn, err = load(c.source, '@' .. resource .. '/' .. c.name, 't', _ENV)
        if not fn then
            print('^1[Quantix] client load failed for ' .. c.name .. ': ' .. tostring(err) .. '^0')
        else
            local ok, rerr = pcall(fn)
            if not ok then print('^1[Quantix] client runtime error in ' .. c.name .. ': ' .. tostring(rerr) .. '^0') end
        end
    end
end

RegisterNetEvent('qx:receiveBundle', function(data)
    if loaded then return end
    loaded = true
    run(data.shared)
    run(data.client)
end)

CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(250) end
    TriggerServerEvent('qx:requestBundle')
end)
