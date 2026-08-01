const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const sharp = require('sharp');
const axios = require('axios');

// Inicializa o cliente para o ambiente estável do Railway
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        executablePath: '/usr/bin/chromium',
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--no-zygote',
            '--single-process'
        ]
    }
});

const PREFIX = '.';

// Evento de geração do QR Code
client.on('qr', (qr) => {
    console.log('\n==================================================================');
    console.log('🔗 SEU QR CODE GERADO COM SUCESSO!');
    console.log('==================================================================\n');
    
    // 🌌 MÉTODO 1: Link direto para abrir no navegador (Edge, Chrome, etc.)
    const linkImagemUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
    
    console.log('👉 COPIE E ABRA O LINK ABAIXO NO SEU NAVEGADOR PARA ESCANEAR:');
    console.log(`\n${linkImagemUrl}\n`);
    
    console.log('------------------------------------------------------------------');
    console.log('🌌 MÉTODO 2: QR Code em texto ultra-compacto (se o seu console alinhar):');
    qrcodeTerminal.generate(qr, { small: true });
    console.log('==================================================================\n');
});

client.on('ready', () => {
    console.log('\n🚀🚀🚀 PROCESSO CONCLUÍDO! Bot Tomioka está Oficialmente Online e Conectado! 🚀🚀🚀\n');
});

