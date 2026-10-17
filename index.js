const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType, 
    PermissionFlagsBits, 
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder
} = require('discord.js');
require('dotenv').config();
const Database = require('better-sqlite3');

// Veritabanı Kurulumu (Sestop İçin)
const db = new Database('voice_stats.db');
db.exec(`CREATE TABLE IF NOT EXISTS voice_times (
    user_id TEXT PRIMARY KEY,
    total_time INTEGER DEFAULT 0
)`);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// ==========================================
// --- AYARLAR (Kendi ID'lerinle Doldur) ---
// ==========================================
const HOŞGELDIN_KANAL_ID = "1561114090250707034"; 
const OTO_ROL_ID = "1522564705434996746";         

const TICKET_KANAL_ID = "1561114682121519194"; 
const TICKET_KATEGORI_ID = "1561118040160993422"; 
const YETKILI_ROL_ID = "1522617208134435027";  

// Hafıza Yönetimi (Çekiliş ve Ses Takibi)
const activeGiveaways = new Map();
const voiceJoinTimes = new Map();

// --- SLASH KOMUTLARINI TANIMLAMA (/çekiliş ve /sestop) ---
const commands = [
    new SlashCommandBuilder()
        .setName('çekiliş')
        .setDescription('Sunucuda çekiliş başlatır')
        .addStringOption(option => 
            option.setName('süre').setDescription('Süre (Örn: 10s, 5m, 1h)').setRequired(true))
        .addStringOption(option => 
            option.setName('ödül').setDescription('Çekiliş ödülü nedir?').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('sestop')
        .setDescription('Ses kanallarında en çok duran ilk 10 kişiyi listeler')
].map(command => command.toJSON());

// --- BOT AÇILDIGINDA ÇALIŞACAK KISIM ---
client.once('ready', async () => {
    console.log(`🚀 Bot ${client.user.tag} olarak tüm sistemleriyle aktif!`);
client.user.setActivity('İstiklal Mahkemelerinde Çalışıyor');
    // Slash Komutlarını Discord'a Yükleme
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('✨ Slash komutları (/çekiliş ve /sestop) yüklendi!');
    } catch (error) {
        console.error("Komut yükleme hatası:", error);
    }

    // Ticket Panelini Otomatik Gönderme
    const ticketKanal = client.channels.cache.get(TICKET_KANAL_ID);
    if (ticketKanal) {
        const messages = await ticketKanal.messages.fetch({ limit: 10 });
        if (messages.size === 0) {
            const embed = new EmbedBuilder()
                .setTitle("🛠️ Destek & Başvuru Merkezi")
                .setDescription("Lütfen açmak istediğiniz talep türünü aşağıdaki butonlardan seçiniz. Yetkililerimiz en kısa sürede ilgilenecektir.")
                .setColor("Blue");

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_ekipalim').setLabel('Ekip Alım').setEmoji('🤝').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('ticket_partnerlik').setLabel('Partnerlik').setEmoji('🌐').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('ticket_reklam').setLabel('Reklam').setEmoji('📢').setStyle(ButtonStyle.Secondary)
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_merge').setLabel('Merge / Ally').setEmoji('🔗').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('ticket_genel').setLabel('Genel Destek').setEmoji('📩').setStyle(ButtonStyle.Primary)
            );

            await ticketKanal.send({ embeds: [embed], components: [row1, row2] });
        }
    }
});

// --- 1. WELCOMER & OTO-ROL SİSTEMİ ---
client.on('guildMemberAdd', async (member) => {
    const rol = member.guild.roles.cache.get(OTO_ROL_ID);
    if (rol) member.roles.add(rol).catch(console.error);

    const kanal = member.guild.channels.cache.get(HOŞGELDIN_KANAL_ID);
    if (kanal) {
        kanal.send(`🎉 Sunucumuza hoş geldin ${member}! Seninle beraber **${member.guild.memberCount}** kişi olduk!`);
    }
});

client.on('guildMemberRemove', async (member) => {
    const kanal = member.guild.channels.cache.get(HOŞGELDIN_KANAL_ID);
    if (kanal) {
        const kullaniciAdi = member.user ? member.user.displayName : "Bir üye";
        kanal.send(`📤 **${kullaniciAdi}** sunucumuzdan ayrıldı. Kalan kişi sayısı: **${member.guild.memberCount}**.`);
    }
});

