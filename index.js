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

// --- ENGELLENMESİNİ İSTEDİĞİN ÖZEL KELİME LISTESİ ---
const yasakliKelimeler = [
    "*amk*", "*aq*", "*oç*", "*sg*", "*sik*", "*piç*", "*yarrak*", "*orospu*"
]; // Yıldız (*) simgeleri kelimenin cümlenin içinde geçmesini de engeller.

// --- BOT AÇILDIĞINDA ÇALIŞACAK KISIM ---
client.once('ready', async () => {
    console.log(`🚀 Bot ${client.user.tag} olarak aktif! Özel Küfür/Argo koruması çalışıyor.`);

    // Durum Yazısı
    client.user.setActivity('İstiklal Mahkemelerinde Çalışıyor');

    // --- ÖZEL KELİME LİSTELİ AUTOMOD KURULUMU ---
    try {
        const guild = client.guilds.cache.first();
        if (guild) {
            const rules = await guild.autoModerationRules.fetch();
            const existingRule = rules.find(r => r.name === 'Otomatik Küfür Filtresi');

            // Eğer eski kural varsa günceller, yoksa sıfırdan oluşturur
            if (existingRule) {
                await existingRule.edit({
                    triggerMetadata: {
                        keywordFilter: yasakliKelimeler
                    }
                });
                console.log('🛡️ Küfür Filtresi kelime listesi güncellendi!');
            } else {
                await guild.autoModerationRules.create({
                    name: 'Otomatik Küfür Filtresi',
                    creatorId: client.user.id,
                    enabled: true,
                    eventType: 1, // MessageSend
                    triggerType: 1, // Keyword (Özel Kelime Listesi)
                    triggerMetadata: {
                        keywordFilter: yasakliKelimeler
                    },
                    actions: [
                        { type: 1 } // Mesajı Göndermeyi Engelle
                    ]
                });
                console.log('🛡️ Özel Küfür ve Argo Filtresi başarıyla kuruldu!');
            }
        }
    } catch (err) {
        console.error('AutoMod kurulurken hata (Botun Sunucuyu Yönet yetkisi olmalı):', err.message);
    }
});

client.login(process.env.TOKEN);