client.on('message', async (msg) => {
    // Pega o texto se for mensagem de texto pura ou legenda de imagem/vídeo
    const textoMensagem = msg.body || msg.caption || '';

    if (!textoMensagem.startsWith(PREFIX)) return;

    const chat = await msg.getChat();
    const args = textoMensagem.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const restOfText = args.join(' ');

    // 0. MENU
    if (command === 'menu' || command === 'help' || command === 'comandos') {
        let menuTexto = `🤖 *BOT FIGURINHAS TOMIOKA* 🤖

*💟 FIGURINHAS*
🔹 *.s* ou *.sticker* -> Cria figurinha de imagem, GIF ou vídeo.
🔹 *.img* -> Transforma figurinha em imagem.
🔹 *.clone [Nome]* -> Altera apenas o nome da figurinha.

*📥 DOWNLOADS*
🔹 *.ttk <link>* -> Baixa vídeo do TikTok.
🔹 *.ig <link>* -> Baixa vídeo do Instagram.

*⚡ UTILITÁRIOS*
🔹 *.p* ou *.ping* -> Mostra o tempo de resposta do bot.`;

        if (chat.isGroup) {
            menuTexto += `\n\n*🛡️ ADMINISTRAÇÃO*
🔹 *.ban* -> Bane o usuário (responda ou marque).
🔹 *.adm* -> Promove a Administrator (responda ou marque).`;
        }

        menuTexto += `\n\n🤖 _Use sempre o ponto inicial para enviar comandos!_`;
        await chat.sendMessage(menuTexto);
    }

    // ======= COMANDOS DE GRUPO =======
    if (chat.isGroup) {
        const participantes = chat.participants;
        const extrairNumero = (idSerialized) => idSerialized.split('@')[0];

        const remetenteNumero = extrairNumero(msg.author || msg.from);
        const botNumero = extrairNumero(client.info.wid._serialized);

        const obterStatusAdmin = (numeroPuro) => {
            const p = participantes.find(part => extrairNumero(part.id._serialized) === numeroPuro);
            return p ? (p.isAdmin || p.isSuperAdmin) : false;
        };

        if (command === 'ban') {
            const autorStatusAdmin = obterStatusAdmin(remetenteNumero);
            const botStatusAdmin = obterStatusAdmin(botNumero);

            if (!autorStatusAdmin) return msg.reply('❌ Você precisa ser Admin do grupo para usar este comando.');
            if (!botStatusAdmin) return msg.reply('❌ Eu preciso ser Admin do grupo para banir alguém.');

            let usuarioParaBanir = null;

            if (msg.hasQuotedMsg) {
                const quotedMsg = await msg.getQuotedMessage();
                usuarioParaBanir = quotedMsg.author || quotedMsg.from;
            } else if (msg.mentionedIds.length > 0) {
                usuarioParaBanir = msg.mentionedIds[0]._serialized || msg.mentionedIds[0];
            }

            if (usuarioParaBanir) {
                try {
                    await chat.removeParticipants([usuarioParaBanir]);
                    msg.reply('🔨 Usuário banido com sucesso!');
                } catch (err) {
                    msg.reply('❌ Erro ao tentar remover o participante.');
                }
            } else {
                msg.reply('📌 Responda à mensagem de alguém ou mencione usando @ para banir.');
            }
        }

        if (command === 'adm') {
            const autorStatusAdmin = obterStatusAdmin(remetenteNumero);
            const botStatusAdmin = obterStatusAdmin(botNumero);

            if (!autorStatusAdmin) return msg.reply('❌ Você precisa ser Admin para usar este comando.');
            if (!botStatusAdmin) return msg.reply('❌ Eu preciso ser Admin para promover alguém.');

            let usuarioParaPromover = null;

            if (msg.hasQuotedMsg) {
                const quotedMsg = await msg.getQuotedMessage();
                usuarioParaPromover = quotedMsg.author || quotedMsg.from;
            } else if (msg.mentionedIds.length > 0) {
                usuarioParaPromover = msg.mentionedIds[0]._serialized || msg.mentionedIds[0];
            }

            if (usuarioParaPromover) {
                try {
                    await chat.promoteParticipants([usuarioParaPromover]);
                    msg.reply('👑 Novo administrador promovido!');
                } catch (err) {
                    msg.reply('❌ Não consegui promover este usuário.');
                }
            } else {
                msg.reply('📌 Responda à mensagem de alguém ou mencione usando @ para dar admin.');
            }
        }
    }

    // ======= COMANDOS DE FIGURINHA =======
    if (command === 's' || command === 'sticker') {
        let targetMsg = msg;
        if (msg.hasQuotedMsg) {
            targetMsg = await msg.getQuotedMessage();
        }

        if (targetMsg.hasMedia) {
            try {
                const media = await targetMsg.downloadMedia();
                const imageBuffer = Buffer.from(media.data, 'base64');

                // 🔧 Força quadrado 512x512 cortando excesso
                const squaredBuffer = await sharp(imageBuffer)
                    .resize(512, 512, {
                        fit: 'cover',       // corta para caber no quadrado sem distorcer
                        position: 'centre'  // centraliza o corte
                    })
                    .webp()
                    .toBuffer();

                const squaredMedia = new MessageMedia(
                    'image/webp',
                    squaredBuffer.toString('base64'),
                    'sticker.webp'
                );

                await chat.sendMessage(squaredMedia, {
                    sendMediaAsSticker: true,
                    stickerName: 'Bot de figurinhas Tomioka',
                    stickerAuthor: '\u200B'
                });
            } catch (err) {
                console.error(err);
                msg.reply('❌ Erro ao processar figurinha.');
            }
        } else {
            msg.reply('📌 Envie ou responda a uma imagem/vídeo/gif com *.s*');
        }
    }

    if (command === 'img' || command === 'imagem') {
        if (msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage();
            if (quotedMsg.hasMedia && quotedMsg.type === 'sticker') {
                try {
                    const media = await quotedMsg.downloadMedia();
                    const imageBuffer = Buffer.from(media.data, 'base64');
                    const jpegBuffer = await sharp(imageBuffer).jpeg().toBuffer();
                    const newMedia = new MessageMedia('image/jpeg', jpegBuffer.toString('base64'), 'imagem.jpg');
                    await chat.sendMessage(newMedia);
                } catch (err) {
                    msg.reply('❌ Erro na conversão.');
                }
            }
        } else {
            msg.reply('📌 Responda a uma figurinha com *.img*');
        }
    }

    if (command === 'clone' || command === 'pack') {
        if (msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage();
            if (quotedMsg.hasMedia && quotedMsg.type === 'sticker') {
                try {
                    const media = await quotedMsg.downloadMedia();
                    let novoNome = restOfText.trim();
                    
                    if (!novoNome) {
                        const contato = await msg.getContact();
                        novoNome = contato.pushname || contato.name || 'Tomioka Bot';
                    }

                    await chat.sendMessage(media, {
                        sendMediaAsSticker: true,
                        stickerName: novoNome,
                        stickerAuthor: '\u200B'
                    });
                } catch (err) {
                    msg.reply('❌ Erro ao clonar.');
                }
            } else {
                msg.reply('📌 Você precisa marcar uma figurinha.');
            }
        } else {
            msg.reply('📌 Responda a uma figurinha com *.clone Nome* ou apenas *.clone*');
        }
    }

    // ======= DOWNLOADS REVISADOS =======
    if (command === 'ttk' || command === 'tiktok') {
        if (!restOfText) return msg.reply('📌 Uso correto: *.ttk <link do tiktok>*');
        try {
            msg.reply('⏳ Buscando vídeo do TikTok...');
            const response = await axios.get(`https://api.agatz.xyz/api/tiktok?url=${encodeURIComponent(restOfText)}`);
            
            if (response.data && response.data.data && response.data.data.data) {
                const videoUrl = response.data.data.data;
                const media = await MessageMedia.fromUrl(videoUrl);
                await chat.sendMessage(media, { caption: '✅ TikTok baixado!' });
            } else {
                msg.reply('❌ Não consegui baixar este link.');
            }
        } catch (err) {
            msg.reply('❌ Erro ao acessar o servidor do TikTok.');
        }
    }

    if (command === 'ig' || command === 'instagram') {
        if (!restOfText) return msg.reply('📌 Uso correto: *.ig <link do reels>*');
        try {
            msg.reply('⏳ Buscando mídia do Instagram...');
            const response = await axios.get(`https://api.agatz.xyz/api/instagram?url=${encodeURIComponent(restOfText)}`);
            
            if (response.data && response.data.data && response.data.data[0] && response.data.data[0].url) {
                const mediaUrl = response.data.data[0].url;
                const media = await MessageMedia.fromUrl(mediaUrl);
                await chat.sendMessage(media, { caption: '✅ Instagram baixado!' });
            } else {
                msg.reply('❌ Não consegui obter o vídeo.');
            }
        } catch (err) {
            msg.reply('❌ Erro ao processar o link do Instagram.');
        }
    }

    if (command === 'p' || command === 'ping') {
        const timestampInicial = msg.timestamp * 1000;
        const timestampFinal = Date.now();
        const ping = timestampFinal - timestampInicial;
        await msg.reply(`🏓 *Pong!* \n⚡ Tempo de resposta: \`${ping}ms\``);
    }
});

client.initialize();