// --- 2. SESTOP (SES KANAL TAKİBİ) ---
client.on('voiceStateUpdate', (oldState, newState) => {
    const userId = newState.member.id;

    if (!oldState.channelId && newState.channelId) {
        voiceJoinTimes.set(userId, Date.now());
    }

    if (oldState.channelId && !newState.channelId) {
        const joinTime = voiceJoinTimes.get(userId);
        if (joinTime) {
            const duration = Math.floor((Date.now() - joinTime) / 1000);
            voiceJoinTimes.delete(userId);

            const row = db.prepare(`SELECT total_time FROM voice_times WHERE user_id = ?`).get(userId);
            if (row) {
                db.prepare(`UPDATE voice_times SET total_time = total_time + ? WHERE user_id = ?`).run(duration, userId);
            } else {
                db.prepare(`INSERT INTO voice_times (user_id, total_time) VALUES (?, ?)`).run(userId, duration);
            }
        }
    }
});

// --- 3. INTERACTION HANDLER (TICKET, ÇEKİLİŞ, SESTOP) ---
client.on('interactionCreate', async (interaction) => {
    
    // A) SLASH KOMUTLARI (/çekiliş ve /sestop)
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'çekiliş') {
            const sureStr = interaction.options.getString('süre');
            const odul = interaction.options.getString('ödül');

            let ms = 0;
            if (sureStr.endsWith('s')) ms = parseInt(sureStr) * 1000;
            else if (sureStr.endsWith('m')) ms = parseInt(sureStr) * 60 * 1000;
            else if (sureStr.endsWith('h')) ms = parseInt(sureStr) * 60 * 60 * 1000;
            else return interaction.reply({ content: 'Geçersiz süre! Örn: `10s`, `5m`, `1h`', ephemeral: true });

            const bitisZamani = Math.floor((Date.now() + ms) / 1000);

            const embed = new EmbedBuilder()
                .setTitle("🎉 ÇEKİLİŞ BAŞLADI! 🎉")
                .setDescription(`Ödül: **${odul}**\nBitiş: <t:${bitisZamani}:R>\n\nKatılmak için aşağıdaki 🎉 butonuna basın!`)
                .setColor("Gold");

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('giveaway_join').setLabel('Katıl (0)').setEmoji('🎉').setStyle(ButtonStyle.Primary)
            );

            await interaction.reply({ content: "Çekiliş başlatıldı!", ephemeral: true });
            const mesaj = await interaction.channel.send({ embeds: [embed], components: [row] });

            const katilimcilar = new Set();
            activeGiveaways.set(mesaj.id, katilimcilar);

            setTimeout(async () => {
                activeGiveaways.delete(mesaj.id);
                const kazananlarListesi = Array.from(katilimcilar);

                if (kazananlarListesi.length === 0) {
                    return mesaj.edit({ content: `🎉 Çekiliş bitti: **${odul}**\nKatılım olmadığı için kazanan çıkmadı!`, components: [] });
                }

                const kazananID = kazananlarListesi[Math.floor(Math.random() * kazananlarListesi.length)];
                const kazananEmbed = new EmbedBuilder()
                    .setTitle("🎉 ÇEKİLİŞ SONUÇLANDI 🎉")
                    .setDescription(`Ödül: **${odul}**\n🏆 Kazanan: <@${kazananID}>! Tebrikler!`)
                    .setColor("Green");

                await mesaj.edit({ embeds: [kazananEmbed], components: [] });
                await mesaj.reply(`Tebrikler <@${kazananID}>! **${odul}** kazandın! 🥳`);
            }, ms);
        }

        if (interaction.commandName === 'sestop') {
            await interaction.deferReply();
            const rows = db.prepare(`SELECT user_id, total_time FROM voice_times ORDER BY total_time DESC LIMIT 10`).all();

            if (!rows || rows.length === 0) return interaction.editReply("Henüz ses verisi kaydedilmemiş!");

            let listeMetni = "";
            let sira = 1;
            for (const row of rows) {
                const user = await client.users.fetch(row.user_id).catch(() => null);
                const userName = user ? user.tag : "Bilinmeyen Üye";
                const saat = Math.floor(row.total_time / 3600);
                const dakika = Math.floor((row.total_time % 3600) / 60);
                const saniye = row.total_time % 60;
                const sureYazisi = `${saat > 0 ? `${saat}s ` : ''}${dakika > 0 ? `${dakika}d ` : ''}${saniye}sn`;
                const madalya = sira === 1 ? '🥇' : sira === 2 ? '🥈' : sira === 3 ? '🥉' : '🔹';
                listeMetni += `${madalya} **${sira}.** ${userName} — **${sureYazisi}**\n`;
                sira++;
            }

            const embed = new EmbedBuilder()
                .setTitle("🎙️ Ses Sıralaması (Top 10)")
                .setDescription(listeMetni)
                .setColor("Purple");

            await interaction.editReply({ embeds: [embed] });
        }
    }

    // B) BUTON ETKİLEŞİMLERİ (Çekiliş Katılım & Ticket Aç/Kapat)
    if (!interaction.isButton()) return;

    // Çekilişe Katılma
    if (interaction.customId === 'giveaway_join') {
        const katilimcilar = activeGiveaways.get(interaction.message.id);
        if (!katilimcilar) return interaction.reply({ content: 'Bu çekiliş sona ermiş!', ephemeral: true });

        if (katilimcilar.has(interaction.user.id)) {
            katilimcilar.delete(interaction.user.id);
            const yeniRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('giveaway_join').setLabel(`Katıl (${katilimcilar.size})`).setEmoji('🎉').setStyle(ButtonStyle.Primary)
            );
            await interaction.message.edit({ components: [yeniRow] });
            return interaction.reply({ content: 'Çekilişten ayrıldın.', ephemeral: true });
        } else {
            katilimcilar.add(interaction.user.id);
            const yeniRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('giveaway_join').setLabel(`Katıl (${katilimcilar.size})`).setEmoji('🎉').setStyle(ButtonStyle.Primary)
            );
            await interaction.message.edit({ components: [yeniRow] });
            return interaction.reply({ content: 'Çekilişe başarıyla katıldın! 🍀', ephemeral: true });
        }
    }

    // Ticket Açma
    if (interaction.customId.startsWith('ticket_') && interaction.customId !== 'ticket_kapat') {
        await interaction.deferReply({ ephemeral: true });

        const tür = interaction.customId.split('_')[1];
        let turAdi = "Genel Destek";
        if (tür === 'ekipalim') turAdi = "Ekip Alım";
        if (tür === 'partnerlik') turAdi = "Partnerlik";
        if (tür === 'reklam') turAdi = "Reklam";
        if (tür === 'merge') turAdi = "Merge / Ally";

        const mevcutKanal = interaction.guild.channels.cache.find(c => c.name === `ticket-${interaction.user.username.toLowerCase()}`);
        if (mevcutKanal) return interaction.editReply({ content: `Zaten açık bir talebiniz var: ${mevcutKanal}` });

        const kanal = await interaction.guild.channels.create({
            name: `ticket-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: TICKET_KATEGORI_ID,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                { id: YETKILI_ROL_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            ],
        });

        const embed = new EmbedBuilder()
            .setTitle(`🎫 Talep Türü: ${turAdi}`)
            .setDescription(`Merhaba ${interaction.user}, talebiniz oluşturuldu. Yetkililerimiz birazdan ilgilenecektir.`)
            .setColor("Green");

        const kapatButon = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_kapat').setLabel('Talebi Kapat').setEmoji('🔒').setStyle(ButtonStyle.Danger)
        );

        await kanal.send({ content: `<@&${YETKILI_ROL_ID}> | ${interaction.user}`, embeds: [embed], components: [kapatButon] });
        await interaction.editReply({ content: `Destek talebiniz oluşturuldu: ${kanal}` });
    }

    // Ticket Kapatma (Kanal Silme Garantili)
    if (interaction.customId === 'ticket_kapat') {
        await interaction.reply("Destek talebi 3 saniye içinde kapatılıyor...");
        setTimeout(async () => {
            try {
                await interaction.channel.delete();
            } catch (err) {
                console.error("Kanal silinirken hata oluştu:", err);
            }
        }, 3000);
    }
});

client.login(process.env.TOKEN);
