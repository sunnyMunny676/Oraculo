const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')

async function conectarWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('sesion_oraculo')
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0]
        if (!msg.message || msg.key.fromMe) return
        
        const texto = msg.message.conversation || msg.message.extendedTextMessage?.text
        
        if (texto === '.hola') {
            await sock.sendMessage(msg.key.remoteJid, { text: '¡Hola! Soy Oráculo, tu bot personal.' })
        }
    })

    // Mantener vivo en Render
const http = require('http');
http.createServer((req, res) => res.end('Oráculo Vivo')).listen(process.env.PORT || 8080);

    console.log("Bot encendido y esperando mensajes...")
}

conectarWhatsApp()
