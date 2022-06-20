const proxy = require("node-tcp-proxy")
const axios = require("axios")
const express = require("express")
const expressApp = express()

const basePort = Number.parseInt(process.env.BASE_PORT || "8000")
let deviceCount = 1
const TAILSCALE_TOKEN = process.env.TAILSCALE_TOKEN
const TAILSCALE_GET_DEVICES = "https://api.tailscale.com/api/v2/tailnet/maheshtamse.13@gmail.com/devices"

const proxyMap = {}

const osPortMapper = {
    "windows": "3389",
    "linux": "5901",
    "macos": "5901"
}

const addProxy = (device, retryCount = 3)=>{
    if(retryCount === 0)
        return

    const proxyForPort = basePort + deviceCount
    deviceCount+=1

    try {
        console.log(`Creating proxy for ${device["id"]}@${device["name"]}`)
        proxyMap[device["id"]] = {
            "port": proxyForPort,
            "proxy": proxy.createProxy(proxyForPort, device["addressV4"], osPortMapper[device["os"]]),
            "device": device
        }
    }catch (e){
        console.log(`Error creating proxy for id ${device["id"]} and name ${device["name"]}\nRetry count ${retryCount}`)
        console.error(e)
        addProxy(device, retryCount - 1)
    }
    console.log(`Proxied device ${device["id"]}@${device["name"]} on port ${proxyForPort}`)
}

const getAllProxyDevices = async ()=>{
    console.log("Fetching clients from tail scale")
    const devices = await axios.get(TAILSCALE_GET_DEVICES,{
        auth: {
            username: TAILSCALE_TOKEN,
        }
    }).catch(e=>{
        console.log("Error fetching devices from tail scale")
        console.error(e)

    })
    if(devices==null)
        return
    console.log(`Found total of ${devices.data.devices.length}\nFiltering devices`)
    const proxyDevices = Array()

    devices.data.devices.forEach(device=>{
        if(device.authorized && device.os != null && ["windows", "linux", "macos"].includes(device.os.toLowerCase())){
            proxyDevices.push({
                id: device.id || "",
                name: device.hostname || "UNKNOWN",
                addressV4: device.addresses[0] || "ERROR",
                addressV6: device.addresses[1] || "ERROR",
                os: device.os || "UNKNOWN"
            })
        }
    })
    console.log(`Filtered ${proxyDevices.length} devices to be proxied`)
    return proxyDevices
}

const exposeAdminPage =()=>{
    expressApp.listen(basePort)
    expressApp.get("/", (req, res)=>{
        let mappingToDisplay = ""
        for (const k in proxyMap) {
            const proxy = proxyMap[k]
            mappingToDisplay+= `Device name: ${proxy.device.name} exposed on ${proxy.port} \n `
        }

        res.send(`
        You can refresh the page using <a href="/refresh">refresh</a>
        <pre>
                ${mappingToDisplay}
        </pre>
        `)
    })
    expressApp.get("/refresh", async (req, res)=>{
        try {
            await main()
            res.send("Refreshed")
        }catch (e){
            res.send(JSON.stringify(e))
        }
    })

}

const main = async ()=>{
    deviceCount = 1
    for (const proxyInst in proxyMap) {
        proxyMap[proxyInst]["proxy"].end()
        delete proxyMap[proxyInst]
    }
    const proxyFor = await getAllProxyDevices()
    proxyFor.forEach(addProxy)
}



main()
exposeAdminPage()