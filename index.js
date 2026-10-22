const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot 7/24 Aktif!'));
app.listen(process.env.PORT || 10000, () => console.log('Web sunucusu hazır!'));

const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// --- BOT AÇILDIĞINDA ÇALIŞACAK KISIM ---
client.once('ready', async () => {
    console.log(`🚀 Bot ${client.user.tag} olarak aktif! Sadece Küfür/Argo koruması çalışıyor.`);

    // Durum Yazısı
    client.user.setActivity('İstiklal Mahkemelerinde Çalışıyor');

    // --- OTOMATİK KÜFÜR VE ARGO FİLTRESİ (AutoMod) ---
    try {
        const guild = client.guilds.cache.first();
        if (guild) {
            const rules = await guild.autoModerationRules.fetch();
            const ruleExists = rules.some(r => r.name === 'Otomatik Küfür Filtresi');

            if (!ruleExists) {
                await guild.autoModerationRules.create({
                    name: 'Otomatik Küfür Filtresi',
                    creatorId: client.user.id,
                    enabled: true,
                    eventType: 1, // MessageSend
                    triggerType: 4, // Profanity (Discord Hazır Küfür/Argo Listesi)
                    triggerMetadata: {
                        presets: [1] // Sadece Küfür ve Argo Filtresi
                    },
                    actions: [
                        { type: 1 } // Mesajı Engelle
                    ]
                });
                console.log('🛡️ Otomatik Küfür ve Argo Filtresi başarıyla kuruldu!');
            } else {
                console.log('🛡️ Otomatik Küfür Filtresi zaten aktif.');
            }
        }
    } catch (err) {
        console.error('AutoMod kurulurken hata (Botun Sunucuyu Yönet yetkisi olmalı):', err.message);
    }
});

client.login(process.env.TOKEN);