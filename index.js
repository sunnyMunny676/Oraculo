const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')
const fs = require('fs')
const http = require('http')

// --- 1. MOTOR DE BASE DE DATOS ---
if (!fs.existsSync('./database.json')) fs.writeFileSync('./database.json', JSON.stringify({}))
let db = JSON.parse(fs.readFileSync('./database.json'))
function saveDB() { fs.writeFileSync('./database.json', JSON.stringify(db, null, 2)) }

// Servidor para Render
http.createServer((req, res) => res.end('Oráculo Vivo')).listen(process.env.PORT || 8080)

async function conectarWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('sesion_oraculo')
    const sock = makeWASocket({ auth: state, printQRInTerminal: true })
    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0]
        if (!msg.message || msg.key.fromMe) return
        
        const from = msg.key.remoteJid
        const type = Object.keys(msg.message)[0]
        const body = (type === 'conversation') ? msg.message.conversation : (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text : ''
        
        if (!body.startsWith('.')) return
        const command = body.slice(1).trim().split(/ +/).shift().toLowerCase()
        const user = msg.key.participant || msg.key.remoteJid

        // Inicializar usuario
        if (!db[user]) db[user] = { dinero: 0, banco: 0, lastDaily: 0 }

        // --- 2. COMANDOS ---

        // Comando Servir (El que me pediste)
        if (command === 'servir') {
            db[user].dinero += 10
            saveDB()
            await sock.sendMessage(from, { text: '🍴 ¡Servicio impecable! Has ganado *10 monedas*.' })
        }

        // Comando Perfil (Para ver el dinero)
        if (command === 'perfil' || command === 'bal') {
            await sock.sendMessage(from, { text: `👤 *ESTADO:* @${user.split('@')[0]}\n💰 Dinero: ${db[user].dinero}`, mentions: [user] })
        }

        // Menú Taberna
        if (command === 'taberna') {
            await sock.sendMessage(from, { text: '📜 Usa *.servir* para ganar propinas o pide algo del menú (Próximamente).' })
        }
    })

    console.log("✅ Bot configurado. Escanea el QR en los logs de Render.")
}

conectarWhatsApp()
