{ default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
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

        // Inicializar usuario en la base
        if (!db[user]) db[user] = { dinero: 0, banco: 0, lastDaily: 0, streak: 0 }

        // --- 2. COMANDOS DE ECONOMÍA ---

        if (command === 'servir') {
            db[user].dinero += 10
            saveDB()
            await sock.sendMessage(from, { text: '🍴 ¡Servicio impecable! Has ganado *10 monedas*.' })
        }

        if (command === 'perfil' || command === 'bal') {
            const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
            const target = mentioned || user
            
            if (!db[target]) db[target] = { dinero: 0, banco: 0, lastDaily: 0, streak: 0 }
            
            const stats = db[target]
            const total = stats.dinero + (stats.banco || 0)
            
            let ppUrl
            try {
                ppUrl = await sock.profilePictureUrl(target, 'image')
            } catch {
                ppUrl = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png'
            }

            const perfilTexto = `👤 *PERFIL DE USUARIO*\n\n✨ *Usuario:* @${target.split('@')[0]}\n💰 *En Mano:* ${stats.dinero}\n🏦 *En Banco:* ${stats.banco || 0}\n📊 *Total:* ${total}\n🔥 *Racha:* ${stats.streak || 0} días`

            await sock.sendMessage(from, { 
                image: { url: ppUrl }, 
                caption: perfilTexto,
                mentions: [target] 
            })
        }

        // --- COMANDO PARA ADMINS: QUITAR MONEDAS ---
        if (command === 'quitar' || command === 'remover') {
            if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: '❌ Este comando solo funciona en grupos.' })

            const groupMetadata = await sock.groupMetadata(from)
            const admins = groupMetadata.participants.filter(p => p.admin).map(p => p.id)
            if (!admins.includes(user)) return await sock.sendMessage(from, { text: '❌ Solo los administradores pueden usar este comando.' })

            const mencionado = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
            const args = body.trim().split(/ +/)
            const cantidad = parseInt(args[args.length - 1])

            if (!mencionado || isNaN(cantidad)) {
                return await sock.sendMessage(from, { text: '⚠️ Uso correcto: *.quitar @usuario 50*' })
            }

            if (!db[mencionado]) db[mencionado] = { dinero: 0, banco: 0, lastDaily: 0, streak: 0 }
            db[mencionado].dinero -= cantidad
            if (db[mencionado].dinero < 0) db[mencionado].dinero = 0 
            
            saveDB()
            await sock.sendMessage(from, { 
                text: `⚖️ *JUSTICIA DIVINA:* Se le han retirado ${cantidad} monedas a @${mencionado.split('@')[0]}.`, 
                mentions: [mencionado] 
            })
        }

        // --- 3. SISTEMA DE COMBATE (PROBABILIDADES) ---
        const accionesCombate = {
            'noquear': { prob: 20, msg: '💤 ¡Has dejado inconsciente a tu oponente!' },
            'atrapar': { prob: 40, msg: '🕸️ ¡El enemigo ha quedado atrapado en tu red!' },
            'golpegrave': { prob: 35, msg: '⚔️ ¡Un impacto devastador! Sangre enemiga ha sido derramada.' },
            'envenenar': { prob: 40, msg: '🧪 ¡Veneno místico fluye por las venas de tu rival!' },
            'golpecritico': { prob: 25, msg: '💥 ¡GOLPE CRÍTICO! Has encontrado el punto débil.' },
            'intimidar': { prob: 15, msg: '👁️ Tu aura oscura ha paralizado de miedo al oponente.' },
            'pegar': { prob: 50, msg: '👊 ¡Un golpe certero y directo!' },
            'librar': { prob: 24, msg: '✨ ¡Increíble! Has logrado zafarte del ataque justo a tiempo.' }
        }

        if (accionesCombate[command]) {
            const mencion = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
            if (!mencion && command !== 'librar') {
                return await sock.sendMessage(from, { text: `❌ Debes etiquetar a alguien para usar .${command}` })
            }

            const azar = Math.floor(Math.random() * 100) + 1
            const exito = azar <= accionesCombate[command].prob
            const objetivo = mencion ? `@${mencion.split('@')[0]}` : ''

            if (exito) {
                await sock.sendMessage(from, { 
                    text: `✅ *ÉXITO (${azar}%):* ${accionesCombate[command].msg} ${objetivo}`, 
                    mentions: mencion ? [mencion] : [] 
                })
            } else {
                await sock.sendMessage(from, { 
                    text: `❌ *FALLO (${azar}%):* Intentaste usar ${command} contra ${objetivo} pero fallaste.`, 
                    mentions: mencion ? [mencion] : [] 
                })
            }
        }

        // --- 4. OTROS ---
        if (command === 'taberna') {
            await sock.sendMessage(from, { text: '📜 Usa *.servir* para ganar propinas o pide algo del menú (Próximamente).' })
        }
    })

  

conectarWhatsApp()
